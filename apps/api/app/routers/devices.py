"""设备路由：列表（含 referenced_by）/ 详情 / 指标 / 动作占位。"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Alert, Device, DeviceMetric, Topology, TopologyNodeDevice, User
from ..operators import get_operator
from ..routers.auth import get_current_user
from ..schemas import DeviceDetail, DeviceOut, MetricSeries, ReferencedBy

router = APIRouter(prefix="/api/devices", tags=["devices"])

# 允许查询的指标白名单
METRICS = ("cpu", "memory", "net_in", "net_out")


def _referenced_by(db: Session, device_id: str) -> list[ReferencedBy]:
    rows = db.execute(
        select(TopologyNodeDevice, Topology.id, Topology.name)
        .join(Topology, Topology.id == TopologyNodeDevice.topology_id)
        .where(TopologyNodeDevice.device_id == device_id)
    ).all()
    # node_label 从 topology canvas 里取
    out = []
    for tnd, _tid, tname in rows:
        topo = db.get(Topology, tnd.topology_id)
        label = tnd.node_id
        if topo is not None:
            for n in (topo.canvas.get("nodes") or []):
                if n.get("id") == tnd.node_id:
                    label = n.get("label") or tnd.node_id
                    break
        out.append(ReferencedBy(topology_id=tnd.topology_id, topology_name=tname,
                                node_id=tnd.node_id, node_label=label))
    return out


@router.get("", response_model=list[DeviceOut])
def list_devices(
    status: str | None = None,
    type: str | None = None,
    location: str | None = None,
    q: str | None = Query(None, description="名称模糊"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Device)
    if status:
        stmt = stmt.where(Device.status == status)
    if type:
        stmt = stmt.where(Device.type == type)
    if location:
        stmt = stmt.where(Device.location == location)
    if q:
        stmt = stmt.where(Device.name.ilike(f"%{q}%"))
    devs = db.execute(stmt).scalars().all()
    out = []
    for d in devs:
        item = DeviceOut.model_validate(d)
        item.referenced_by = _referenced_by(db, d.id)
        out.append(item)
    return out


@router.get("/{device_id}", response_model=DeviceDetail)
def device_detail(device_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = db.get(Device, device_id)
    if d is None:
        raise HTTPException(404, "设备不存在")
    item = DeviceDetail.model_validate(d)
    item.referenced_by = _referenced_by(db, d.id)
    # 最新指标
    latest = {}
    for m in METRICS:
        v = db.scalar(select(DeviceMetric.value).where(
            DeviceMetric.device_id == device_id, DeviceMetric.metric == m
        ).order_by(DeviceMetric.ts.desc()).limit(1))
        if v is not None:
            latest[m] = v
    item.latest_metrics = latest
    # 最近 10 条告警
    alerts = db.execute(select(Alert).where(Alert.device_id == device_id)
                        .order_by(Alert.created_at.desc()).limit(10)).scalars().all()
    item.recent_alerts = [
        {"id": a.id, "level": a.level, "title": a.title, "detail": a.detail,
         "created_at": a.created_at, "acked": a.acked}
        for a in alerts
    ]
    return item


@router.get("/{device_id}/metrics", response_model=list[MetricSeries])
def device_metrics(
    device_id: str,
    metric: str = Query("cpu", description="逗号分隔多个"),
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    step: int | None = Query(None, ge=5, le=3600, description="采样步长（秒）"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if db.get(Device, device_id) is None:
        raise HTTPException(404, "设备不存在")
    wanted = [m.strip() for m in metric.split(",") if m.strip()]
    now = datetime.now(timezone.utc)
    t_from = (datetime.fromisoformat(from_) if from_ else now - timedelta(hours=1))
    t_to = datetime.fromisoformat(to) if to else now
    out = []
    for m in wanted:
        if m not in METRICS:
            raise HTTPException(400, f"不支持的指标: {m}（可选: {', '.join(METRICS)}）")
        rows = db.execute(
            select(DeviceMetric.ts, DeviceMetric.value)
            .where(DeviceMetric.device_id == device_id,
                   DeviceMetric.metric == m,
                   DeviceMetric.ts >= t_from, DeviceMetric.ts <= t_to)
            .order_by(DeviceMetric.ts.asc())
        ).all()
        pts = [[ts.isoformat(), v] for ts, v in rows]
        if step and len(pts) > 500:
            pts = pts[::max(1, len(pts) // 500)]
        out.append(MetricSeries(metric=m, points=pts))
    return out


@router.post("/{device_id}/actions/{action}")
def device_action(
    device_id: str,
    action: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if db.get(Device, device_id) is None:
        raise HTTPException(404, "设备不存在")
    op = get_operator()
    if not op.can(action):
        # 审计：动作尝试
        db.add(Alert(device_id=device_id, level="info",
                     title=f"[action] {action} 执行失败",
                     detail=op.execute(device_id, action).get("message", "")))
        db.commit()
        raise HTTPException(501, "操作能力待 collector/operator 接入")
    result = op.execute(device_id, action)
    db.add(Alert(device_id=device_id, level="info", title=f"[action] {action} 执行成功",
                 detail=result.get("message", "")))
    db.commit()
    return result
