"""拓扑路由：版本管理 + 保存 + 改名/删除 + 派生链路（M8）。

权限：读（active/versions/get/links）任意登录；写（save/activate/rename/delete）admin|operator。
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..models import Device, Topology, TopologyNodeDevice, User
from ..routers.auth import get_current_user
from ..schemas import TopologyRenameReq, TopologySaveReq, TopologyVersionItem
from ..security import require_role

router = APIRouter(prefix="/api/topology", tags=["topology"])

STATUS_RANK = {"normal": 0, "warn": 1, "alert": 2}


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


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


def _device_map(db: Session) -> dict[str, dict]:
    return {d.id: {"id": d.id, "name": d.name, "status": d.status, "ip": d.ip}
            for d in db.execute(select(Device)).scalars()}


@router.get("/active")
def get_active(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    topo = db.scalar(select(Topology).where(Topology.is_active.is_(True)))
    if topo is None:
        raise HTTPException(404, "暂无生效拓扑")
    return {"id": topo.id, "name": topo.name, "version": topo.version,
            "canvas": topo.canvas, "devices": _device_map(db)}


@router.get("/active/links")
def active_links(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """派生链路台账（只读）：展开 active 拓扑 canvas.links。

    每条链路：两端节点 + 各自关联设备 + 链路状态 = 两端设备最差状态
    （两端都未关联 → unmanaged；一端异常则整条按最差算）。
    单一事实来源是拓扑 canvas，不另建 connection 表。
    """
    topo = db.scalar(select(Topology).where(Topology.is_active.is_(True)))
    if topo is None:
        raise HTTPException(404, "暂无生效拓扑")
    devices = _device_map(db)
    canvas = topo.canvas or {}
    nodes = {n["id"]: n for n in canvas.get("nodes") or [] if n.get("id")}
    out = []
    for l in canvas.get("links") or []:
        s, t = l.get("source"), l.get("target")
        sn, tn = nodes.get(s), nodes.get(t)
        if not sn or not tn:
            continue  # 结构校验已拦，防御性跳过
        sdev_id = (sn.get("properties") or {}).get("deviceId") or ""
        tdev_id = (tn.get("properties") or {}).get("deviceId") or ""
        sdev = devices.get(sdev_id) if sdev_id else None
        tdev = devices.get(tdev_id) if tdev_id else None
        # 链路状态 = 两端已关联设备的「最差状态」；未关联视为 unmanaged 不参与比较，
        # 两端都未关联 → unmanaged。
        s_stat = sdev["status"] if sdev else "unmanaged"
        t_stat = tdev["status"] if tdev else "unmanaged"
        cands = [st for st in (s_stat, t_stat) if st in STATUS_RANK]
        link_stat = max(cands, key=lambda x: STATUS_RANK[x]) if cands else "unmanaged"
        out.append({
            "source": {"node_id": s, "label": sn.get("label") or s,
                       "device": sdev, "device_status": s_stat},
            "target": {"node_id": t, "label": tn.get("label") or t,
                       "device": tdev, "device_status": t_stat},
            "label": l.get("label") or "",
            "status": link_stat,
        })
    return {"topology_id": topo.id, "name": topo.name, "version": topo.version, "links": out}


@router.get("/versions", response_model=list[TopologyVersionItem])
def list_versions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.execute(select(Topology).order_by(Topology.id.desc())).scalars().all()


@router.get("/{topo_id}")
def get_version(topo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    topo = db.get(Topology, topo_id)
    if topo is None:
        raise HTTPException(404, "版本不存在")
    return {"id": topo.id, "name": topo.name, "version": topo.version,
            "is_active": topo.is_active, "updated_at": topo.updated_at, "canvas": topo.canvas}


@router.post("", response_model=TopologyVersionItem)
def save_topology(req: TopologySaveReq, request: Request,
                  user: User = Depends(require_role("admin", "operator")),
                  db: Session = Depends(get_db)):
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
    audit.write_audit(user.username, "topology_save", target_type="topology",
                      target_id=str(topo.id), detail={"version": topo.version}, ip=_ip(request))
    return topo


@router.post("/{topo_id}/activate", response_model=TopologyVersionItem)
def activate(topo_id: int, request: Request,
             user: User = Depends(require_role("admin", "operator")),
             db: Session = Depends(get_db)):
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
    audit.write_audit(user.username, "topology_activate", target_type="topology",
                      target_id=str(topo.id), ip=_ip(request))
    return topo


@router.put("/{topo_id}", response_model=TopologyVersionItem)
def rename_topology(topo_id: int, req: TopologyRenameReq, request: Request,
                    user: User = Depends(require_role("admin", "operator")),
                    db: Session = Depends(get_db)):
    topo = db.get(Topology, topo_id)
    if topo is None:
        raise HTTPException(404, "版本不存在")
    topo.name = req.name
    db.commit()
    db.refresh(topo)
    audit.write_audit(user.username, "topology_rename", target_type="topology",
                      target_id=str(topo_id), detail={"name": req.name}, ip=_ip(request))
    return topo


@router.delete("/{topo_id}", status_code=204)
def delete_topology(topo_id: int, request: Request,
                    user: User = Depends(require_role("admin", "operator")),
                    db: Session = Depends(get_db)):
    topo = db.get(Topology, topo_id)
    if topo is None:
        raise HTTPException(404, "版本不存在")
    if topo.is_active:
        raise HTTPException(409, "生效版本不可删除，请先激活其他版本")
    db.delete(topo)  # topology_node_device 由 FK CASCADE 清理
    db.commit()
    audit.write_audit(user.username, "topology_delete", target_type="topology",
                      target_id=str(topo_id), ip=_ip(request))
