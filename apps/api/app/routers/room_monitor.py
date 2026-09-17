"""机房环境/动环监测路由。

接入契约（真实源 EMQ/动环网关/Zabbix 的写入入口）：
    POST /api/room-monitor/report   —— 批量上报 {room, metric, value, source?, ts?}
查询端与前端不感知数据来源，真源接入后查询/展示完全不变：
    GET  /api/room-monitor/latest   —— 每个机房每个 metric 的最新值
    GET  /api/room-monitor/history  —— 单机房单 metric 的时间序列
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from ..db import get_db
from ..models import Room, RoomMetric, User
from ..routers.auth import get_current_user
from ..schemas import (RoomMetricLatestOut, RoomMetricReportReq,
                       RoomMetricReportResp)

router = APIRouter(prefix="/api/room-monitor", tags=["room-monitor"])


@router.post("/report", response_model=RoomMetricReportResp)
def report(req: RoomMetricReportReq, db=Depends(get_db), user: User = Depends(get_current_user)):
    """真实源批量上报。room 按机房名匹配（不存在则跳过并计数）；source 缺省 external。"""
    room_ids = dict(db.execute(select(Room.name, Room.id)).all())
    now = datetime.now(timezone.utc)
    accepted = skipped = 0
    for it in req.items:
        rid = room_ids.get(it.room)
        if rid is None:
            skipped += 1
            continue
        ts = it.ts or now
        db.add(RoomMetric(room_id=rid, metric=it.metric, value=it.value,
                          source=it.source or "external", ts=ts))
        accepted += 1
    db.commit()
    return RoomMetricReportResp(accepted=accepted, skipped=skipped)


@router.get("/latest", response_model=list[RoomMetricLatestOut])
def latest(db=Depends(get_db), user: User = Depends(get_current_user)):
    """每个机房每个 metric 的最新值（窗口子查询取 max(ts) 再 join 回值）。"""
    latest_ts = (
        select(RoomMetric.room_id, RoomMetric.metric,
               func.max(RoomMetric.ts).label("max_ts"))
        .group_by(RoomMetric.room_id, RoomMetric.metric)
        .subquery()
    )
    rows = db.execute(
        select(Room.id, Room.name, RoomMetric.metric, RoomMetric.value,
               RoomMetric.source, RoomMetric.ts)
        .select_from(Room)
        .join(latest_ts, latest_ts.c.room_id == Room.id)
        .join(RoomMetric,
              (RoomMetric.room_id == Room.id)
              & (RoomMetric.metric == latest_ts.c.metric)
              & (RoomMetric.ts == latest_ts.c.max_ts))
        .order_by(Room.id, RoomMetric.metric)
    ).all()
    return [
        RoomMetricLatestOut(room_id=rid, room_name=rname, metric=metric,
                            value=float(value), source=source, ts=ts)
        for (rid, rname, metric, value, source, ts) in rows
    ]


@router.get("/history")
def history(
    room: str = Query(..., description="机房名"),
    metric: str = Query(..., description="metric 名，如 temperature"),
    hours: int = Query(1, ge=1, le=72),
    db=Depends(get_db), user: User = Depends(get_current_user),
):
    """单机房单 metric 近 N 小时时间序列（升序）。机房不存在返回 404。"""
    room_row = db.scalar(select(Room).where(Room.name == room))
    if room_row is None:
        raise HTTPException(404, f"机房不存在: {room}")
    t_from = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = db.execute(
        select(RoomMetric.ts, RoomMetric.value)
        .where(RoomMetric.room_id == room_row.id,
               RoomMetric.metric == metric,
               RoomMetric.ts >= t_from)
        .order_by(RoomMetric.ts.asc())
    ).all()
    return [{"ts": ts.isoformat(), "value": float(v)} for ts, v in rows]
