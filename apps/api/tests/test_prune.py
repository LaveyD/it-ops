"""数据保留策略：prune_old_data 清理过期告警/指标（M+ 打磨 A3）。"""
import uuid
from datetime import datetime, timedelta, timezone

from app.db import SessionLocal
from app.jobs import prune_old_data
from app.models import Alert, Device, DeviceMetric


def _utc(dt_delta: timedelta) -> datetime:
    return datetime.now(timezone.utc) + dt_delta


def test_prune_removes_expired_keeps_recent():
    db = SessionLocal()
    try:
        dev = db.query(Device).first()
        assert dev is not None
        tag = uuid.uuid4().hex[:8]
        # 过期（20 天前）+ 新鲜（1 小时前）各一条告警；指标同
        old_a = Alert(device_id=dev.id, level="info", title=f"prune-{tag}-old",
                      created_at=_utc(timedelta(days=-20)))
        new_a = Alert(device_id=dev.id, level="info", title=f"prune-{tag}-new",
                      created_at=_utc(timedelta(hours=-1)))
        old_m = DeviceMetric(device_id=dev.id, metric="cpu", value=1.0,
                             ts=_utc(timedelta(days=-20)))
        new_m = DeviceMetric(device_id=dev.id, metric="cpu", value=1.0,
                             ts=_utc(timedelta(hours=-1)))
        db.add_all([old_a, new_a, old_m, new_m])
        db.commit()

        res = prune_old_data(db, alert_retention_days=7, metric_retention_days=7)
        assert res["alerts"] >= 1 and res["metrics"] >= 1

        got_a = {a.title for a in db.query(Alert).filter(Alert.title.like(f"prune-{tag}%"))}
        got_m = db.query(DeviceMetric).filter(
            DeviceMetric.id.in_([old_m.id, new_m.id])).count()
        assert f"prune-{tag}-new" in got_a
        assert f"prune-{tag}-old" not in got_a
        assert got_m == 1  # 仅剩新指标

        # 清理自造数据，避免污染
        db.query(Alert).filter(Alert.title.like(f"prune-{tag}%")).delete()
        db.query(DeviceMetric).filter(DeviceMetric.id == new_m.id).delete()
        db.commit()
    finally:
        db.close()


def test_prune_large_retention_keeps_all():
    db = SessionLocal()
    try:
        # 超长保留期：现存数据（均 <30 天）应全部保留，仅验证返回结构
        res = prune_old_data(db, alert_retention_days=3650, metric_retention_days=3650)
        assert set(res) == {"alerts", "metrics"}
        assert res["alerts"] == 0 and res["metrics"] == 0
    finally:
        db.close()
