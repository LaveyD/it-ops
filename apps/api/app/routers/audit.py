"""审计日志查询路由。"""
import csv
import io
import json
from datetime import timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from .. import audit
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
    rows, total = audit.list_audit(username=username, action=action, target_type=target_type,
                                   target_id=target_id, page=page, page_size=page_size)
    return AuditPageResp(items=[AuditOut.model_validate(r) for r in rows],
                         total=total, page=page, page_size=page_size)


@router.get("/export")
def audit_export(username: str | None = Query(default=None),
                 action: str | None = Query(default=None),
                 target_type: str | None = Query(default=None),
                 target_id: str | None = Query(default=None),
                 _u: User = Depends(require_role("admin", "operator"))):
    """按当前筛选条件导出 CSV（UTF-8 BOM，Excel 可直接打开）。"""
    rows, _ = audit.list_audit(username=username, action=action, target_type=target_type,
                               target_id=target_id, page=1, page_size=100000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "username", "action", "target_type", "target_id", "detail", "ip", "created_at"])
    for r in rows:
        w.writerow([r.id, r.username, r.action, r.target_type or "", r.target_id or "",
                    json.dumps(r.detail or {}, ensure_ascii=False), r.ip or "",
                    r.created_at.astimezone(timezone.utc).isoformat() if r.created_at else ""])
    return StreamingResponse(
        iter(["\ufeff" + buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=it-ops-audit.csv"},
    )
