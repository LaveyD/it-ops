"""通知发送框架：webhook（企业微信 / 钉钉 / 飞书 / 通用）+ 测试发送 + 审计。

- 平台按 URL host 特征识别，未识别的落 generic（{title, markdown} 通用报文）
- 发送失败不阻断业务：只打日志 + 审计（notify_send，detail 含 ok/error）
- 触发点：
  1. 采集轮出现 crit 告警（notify_alert 开关 + webhook_url 都配好才发）
  2. 告警批量确认
  3. 后台"发送测试消息"端点
- fire_* 兼容同步/异步两种调用上下文（FastAPI 同步端点跑在线程池，
  无 running loop → 开独立线程 asyncio.run 推送）
"""
import asyncio
import logging
import threading
from datetime import datetime, timezone

import httpx

from . import audit
from .config import get_settings

log = logging.getLogger("it-ops.notify")


def _spawn(coro) -> None:
    """在后台执行协程：有 running loop 用 create_task，否则新线程 asyncio.run。"""
    try:
        asyncio.get_running_loop()
        asyncio.create_task(coro)
    except RuntimeError:
        threading.Thread(target=lambda: asyncio.run(coro), daemon=True).start()

LEVEL_CN = {"info": "提示", "warn": "警告", "crit": "严重"}


def detect_platform(url: str) -> str:
    u = (url or "").lower()
    if "qyapi.weixin.qq.com" in u:
        return "wecom"
    if "oapi.dingtalk.com" in u:
        return "dingtalk"
    if "open.feishu.cn" in u:
        return "feishu"
    return "generic"


def build_payload(platform: str, title: str, markdown: str) -> dict:
    if platform == "wecom":
        # 企微 markdown 报文上限 4096 字节，这里按字符留余量截断
        return {"msgtype": "markdown", "markdown": {"content": markdown[:4000]}}
    if platform == "dingtalk":
        return {"msgtype": "markdown", "markdown": {"title": title, "text": markdown}}
    if platform == "feishu":
        return {"msg_type": "markdown", "content": {"title": title, "markdown": markdown}}
    return {"title": title, "markdown": markdown}


async def send_webhook(url: str, title: str, markdown: str) -> dict:
    """发送一次 webhook（按配置重试一次）。返回 {platform, ok, status_code?, error?}。"""
    s = get_settings()
    platform = detect_platform(url)
    payload = build_payload(platform, title, markdown)
    last_err: str | None = None
    last_status: int | None = None
    for attempt in range(s.notify_max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=s.notify_timeout_seconds) as client:
                r = await client.post(url, json=payload)
            last_status = r.status_code
            if r.status_code < 400:
                return {"platform": platform, "ok": True, "status_code": r.status_code}
            last_err = f"HTTP {r.status_code}"
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
        if attempt < s.notify_max_retries:
            await asyncio.sleep(0.5)
    return {"platform": platform, "ok": False, "status_code": last_status, "error": last_err}


def _alert_md(a: dict, now: datetime) -> tuple[str, str]:
    level = a["level"]
    dev = a.get("device_name") or (a.get("device_id") or "未知设备")
    title = f"【IT运维告警 · {LEVEL_CN.get(level, level)}】{dev} {a['title']}"
    lines = [f"### {title}", f"- 等级：{LEVEL_CN.get(level, level)}", f"- 设备：{dev}"]
    if a.get("detail"):
        lines.append(f"- 详情：{a['detail']}")
    lines.append(f"- 时间：{now:%Y-%m-%d %H:%M:%S} UTC")
    return title, "\n".join(lines)


def fire_alert_notify(alerts: list[dict]) -> None:
    """后台推送本轮 crit 告警（配置关闭/未配 webhook = 静默 no-op）。从采集循环调用。"""
    if not alerts:
        return
    _spawn(_push_alerts(alerts))


async def _push_alerts(alerts: list[dict]) -> None:
    try:
        from .db import SessionLocal
        from .models import NotifyConfig

        db = SessionLocal()
        try:
            c = db.get(NotifyConfig, 1)
        finally:
            db.close()
        if c is None or not c.notify_alert or not c.webhook_url:
            return
        now = datetime.now(timezone.utc)
        for a in alerts:
            title, md = _alert_md(a, now)
            res = await send_webhook(c.webhook_url, title, md)
            audit.write_audit("system", "notify_send", target_type="alert",
                              target_id=str(a.get("id") or ""), detail=res)
            if not res["ok"]:
                log.warning("告警推送失败：%s", res)
    except Exception:
        log.exception("notify alert task failed")


def fire_ack_notify(acked: int, missing: list, username: str) -> None:
    """后台推送批量确认消息。从告警批量确认接口调用。"""
    if acked <= 0:
        return
    _spawn(_push_ack(acked, missing, username))


async def _push_ack(acked: int, missing: list, username: str) -> None:
    try:
        from .db import SessionLocal
        from .models import NotifyConfig

        db = SessionLocal()
        try:
            c = db.get(NotifyConfig, 1)
        finally:
            db.close()
        if c is None or not c.webhook_url:
            return
        now = datetime.now(timezone.utc)
        title = "【IT运维 · 告警确认】"
        lines = [f"### {title}", f"- 操作人：{username}", f"- 已确认：{acked} 条"]
        if missing:
            lines.append(f"- 未找到跳过：{len(missing)} 条")
        lines.append(f"- 时间：{now:%Y-%m-%d %H:%M:%S} UTC")
        res = await send_webhook(c.webhook_url, title, "\n".join(lines))
        audit.write_audit(username, "notify_send", target_type="alert_ack_batch",
                          target_id=str(acked), detail=res)
        if not res["ok"]:
            log.warning("确认推送失败：%s", res)
    except Exception:
        log.exception("notify ack task failed")
