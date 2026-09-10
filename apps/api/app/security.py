"""JWT 签发/校验 + 内置管理员账号（无账号体系，单账号）。"""
from datetime import datetime, timedelta, timezone

import jwt

from .config import get_settings


def _creds() -> tuple[str, str]:
    s = get_settings()
    return s.admin_user, s.admin_password


def verify_credentials(username: str, password: str) -> bool:
    u, p = _creds()
    return username == u and password == p


def create_token(username: str) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=s.jwt_expire_minutes)).timestamp()),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    """校验并返回 payload；无效/过期抛 jwt.PyJWTError。"""
    s = get_settings()
    return jwt.decode(token, s.jwt_secret, algorithms=["HS256"])
