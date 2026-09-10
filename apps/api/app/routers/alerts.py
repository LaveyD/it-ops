"""告警路由：列表 + 确认 + 按天统计。"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Alert, Device
from ..routers.auth import get_current_user
from ..schemas import AlertDailyCount, AlertOut

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("/stats", response_model=list[AlertDailyCount])
def alert_stats(days: int = Query(7, ge=1, le=30), db: Session = Depends(get_db), user: str = Depends(get_current_user)):
    """近 N 天按天 × 等级聚合（堆叠柱数据源），缺 0 的天补零。"""
    today = datetime.now(timezone.utc).date()
    t_from = datetime.combine(today - timedelta(days=days - 1), datetime.min.time(), tzinfo=timezone.utc)
    day_expr = func.date(Alert.created_at)
    rows = db.execute(
        select(day_expr, Alert.level, func.count())
        .where(Alert.created_at >= t_from)
        .group_by(day_expr, Alert.level)
    ).all()
    out: dict[str, AlertDailyCount] = {
        (today - timedelta(days=i)).isoformat(): AlertDailyCount(date=(today - timedelta(days=i)).isoformat())
        for i in range(days - 1, -1, -1)
    }
    for d, lv, c in rows:
        ds = d.isoformat() if hasattr(d, "isoformat") else str(d)
        if ds in out and lv in ("info", "warn", "crit"):
            setattr(out[ds], lv, c)
    return list(out.values())


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
