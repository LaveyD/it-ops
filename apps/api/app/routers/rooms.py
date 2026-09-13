"""机房/机柜路由：机房 CRUD + 机柜 CRUD + 三维场景聚合。"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..models import Cabinet, Device, Location, Room, User
from ..schemas import CabinetOut, CabinetReq, RoomOut, RoomReq, RoomSceneCabinet, RoomSceneDevice, RoomSceneOut
from ..security import get_current_user, require_role

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


# ===== 机房 CRUD =====
@router.get("", response_model=list[RoomOut])
def list_rooms(_u: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(Room).order_by(Room.id)).scalars().all()


@router.post("", response_model=RoomOut, status_code=201)
def create_room(req: RoomReq, request: Request,
                user: User = Depends(require_role("admin", "operator")),
                db: Session = Depends(get_db)):
    if db.scalar(select(Room).where(Room.name == req.name)) is not None:
        raise HTTPException(409, "机房名已存在")
    if req.location_id is not None and db.get(Location, req.location_id) is None:
        raise HTTPException(422, "location 不存在")
    room = Room(name=req.name, location_id=req.location_id, rows=req.rows, cols=req.cols, remark=req.remark)
    db.add(room)
    db.commit()
    db.refresh(room)
    audit.write_audit(user.username, "room_create", target_type="room", target_id=str(room.id), ip=_ip(request))
    return room


@router.put("/{room_id}", response_model=RoomOut)
def update_room(room_id: int, req: RoomReq, request: Request,
                user: User = Depends(require_role("admin", "operator")),
                db: Session = Depends(get_db)):
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(404, "机房不存在")
    clash = db.scalar(select(Room).where(Room.name == req.name, Room.id != room_id))
    if clash is not None:
        raise HTTPException(409, "机房名已存在")
    if req.location_id is not None and db.get(Location, req.location_id) is None:
        raise HTTPException(422, "location 不存在")
    room.name, room.location_id, room.rows, room.cols, room.remark = (
        req.name, req.location_id, req.rows, req.cols, req.remark)
    db.commit()
    db.refresh(room)
    audit.write_audit(user.username, "room_update", target_type="room", target_id=str(room_id), ip=_ip(request))
    return room


@router.delete("/{room_id}", status_code=204)
def delete_room(room_id: int, request: Request,
                user: User = Depends(require_role("admin", "operator")),
                db: Session = Depends(get_db)):
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(404, "机房不存在")
    n_cab = db.scalar(select(func.count()).select_from(Cabinet).where(Cabinet.room_id == room_id))
    if n_cab:
        raise HTTPException(409, f"机房下有 {n_cab} 个机柜，请先删除机柜")
    db.delete(room)
    db.commit()
    audit.write_audit(user.username, "room_delete", target_type="room", target_id=str(room_id), ip=_ip(request))


# ===== 机柜 CRUD（挂在机房下）=====
@router.get("/{room_id}/cabinets", response_model=list[CabinetOut])
def list_cabinets(room_id: int, _u: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.get(Room, room_id) is None:
        raise HTTPException(404, "机房不存在")
    return db.execute(select(Cabinet).where(Cabinet.room_id == room_id)
                      .order_by(Cabinet.row, Cabinet.col)).scalars().all()


@router.post("/{room_id}/cabinets", response_model=CabinetOut, status_code=201)
def create_cabinet(room_id: int, req: CabinetReq, request: Request,
                   user: User = Depends(require_role("admin", "operator")),
                   db: Session = Depends(get_db)):
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(404, "机房不存在")
    if req.row > room.rows or req.col > room.cols:
        raise HTTPException(422, f"行列越界：机房为 {room.rows} 行 × {room.cols} 列")
    clash = db.scalar(select(Cabinet).where(Cabinet.room_id == room_id, Cabinet.name == req.name))
    if clash is not None:
        raise HTTPException(409, "该机柜房内机柜名已存在")
    cab = Cabinet(room_id=room_id, name=req.name, row=req.row, col=req.col,
                  u_height=req.u_height, status=req.status)
    db.add(cab)
    db.commit()
    db.refresh(cab)
    audit.write_audit(user.username, "cabinet_create", target_type="cabinet",
                      target_id=str(cab.id), ip=_ip(request))
    return cab


@router.put("/cabinets/{cabinet_id}", response_model=CabinetOut)
def update_cabinet(cabinet_id: int, req: CabinetReq, request: Request,
                   user: User = Depends(require_role("admin", "operator")),
                   db: Session = Depends(get_db)):
    cab = db.get(Cabinet, cabinet_id)
    if cab is None:
        raise HTTPException(404, "机柜不存在")
    room = db.get(Room, cab.room_id)
    if room is None:
        raise HTTPException(404, "所属机房不存在")
    if req.row > room.rows or req.col > room.cols:
        raise HTTPException(422, f"行列越界：机房为 {room.rows} 行 × {room.cols} 列")
    clash = db.scalar(select(Cabinet).where(Cabinet.room_id == cab.room_id,
                                            Cabinet.name == req.name, Cabinet.id != cabinet_id))
    if clash is not None:
        raise HTTPException(409, "该机柜房内机柜名已存在")
    cab.name, cab.row, cab.col, cab.u_height, cab.status = (
        req.name, req.row, req.col, req.u_height, req.status)
    db.commit()
    db.refresh(cab)
    audit.write_audit(user.username, "cabinet_update", target_type="cabinet",
                      target_id=str(cabinet_id), ip=_ip(request))
    return cab


@router.delete("/cabinets/{cabinet_id}", status_code=204)
def delete_cabinet(cabinet_id: int, request: Request,
                   user: User = Depends(require_role("admin", "operator")),
                   db: Session = Depends(get_db)):
    cab = db.get(Cabinet, cabinet_id)
    if cab is None:
        raise HTTPException(404, "机柜不存在")
    # 设备 cabinet_id 由 FK ondelete SET NULL 自动置空
    db.delete(cab)
    db.commit()
    audit.write_audit(user.username, "cabinet_delete", target_type="cabinet",
                      target_id=str(cabinet_id), ip=_ip(request))


# ===== 三维场景聚合 =====
@router.get("/{room_id}/scene", response_model=RoomSceneOut)
def room_scene(room_id: int, _u: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """三维机房渲染一次取全：机房几何 + 机柜矩阵 + 每柜 U 位设备（按 u_start 升序）。"""
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(404, "机房不存在")
    cabs = db.execute(select(Cabinet).where(Cabinet.room_id == room_id)
                      .order_by(Cabinet.row, Cabinet.col)).scalars().all()
    cab_ids = [c.id for c in cabs]
    devices = db.execute(select(Device).where(Device.cabinet_id.in_(cab_ids))
                         .order_by(Device.cabinet_id, Device.u_start.asc().nullslast(),
                                   Device.id)).scalars().all() if cab_ids else []
    by_cab: dict[int, list[RoomSceneDevice]] = {cid: [] for cid in cab_ids}
    for d in devices:
        if d.cabinet_id is None:
            continue
        by_cab[d.cabinet_id].append(RoomSceneDevice(id=d.id, name=d.name, type=d.type,
                                                    status=d.status, u_start=d.u_start, ip=d.ip))
    return RoomSceneOut(
        room={"id": room.id, "name": room.name, "rows": room.rows, "cols": room.cols,
              "location_id": room.location_id, "remark": room.remark},
        cabinets=[RoomSceneCabinet(id=c.id, name=c.name, row=c.row, col=c.col,
                                   u_height=c.u_height, status=c.status,
                                   devices=by_cab[c.id]) for c in cabs],
    )
