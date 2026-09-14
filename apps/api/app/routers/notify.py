"""通知配置路由：配置落地 + 测试发送（webhook 真实推送）。admin 专属。"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..models import NotifyConfig, User
from ..notify import send_webhook
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
    # webhook 三字段：显式传 null = 清空（前端清空输入即发 null）；
    # 用 model_fields_set 区分"未传"与"显式 null"
    sent = req.model_fields_set
    if "webhook_url" in sent:
        c.webhook_url = req.webhook_url or None
    if "email_to" in sent:
        c.email_to = req.email_to or None
    if "email_from" in sent:
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


@router.post("/test")
async def test_webhook(request: Request,
                       admin: User = Depends(require_role("admin")),
                       db: Session = Depends(get_db)):
    """向已保存的 webhook_url 发送一条测试消息，返回 {platform, ok, status_code?, error?}。"""
    c = db.get(NotifyConfig, 1)
    if c is None or not c.webhook_url:
        raise HTTPException(400, "请先保存 Webhook URL")
    now = datetime.now(timezone.utc)
    title = "【IT运维 · 通知测试】"
    md = f"### {title}\n- 这是一条测试消息，收到即表示通知链路正常\n- 时间：{now:%Y-%m-%d %H:%M:%S} UTC"
    res = await send_webhook(c.webhook_url, title, md)
    audit.write_audit(admin.username, "notify_test", target_type="notify_config",
                      target_id="1", detail=res, ip=_ip(request))
    return res
