"""首页概览聚合：一次拿全顶部统计 + 业务系统 + 拓扑版本。"""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Alert, BizSystem, Device, Topology
from ..routers.auth import get_current_user
from ..schemas import BizSystemOut, OverviewOut

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
