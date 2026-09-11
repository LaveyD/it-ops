"""区域/位置注册表路由。"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..models import Location, User
from ..schemas import LocationOut, LocationReq
from ..security import get_current_user, require_role

router = APIRouter(prefix="/api/locations", tags=["locations"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("", response_model=list[LocationOut])
def list_locations(_u: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(Location).order_by(Location.id)).scalars().all()


@router.post("", response_model=LocationOut, status_code=201)
def create_location(req: LocationReq, request: Request,
                    user: User = Depends(require_role("admin", "operator")),
                    db: Session = Depends(get_db)):
    if db.scalar(select(Location).where(Location.name == req.name)) is not None:
        raise HTTPException(409, "名称已存在")
    loc = Location(name=req.name, zone_type=req.zone_type, remark=req.remark)
    db.add(loc)
    db.commit()
    db.refresh(loc)
    audit.write_audit(user.username, "location_create", target_type="location",
                      target_id=req.name, ip=_ip(request))
    return loc


@router.put("/{location_id}", response_model=LocationOut)
def update_location(location_id: int, req: LocationReq, request: Request,
                    user: User = Depends(require_role("admin", "operator")),
                    db: Session = Depends(get_db)):
    loc = db.get(Location, location_id)
    if loc is None:
        raise HTTPException(404, "位置不存在")
    clash = db.scalar(select(Location).where(Location.name == req.name, Location.id != location_id))
    if clash is not None:
        raise HTTPException(409, "名称已存在")
    loc.name = req.name
    loc.zone_type = req.zone_type
    loc.remark = req.remark
    db.commit()
    db.refresh(loc)
    audit.write_audit(user.username, "location_update", target_type="location",
                      target_id=str(location_id), ip=_ip(request))
    return loc


@router.delete("/{location_id}", status_code=204)
def delete_location(location_id: int, request: Request,
                    user: User = Depends(require_role("admin", "operator")),
                    db: Session = Depends(get_db)):
    loc = db.get(Location, location_id)
    if loc is None:
        raise HTTPException(404, "位置不存在")
    db.delete(loc)
    db.commit()
    audit.write_audit(user.username, "location_delete", target_type="location",
                      target_id=str(location_id), ip=_ip(request))
