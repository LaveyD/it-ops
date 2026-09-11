"""认证：JWT 签发/校验 + 用户账号（bcrypt 哈希）+ 角色 RBAC。

M6 起登录从「单管理员 .env」切换到 user 表（bcrypt 哈希）。
为兼容旧部署，seed 会把 .env 的 ADMIN_USER/ADMIN_PASSWORD 落为第一个 admin。
"""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import ValidationError

from .config import get_settings
from .db import get_db
from .models import User
from sqlalchemy import select

ROLES = ("admin", "operator", "viewer")

bearer = HTTPBearer(auto_error=False)


# ===== 密码哈希 =====
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


# ===== JWT =====
def create_token(username: str, role: str, expires_minutes: int | None = None) -> tuple[str, int]:
    s = get_settings()
    mins = expires_minutes if expires_minutes is not None else s.jwt_expire_minutes
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=mins)).timestamp()),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256"), mins * 60


def decode_token(token: str) -> dict:
    """校验并返回 payload；无效/过期抛 jwt.PyJWTError。"""
    s = get_settings()
    return jwt.decode(token, s.jwt_secret, algorithms=["HS256"])


# ===== 登录校验（查 user 表）=====
def authenticate(db, username: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.username == username))
    if user is None or not user.enabled:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


# ===== 请求级依赖 =====
def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                     db=Depends(get_db)) -> User:
    """全局依赖：校验 JWT + 用户仍启用，返回 User ORM 对象。"""
    if creds is None:
        raise HTTPException(401, "未提供凭证")
    try:
        payload = decode_token(creds.credentials)
    except (jwt.PyJWTError, ValidationError):
        raise HTTPException(401, "凭证无效或已过期")
    username = payload.get("sub", "")
    user = db.scalar(select(User).where(User.username == username))
    if user is None or not user.enabled:
        raise HTTPException(401, "用户不存在或已禁用")
    return user


def require_role(*roles: str):
    """RBAC 依赖工厂：require_role("admin","operator")。"""
    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "权限不足")
        return user
    return _dep
