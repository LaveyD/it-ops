"""终端设备资产池路由（手机/PC/笔记本等 总量/使用量/余量）。"""
from fastapi import APIRouter, Depends
from sqlalchemy import select

from ..db import get_db
from ..models import DevicePool, User
from ..routers.auth import get_current_user
from ..schemas import DevicePoolOut

router = APIRouter(prefix="/api/device-pools", tags=["device-pools"])


@router.get("", response_model=list[DevicePoolOut])
def list_pools(db=Depends(get_db), user: User = Depends(get_current_user)):
    """全部资产池（按 id 稳定排序）；free = total - used 在响应层算出。"""
    rows = db.execute(select(DevicePool).order_by(DevicePool.id)).scalars().all()
    return [
        DevicePoolOut(id=p.id, category=p.category, total=p.total,
                      used=p.used, free=p.total - p.used, updated_at=p.updated_at)
        for p in rows
    ]
