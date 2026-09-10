"""首页概览聚合：一次拿全顶部统计 + 业务系统 + 拓扑版本 + 设备指标 TOP N。"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Alert, BizSystem, Device, DeviceMetric, Topology
from ..routers.auth import get_current_user
from ..schemas import BizSystemOut, DeviceTopItem, OverviewOut

router = APIRouter(prefix="/api/overview", tags=["overview"])


@router.get("", response_model=OverviewOut)
def overview(db: Session = Depends(get_db), user: str = Depends(get_current_user)):
    device_count = int(db.scalar(select(func.count()).select_from(Device)) or 0)
    abnormal = int(db.scalar(select(func.count()).select_from(Device).where(Device.status != "normal")) or 0)
    online_rate = round((device_count - abnormal) / device_count, 4) if device_count else 1.0

    rows = db.execute(
        select(Alert.level, func.count()).where(Alert.acked.is_(False)).group_by(Alert.level)
    ).all()
    counts: dict[str, int] = {lv: int(c) for lv, c in rows}
    unacked = int(db.scalar(select(func.count()).select_from(Alert).where(Alert.acked.is_(False))) or 0)

    topo = db.scalar(select(Topology).where(Topology.is_active.is_(True)))
    biz = db.execute(select(BizSystem)).scalars().all()

    return OverviewOut(
        device_count=device_count,
        online_rate=online_rate,
        alert_counts={"info": counts.get("info", 0), "warn": counts.get("warn", 0), "crit": counts.get("crit", 0)},
        unacked_alerts=unacked,
        biz_systems=[BizSystemOut.model_validate(b) for b in biz],
        topology={"id": topo.id, "name": topo.name, "version": topo.version} if topo else None,
    )


@router.get("/top", response_model=list[DeviceTopItem])
def device_top(
    metric: str = "cpu",
    n: int = Query(10, ge=1, le=50),
    window_hours: int = Query(1, ge=1, le=72),
    db: Session = Depends(get_db),
    user: str = Depends(get_current_user),
):
    """各设备最近一条指定指标值降序 TOP N（卡片⑥数据源）。"""
    t_from = datetime.now(timezone.utc) - timedelta(hours=window_hours)
    # 子查询：每设备窗口内最新指标点 (device_id, max_ts, value)
    latest = (
        select(
            DeviceMetric.device_id,
            func.max(DeviceMetric.ts).label("max_ts"),
        )
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
    return [DeviceTopItem(device_id=did, name=name, metric=metric, value=float(v)) for did, name, v in rows]
