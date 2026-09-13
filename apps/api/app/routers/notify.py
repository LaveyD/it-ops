"""通知配置路由（M10 mock：仅落地保存，推送 M+ 再做）。admin 专属。"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..models import NotifyConfig, User
from ..schemas import NotifyConfigOut, NotifyConfigUpdate
from ..security import require_role

router = APIRouter(prefix="/api/notify-config", tags=["notify"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("", response_model=NotifyConfigOut)
def get_config(_admin: User = Depends(require_role("admin")),
               db: Session = Depends(get_db)):
    c = db.get(NotifyConfig, 1)
    return NotifyConfigOut(
        webhook_url=c.webhook_url, email_to=c.email_to, email_from=c.email_from,
        notify_alert=c.notify_alert, updated_by=c.updated_by, updated_at=c.updated_at,
    )


@router.put("", response_model=NotifyConfigOut)
def update_config(req: NotifyConfigUpdate, request: Request,
                  admin: User = Depends(require_role("admin")),
                  db: Session = Depends(get_db)):
    c = db.get(NotifyConfig, 1)
    if c is None:
        c = NotifyConfig(id=1)
        db.add(c)
    if req.webhook_url is not None:
        c.webhook_url = req.webhook_url or None
    if req.email_to is not None:
        c.email_to = req.email_to or None
    if req.email_from is not None:
        c.email_from = req.email_from or None
    if req.notify_alert is not None:
        c.notify_alert = req.notify_alert
    c.updated_by = admin.username
    c.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(c)
    audit.write_audit(admin.username, "notify_config_update", target_type="notify_config",
                      target_id="1", detail=req.model_dump(exclude_none=True), ip=_ip(request))
    return NotifyConfigOut(
        webhook_url=c.webhook_url, email_to=c.email_to, email_from=c.email_from,
        notify_alert=c.notify_alert, updated_by=c.updated_by, updated_at=c.updated_at,
    )
