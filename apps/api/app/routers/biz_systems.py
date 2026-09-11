"""业务系统路由。"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import BizSystem, User
from ..routers.auth import get_current_user
from ..schemas import BizSystemOut

router = APIRouter(prefix="/api/biz-systems", tags=["biz-systems"])


@router.get("", response_model=list[BizSystemOut])
def list_biz(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.execute(select(BizSystem).order_by(BizSystem.id)).scalars().all()
