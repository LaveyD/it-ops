"""业务系统路由：M7 起支持 CRUD（写操作 admin/operator）。"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..models import BizSystem, User
from ..routers.auth import get_current_user
from ..schemas import BizSystemOut, BizSystemReq
from ..security import require_role

router = APIRouter(prefix="/api/biz-systems", tags=["biz-systems"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("", response_model=list[BizSystemOut])
def list_biz(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.execute(select(BizSystem).order_by(BizSystem.id)).scalars().all()


@router.post("", response_model=BizSystemOut, status_code=201)
def create_biz(req: BizSystemReq, request: Request,
               user: User = Depends(require_role("admin", "operator")),
               db: Session = Depends(get_db)):
    if db.scalar(select(BizSystem).where(BizSystem.name == req.name)) is not None:
        raise HTTPException(409, "名称已存在")
    b = BizSystem(name=req.name, owner=req.owner, status=req.status,
                  sla_target=req.sla_target, sla_actual=req.sla_actual)
    db.add(b)
    db.commit()
    db.refresh(b)
    audit.write_audit(user.username, "biz_create", target_type="biz_system",
                      target_id=str(b.id), ip=_ip(request))
    return b


@router.put("/{biz_id}", response_model=BizSystemOut)
def update_biz(biz_id: int, req: BizSystemReq, request: Request,
               user: User = Depends(require_role("admin", "operator")),
               db: Session = Depends(get_db)):
    b = db.get(BizSystem, biz_id)
    if b is None:
        raise HTTPException(404, "业务系统不存在")
    clash = db.scalar(select(BizSystem).where(BizSystem.name == req.name, BizSystem.id != biz_id))
    if clash is not None:
        raise HTTPException(409, "名称已存在")
    b.name, b.owner, b.status = req.name, req.owner, req.status
    b.sla_target, b.sla_actual = req.sla_target, req.sla_actual
    db.commit()
    db.refresh(b)
    audit.write_audit(user.username, "biz_update", target_type="biz_system",
                      target_id=str(biz_id), ip=_ip(request))
    return b


@router.delete("/{biz_id}", status_code=204)
def delete_biz(biz_id: int, request: Request,
               user: User = Depends(require_role("admin", "operator")),
               db: Session = Depends(get_db)):
    b = db.get(BizSystem, biz_id)
    if b is None:
        raise HTTPException(404, "业务系统不存在")
    db.delete(b)
    db.commit()
    audit.write_audit(user.username, "biz_delete", target_type="biz_system",
                      target_id=str(biz_id), ip=_ip(request))
