"""认证路由：登录 + 当前用户。"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import ValidationError

import jwt

from ..config import get_settings
from ..security import create_token, decode_token, verify_credentials
from ..schemas import LoginReq, LoginResp, MeResp

router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    """全局依赖：校验 JWT，返回用户名。"""
    if creds is None:
        raise HTTPException(401, "未提供凭证")
    try:
        payload = decode_token(creds.credentials)
    except (jwt.PyJWTError, ValidationError):
        raise HTTPException(401, "凭证无效或已过期")
    return payload.get("sub", "")


@router.post("/login", response_model=LoginResp)
def login(req: LoginReq):
    if not verify_credentials(req.username, req.password):
        raise HTTPException(401, "用户名或密码错误")
    s = get_settings()
    return LoginResp(token=create_token(req.username), expires_in=s.jwt_expire_minutes * 60)


@router.get("/me", response_model=MeResp)
def me(user: str = Depends(get_current_user)):
    return MeResp(username=user)
