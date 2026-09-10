"""拓扑路由：版本管理 + 保存（含 deviceId 校验 + 关联物化）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Device, Topology, TopologyNodeDevice
from ..routers.auth import get_current_user
from ..schemas import TopologySaveReq, TopologyVersionItem

router = APIRouter(prefix="/api/topology", tags=["topology"])


def _validate_canvas(canvas: dict) -> list[str]:
    """结构校验，返回错误信息列表。"""
    errs = []
    if not isinstance(canvas.get("nodes"), list) or not canvas.get("nodes"):
        errs.append("canvas.nodes 必须是非空数组")
    if not isinstance(canvas.get("links"), list):
        errs.append("canvas.links 必须是数组")
    ids = set()
    for i, n in enumerate(canvas.get("nodes") or []):
        nid = n.get("id")
        if not nid:
            errs.append(f"nodes[{i}] 缺少 id")
        elif nid in ids:
            errs.append(f"nodes[{i}] id 重复: {nid}")
        ids.add(nid)
    for i, l in enumerate(canvas.get("links") or []):
        if l.get("source") not in ids or l.get("target") not in ids:
            errs.append(f"links[{i}] 引用了不存在的节点: {l.get('source')} -> {l.get('target')}")
    return errs


def _node_device_ids(canvas: dict) -> dict[str, str]:
    """node_id -> deviceId（来自 node.properties.deviceId）。"""
    out = {}
    for n in canvas.get("nodes") or []:
        dev = (n.get("properties") or {}).get("deviceId")
        if n.get("id") and dev:
            out[n["id"]] = dev
    return out


@router.get("/active")
def get_active(db: Session = Depends(get_db), user: str = Depends(get_current_user)):
    topo = db.scalar(select(Topology).where(Topology.is_active.is_(True)))
    if topo is None:
        raise HTTPException(404, "暂无生效拓扑")
    devs = {d.id: {"id": d.id, "name": d.name, "status": d.status, "ip": d.ip}
            for d in db.execute(select(Device)).scalars()}
    return {"id": topo.id, "name": topo.name, "version": topo.version,
            "canvas": topo.canvas, "devices": devs}


@router.get("/versions", response_model=list[TopologyVersionItem])
def list_versions(db: Session = Depends(get_db), user: str = Depends(get_current_user)):
    return db.execute(select(Topology).order_by(Topology.id.desc())).scalars().all()


@router.get("/{topo_id}")
def get_version(topo_id: int, db: Session = Depends(get_db), user: str = Depends(get_current_user)):
    topo = db.get(Topology, topo_id)
    if topo is None:
        raise HTTPException(404, "版本不存在")
    return {"id": topo.id, "name": topo.name, "version": topo.version,
            "is_active": topo.is_active, "updated_at": topo.updated_at, "canvas": topo.canvas}


@router.post("", response_model=TopologyVersionItem)
def save_topology(req: TopologySaveReq, db: Session = Depends(get_db), user: str = Depends(get_current_user)):
    errs = _validate_canvas(req.canvas)
    if errs:
        raise HTTPException(422, {"detail": "canvas 校验失败", "errors": errs})

    # 设备存在性校验
    node_dev = _node_device_ids(req.canvas)
    if node_dev:
        existing = {i for i in db.execute(select(Device.id)).scalars()}
        missing = sorted(set(node_dev.values()) - existing)
        if missing:
            raise HTTPException(422, {"detail": "关联设备不存在", "missing_devices": missing})

    # 版本递增 + 首次保存自动激活
    latest = db.scalar(select(Topology).order_by(Topology.version.desc()).limit(1))
    has_active = db.scalar(select(Topology.id).where(Topology.is_active.is_(True)))
    topo = Topology(
        name=req.name or (latest.name if latest else "默认拓扑"),
        canvas=req.canvas,
        version=(latest.version + 1) if latest else 1,
        is_active=has_active is None,
    )
    db.add(topo)
    db.flush()

    # 物化关联
    db.execute(delete(TopologyNodeDevice).where(TopologyNodeDevice.topology_id == topo.id))
    for node_id, device_id in node_dev.items():
        db.add(TopologyNodeDevice(topology_id=topo.id, node_id=node_id, device_id=device_id))

    db.commit()
    db.refresh(topo)
    return topo


@router.post("/{topo_id}/activate", response_model=TopologyVersionItem)
def activate(topo_id: int, db: Session = Depends(get_db), user: str = Depends(get_current_user)):
    topo = db.get(Topology, topo_id)
    if topo is None:
        raise HTTPException(404, "版本不存在")
    # 先清旧 active 再设新 active：两条 UPDATE 必须分两个批次执行，
    # 否则 SQLAlchemy 合并为单次 executemany，SET TRUE 可能先于 SET FALSE，
    # 撞部分唯一索引 ux_topology_active（仅 is_active=TRUE 唯一）
    for t in db.execute(select(Topology).where(Topology.is_active.is_(True))).scalars():
        if t.id != topo.id:
            t.is_active = False
    db.flush()
    topo.is_active = True
    db.commit()
    db.refresh(topo)
    return topo
