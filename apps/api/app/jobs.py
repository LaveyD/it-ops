"""后台采集任务：collector → 写库 → WS 广播。

每轮采集产生至多一条合并广播消息：
{"type":"feed_update",
 "statuses":  [{"id","name","status"}, ...],           # 设备状态变更
 "alerts":    [AlertOut 全字段, ...],                   # 本轮新告警（含 device_name）
 "top":       {"metric":"cpu", "items":[{device_id,name,value}, ...]} | null}
空轮（无任何新增）不广播。
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select

from .collectors import get_collector
from .config import get_settings
from .db import SessionLocal
from .models import Alert, Device, DeviceMetric
from .ws import hub

log = logging.getLogger("it-ops.jobs")

# 单例复用 collector：mock 的随机游走状态（上轮指标值）跨轮保持，曲线才平滑
_collector = None
# 定期清理上次执行时间（进程内状态；重启后按保留期幂等再清一次，无副作用）
_last_prune: datetime | None = None
PRUNE_INTERVAL_HOURS = 6


def prune_old_data(db, alert_retention_days: int | None = None,
                   metric_retention_days: int | None = None) -> dict:
    """删除超过保留期的告警与指标。返回 {"alerts": n, "metrics": n}。

    独立于 run_collection 导出，便于测试直接调用；jobs 循环每
    PRUNE_INTERVAL_HOURS 触发一次。两表均有 created_at/ts 索引，
    大批量 DELETE 按主键批量提交（PG 对 ctid 扫描 + 索引删除足够快，
    百万行级别单次约秒级）。
    """
    s = get_settings()
    ad = s.alert_retention_days if alert_retention_days is None else alert_retention_days
    md = s.metric_retention_days if metric_retention_days is None else metric_retention_days
    now = datetime.now(timezone.utc)
    ra = db.execute(delete(Alert).where(
        Alert.created_at < now - timedelta(days=ad))).rowcount
    rm = db.execute(delete(DeviceMetric).where(
        DeviceMetric.ts < now - timedelta(days=md))).rowcount
    db.commit()
    if ra or rm:
        log.info("prune: 清理过期告警 %d 条 / 指标 %d 条", ra, rm)
    return {"alerts": int(ra or 0), "metrics": int(rm or 0)}


def _top_cpu(db, metric: str = "cpu", n: int = 10, window_hours: int = 1):
    """各设备窗口内最新 metric 值降序 TOP N（与 GET /api/overview/top 同逻辑）。"""
    t_from = datetime.now(timezone.utc) - timedelta(hours=window_hours)
    latest = (
        select(DeviceMetric.device_id, func.max(DeviceMetric.ts).label("max_ts"))
        .where(DeviceMetric.metric == metric, DeviceMetric.ts >= t_from)
        .group_by(DeviceMetric.device_id)
        .subquery()
    )
    rows = (
        db.execute(
            select(Device.id, Device.name, DeviceMetric.value)
            .select_from(Device)
            .join(latest, latest.c.device_id == Device.id)
            .join(
                DeviceMetric,
                (DeviceMetric.device_id == Device.id)
                & (DeviceMetric.ts == latest.c.max_ts)
                & (DeviceMetric.metric == metric),
            )
            .order_by(DeviceMetric.value.desc())
            .limit(n)
        )
        .all()
    )
    return [{"device_id": did, "name": name, "value": float(v)} for did, name, v in rows]


async def run_collection() -> None:
    global _collector, _last_prune
    db = SessionLocal()
    try:
        dev_ids = [i for i in db.execute(select(Device.id)).scalars()]
        if not dev_ids:
            return
        # 定期清理过期数据（每 6h 一次；mock 指标 ~4.6 万行/天、告警按新速率
        # ~345 条/天，不清理表无限膨胀）
        now = datetime.now(timezone.utc)
        if _last_prune is None or now - _last_prune >= timedelta(hours=PRUNE_INTERVAL_HOURS):
            try:
                prune_old_data(db)
                _last_prune = now
            except Exception:
                log.exception("prune 失败（忽略，下轮重试）")
                db.rollback()
        if _collector is None:
            _collector = get_collector(dev_ids)
        batch = _collector.collect()
        if not any(batch.values()):
            return

        # 记录提交前最大告警 id，提交后取回本轮新增（id/created_at 已生成）
        prev_max = db.scalar(select(func.max(Alert.id))) or 0

        for m in batch["metrics"]:
            # aware UTC datetime（与 seed 一致；naive 字符串会被 PG 按本机时区解释，
            # 在东八区机器上所有新数据 ts 早 8h，窗口查询查不到）
            db.add(DeviceMetric(device_id=m["device_id"], metric=m["metric"],
                                ts=datetime.fromtimestamp(m["ts"], tz=timezone.utc),
                                value=m["value"]))
        for a in batch["alerts"]:
            db.add(Alert(device_id=a.get("device_id"), level=a["level"],
                         title=a["title"], detail=a.get("detail")))
        for st in batch["statuses"]:
            d = db.get(Device, st["device_id"])
            if d:
                d.status = st["status"]
        db.commit()

        payload: dict = {"type": "feed_update"}

        if batch["statuses"]:
            rows = db.execute(select(Device).where(Device.id.in_(
                [st["device_id"] for st in batch["statuses"]]))).scalars()
            payload["statuses"] = [{"id": d.id, "name": d.name, "status": d.status} for d in rows]

        if batch["alerts"]:
            new_rows = (db.execute(select(Alert).where(Alert.id > prev_max)
                                   .order_by(Alert.id)).scalars().all())
            names = {d.id: d.name for d in db.execute(select(Device)).scalars()}
            payload["alerts"] = [
                {"id": a.id, "device_id": a.device_id,
                 "device_name": names.get(a.device_id) if a.device_id else None,
                 "level": a.level, "title": a.title, "detail": a.detail,
                 "created_at": a.created_at, "acked": a.acked}
                for a in new_rows
            ]

        if batch["metrics"]:
            payload["top"] = {"metric": "cpu", "items": _top_cpu(db)}

        await hub.broadcast(payload)
    finally:
        db.close()
