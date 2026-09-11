"""认证路由：登录 + 当前用户 + 大屏令牌。"""
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..security import authenticate, create_token, get_current_user, hash_password
from ..models import User
from ..schemas import LoginReq, LoginResp, MeResp, ScreenTokenResp

router = APIRouter(prefix="/api/auth", tags=["auth"])

SCREEN_USER = "screen"  # 内置大屏只读账号（viewer），大屏令牌以它签发


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _ensure_screen_account(db: Session) -> None:
    """确保内置大屏账号存在（role=viewer，随机密码不可密码登录）。幂等。"""
    u = db.scalar(select(User).where(User.username == SCREEN_USER))
    if u is None:
        db.add(User(username=SCREEN_USER, password_hash=hash_password(secrets.token_urlsafe(24)),
                    display_name="大屏只读（内置）", role="viewer"))
        db.commit()


@router.post("/login", response_model=LoginResp)
def login(req: LoginReq, request: Request, db: Session = Depends(get_db)):
    user = authenticate(db, req.username, req.password)
    if user is None:
        audit.write_audit(req.username, "login_failed", ip=_client_ip(request))
        raise HTTPException(401, "用户名或密码错误")
    token, expires_in = create_token(user.username, user.role)
    audit.write_audit(user.username, "login", ip=_client_ip(request))
    return LoginResp(token=token, expires_in=expires_in, role=user.role)


@router.get("/me", response_model=MeResp)
def me(user: User = Depends(get_current_user)):
    return MeResp(username=user.username, role=user.role)


@router.post("/logout")
def logout(request: Request, user: User = Depends(get_current_user)):
    """JWT 无状态，这里只写审计（前端清本地 token）。"""
    audit.write_audit(user.username, "logout", ip=_client_ip(request))
    return {"ok": True}


@router.post("/screen-token", response_model=ScreenTokenResp)
def screen_token(request: Request, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    """生成 30 天 viewer 令牌，供大屏/电视免密登录。仅 admin。

    以内置账号 screen 签发：大屏身份是真实 viewer，get_current_user 查库即得
    viewer 权限，与登录账号的 role 解耦。
    """
    if user.role != "admin":
        raise HTTPException(403, "权限不足")
    _ensure_screen_account(db)
    token, expires_in = create_token(SCREEN_USER, "viewer", expires_minutes=30 * 24 * 60)
    audit.write_audit(user.username, "screen_token_issued", ip=_client_ip(request))
    return ScreenTokenResp(token=token, expires_in=expires_in)
