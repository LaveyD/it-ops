"""设备路由：列表（含 referenced_by）/ 详情 / 指标 / 动作占位 + M7 CRUD/批量改状态。"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..models import Alert, Cabinet, Device, DeviceMetric, Location, Topology, TopologyNodeDevice, User
from ..operators import get_operator
from ..routers.auth import get_current_user
from ..schemas import (DeviceBatchStatusReq, DeviceCreateReq, DeviceDetail, DeviceOut,
                       DeviceUpdateReq, MetricSeries, ReferencedBy)
from ..security import require_role

router = APIRouter(prefix="/api/devices", tags=["devices"])

# 允许查询的指标白名单
METRICS = ("cpu", "memory", "net_in", "net_out")


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _check_refs(db: Session, req: DeviceCreateReq | DeviceUpdateReq) -> None:
    """location_id / cabinet_id 存在性校验。"""
    if req.location_id is not None and db.get(Location, req.location_id) is None:
        raise HTTPException(422, "location 不存在")
    if req.cabinet_id is not None and db.get(Cabinet, req.cabinet_id) is None:
        raise HTTPException(422, "cabinet 不存在")


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


@router.post("/batch-status", response_model=dict)
def batch_status(req: DeviceBatchStatusReq, request: Request,
                 user: User = Depends(require_role("admin", "operator")),
                 db: Session = Depends(get_db)):
    """批量改状态；ids 中不存在的跳过并回报。"""
    found = set(db.execute(select(Device.id).where(Device.id.in_(req.ids))).scalars())
    missing = sorted(set(req.ids) - found)
    for d in db.execute(select(Device).where(Device.id.in_(found))).scalars():
        d.status = req.status
    db.commit()
    audit.write_audit(user.username, "device_batch_status", target_type="device",
                      target_id=",".join(sorted(found)),
                      detail={"status": req.status, "missing": missing}, ip=_ip(request))
    return {"updated": len(found), "missing": missing}


@router.post("", response_model=DeviceOut, status_code=201)
def create_device(req: DeviceCreateReq, request: Request,
                  user: User = Depends(require_role("admin", "operator")),
                  db: Session = Depends(get_db)):
    if db.get(Device, req.id) is not None:
        raise HTTPException(409, "设备 ID 已存在")
    _check_refs(db, req)
    d = Device(id=req.id, name=req.name, type=req.type, ip=req.ip, status=req.status,
               location=req.location, location_id=req.location_id,
               cabinet_id=req.cabinet_id, u_start=req.u_start,
               owner=req.owner, extra=req.extra)
    db.add(d)
    db.commit()
    db.refresh(d)
    audit.write_audit(user.username, "device_create", target_type="device",
                      target_id=req.id, ip=_ip(request))
    return DeviceOut.model_validate(d)


@router.put("/{device_id}", response_model=DeviceOut)
def update_device(device_id: str, req: DeviceUpdateReq, request: Request,
                  user: User = Depends(require_role("admin", "operator")),
                  db: Session = Depends(get_db)):
    d = db.get(Device, device_id)
    if d is None:
        raise HTTPException(404, "设备不存在")
    _check_refs(db, req)
    data = req.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(d, k, v)
    db.commit()
    db.refresh(d)
    item = DeviceOut.model_validate(d)
    item.referenced_by = _referenced_by(db, d.id)
    audit.write_audit(user.username, "device_update", target_type="device",
                      target_id=device_id, detail=data, ip=_ip(request))
    return item


@router.delete("/{device_id}", status_code=204)
def delete_device(device_id: str, request: Request,
                  user: User = Depends(require_role("admin", "operator")),
                  db: Session = Depends(get_db)):
    d = db.get(Device, device_id)
    if d is None:
        raise HTTPException(404, "设备不存在")
    # topology_node_device.device_id 由 FK ondelete SET NULL 自动置空（保留节点，只解绑）
    # alert.device_id 由 FK CASCADE 连带清理
    db.delete(d)
    db.commit()
    audit.write_audit(user.username, "device_delete", target_type="device",
                      target_id=device_id, ip=_ip(request))


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
