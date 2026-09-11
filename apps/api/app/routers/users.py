"""用户管理路由（admin 专属）。"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..models import User
from ..schemas import PasswordResetReq, UserCreateReq, UserOut, UserUpdateReq
from ..security import hash_password, require_role

router = APIRouter(prefix="/api/users", tags=["users"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("", response_model=list[UserOut])
def list_users(request: Request, _admin: User = Depends(require_role("admin")),
               db: Session = Depends(get_db)):
    return db.execute(select(User).order_by(User.id)).scalars().all()


@router.post("", response_model=UserOut, status_code=201)
def create_user(req: UserCreateReq, request: Request,
                admin: User = Depends(require_role("admin")),
                db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.username == req.username)) is not None:
        raise HTTPException(409, "用户名已存在")
    u = User(username=req.username, password_hash=hash_password(req.password),
             display_name=req.display_name, role=req.role)
    db.add(u)
    db.commit()
    db.refresh(u)
    audit.write_audit(admin.username, "user_create", target_type="user",
                      target_id=req.username, detail={"role": req.role}, ip=_ip(request))
    return u


@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: int, req: UserUpdateReq, request: Request,
                admin: User = Depends(require_role("admin")),
                db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "用户不存在")
    if req.display_name is not None:
        u.display_name = req.display_name
    if req.role is not None:
        u.role = req.role
    if req.enabled is not None:
        u.enabled = req.enabled
    db.commit()
    db.refresh(u)
    audit.write_audit(admin.username, "user_update", target_type="user",
                      target_id=u.username,
                      detail=req.model_dump(exclude_none=True), ip=_ip(request))
    return u


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, request: Request,
                admin: User = Depends(require_role("admin")),
                db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "用户不存在")
    if u.username == admin.username:
        raise HTTPException(400, "不能删除当前登录用户")
    db.delete(u)
    db.commit()
    audit.write_audit(admin.username, "user_delete", target_type="user",
                      target_id=u.username, ip=_ip(request))


@router.post("/{user_id}/reset-password")
def reset_password(user_id: int, req: PasswordResetReq, request: Request,
                   admin: User = Depends(require_role("admin")),
                   db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "用户不存在")
    u.password_hash = hash_password(req.password)
    db.commit()
    audit.write_audit(admin.username, "user_reset_password", target_type="user",
                      target_id=u.username, ip=_ip(request))
    return {"ok": True}
