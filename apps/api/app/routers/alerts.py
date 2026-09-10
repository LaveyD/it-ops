"""告警路由：列表 + 确认。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Alert, Device
from ..routers.auth import get_current_user
from ..schemas import AlertOut

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertOut])
def list_alerts(
    level: str | None = None,
    unacked: bool | None = None,
    device_id: str | None = None,
    limit: int = Query(50, le=500),
    db: Session = Depends(get_db),
    user: str = Depends(get_current_user),
):
    stmt = select(Alert)
    if level:
        stmt = stmt.where(Alert.level == level)
    if unacked is not None:
        stmt = stmt.where(Alert.acked == unacked)
    if device_id:
        stmt = stmt.where(Alert.device_id == device_id)
    rows = db.execute(stmt.order_by(Alert.created_at.desc()).limit(limit)).scalars().all()
    names = {d.id: d.name for d in db.execute(select(Device)).scalars()}
    out = []
    for a in rows:
        item = AlertOut.model_validate(a)
        item.device_name = names.get(a.device_id) if a.device_id else None
        out.append(item)
    return out


@router.post("/{alert_id}/ack", response_model=AlertOut)
def ack(alert_id: int, db: Session = Depends(get_db), user: str = Depends(get_current_user)):
    a = db.get(Alert, alert_id)
    if a is None:
        raise HTTPException(404, "告警不存在")
    a.acked = True
    db.commit()
    db.refresh(a)
    return AlertOut.model_validate(a)
