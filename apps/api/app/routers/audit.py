"""审计日志查询路由。"""
from fastapi import APIRouter, Depends, Query

from ..audit import list_audit
from ..models import User
from ..schemas import AuditOut, AuditPageResp
from ..security import require_role

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("", response_model=AuditPageResp)
def audit_list(username: str | None = Query(default=None),
               action: str | None = Query(default=None),
               target_type: str | None = Query(default=None),
               target_id: str | None = Query(default=None),
               page: int = Query(1, ge=1),
               page_size: int = Query(20, ge=1, le=100),
               _u: User = Depends(require_role("admin", "operator"))):
    rows, total = list_audit(username=username, action=action, target_type=target_type,
                             target_id=target_id, page=page, page_size=page_size)
    return AuditPageResp(items=[AuditOut.model_validate(r) for r in rows],
                         total=total, page=page, page_size=page_size)
