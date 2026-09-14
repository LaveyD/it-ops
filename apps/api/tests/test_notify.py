"""通知框架测试：平台识别 / payload / 本地抓包 e2e / 重试。

webhook 指向本地 HTTP 服务器抓包，不依赖任何外部环境。
"""
import asyncio
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from app import notify
from app.config import get_settings


class _Handler(BaseHTTPRequestHandler):
    server_version = "testhook"
    captured = []
    status = 200

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        _Handler.captured.append({"path": self.path, "body": body})
        self.send_response(_Handler.status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"errcode":0}')

    def log_message(self, *a):
        pass


@pytest.fixture()
def hook():
    """本地抓包 webhook 服务器（每用例全新）。"""
    srv = HTTPServer(("127.0.0.1", 0), _Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    _Handler.captured.clear()
    _Handler.status = 200
    yield f"http://127.0.0.1:{srv.server_address[1]}/hook"
    srv.shutdown()


def test_detect_platform():
    assert notify.detect_platform("https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x") == "wecom"
    assert notify.detect_platform("https://oapi.dingtalk.com/robot/send?access_token=x") == "dingtalk"
    assert notify.detect_platform("https://open.feishu.cn/open-apis/bot/v2/hook/x") == "feishu"
    assert notify.detect_platform("http://127.0.0.1:9000/x") == "generic"
    assert notify.detect_platform("") == "generic"


def test_build_payload_shapes():
    w = notify.build_payload("wecom", "t", "m")
    assert w["msgtype"] == "markdown" and w["markdown"]["content"] == "m"
    d = notify.build_payload("dingtalk", "t", "m")
    assert d["markdown"]["title"] == "t" and d["markdown"]["text"] == "m"
    f = notify.build_payload("feishu", "t", "m")
    assert f["msg_type"] == "markdown" and f["content"]["title"] == "t"
    g = notify.build_payload("generic", "t", "m")
    assert g == {"title": "t", "markdown": "m"}


def test_send_webhook_e2e_generic(hook):
    res = asyncio.run(notify.send_webhook(hook, "测试标题", "### 内容"))
    assert res["ok"] and res["platform"] == "generic" and res["status_code"] == 200
    assert len(_Handler.captured) == 1
    assert _Handler.captured[0]["body"] == {"title": "测试标题", "markdown": "### 内容"}


def test_send_webhook_e2e_wecom_shape(hook):
    res = asyncio.run(notify.send_webhook(hook, "t", "m"))
    # URL 不含企微 host → generic；直接验 wecom payload 走 build
    assert res["ok"]
    assert notify.build_payload("wecom", "t", "m")["msgtype"] == "markdown"


def test_send_webhook_retry_then_fail(hook):
    _Handler.status = 500
    s = get_settings()
    old = (s.notify_max_retries, s.notify_timeout_seconds)
    s.notify_max_retries, s.notify_timeout_seconds = 1, 1.0
    try:
        t0 = time.monotonic()
        res = asyncio.run(notify.send_webhook(hook, "t", "m"))
        elapsed = time.monotonic() - t0
    finally:
        s.notify_max_retries, s.notify_timeout_seconds = old
    assert res["ok"] is False
    assert res["status_code"] == 500
    assert len(_Handler.captured) == 2          # 重试 1 次 = 共发 2 次
    assert elapsed >= 0.45                       # 两次之间有 0.5s 退避


def test_send_webhook_timeout(hook):
    s = get_settings()
    old = (s.notify_max_retries, s.notify_timeout_seconds)
    s.notify_max_retries, s.notify_timeout_seconds = 0, 0.01
    try:
        res = asyncio.run(notify.send_webhook("http://127.0.0.1:9/blackhole", "t", "m"))
    finally:
        s.notify_max_retries, s.notify_timeout_seconds = old
    assert res["ok"] is False and res["error"]


def test_test_endpoint_e2e(client, auth, hook):
    # 先保存 webhook 指向本地抓包服务器，再点"发送测试消息"
    r = client.put("/api/notify-config",
                   json={"webhook_url": hook, "notify_alert": True}, headers=auth)
    assert r.status_code == 200, r.text
    try:
        r2 = client.post("/api/notify-config/test", headers=auth)
        assert r2.status_code == 200, r2.text
        assert r2.json()["ok"] is True
        assert _Handler.captured and "测试" in _Handler.captured[-1]["body"]["markdown"]
    finally:
        # 还原：清掉 webhook（避免 mock 采集循环持续向抓包服务器推送）
        client.put("/api/notify-config", json={"webhook_url": None}, headers=auth)


def test_test_endpoint_no_webhook_400(client, auth):
    client.put("/api/notify-config", json={"webhook_url": None}, headers=auth)
    r = client.post("/api/notify-config/test", headers=auth)
    assert r.status_code == 400


def test_ack_batch_fires_notify_from_sync_endpoint(client, auth, hook):
    """回归：ack-batch 是同步端点（线程池无 running loop），fire 必须走线程 asyncio.run。"""
    r = client.put("/api/notify-config",
                   json={"webhook_url": hook, "notify_alert": True}, headers=auth)
    assert r.status_code == 200, r.text
    try:
        # 造一条未确认告警用于确认
        from app.db import SessionLocal
        from app.models import Alert
        db = SessionLocal()
        try:
            a = Alert(device_id=None, level="warn", title="notify-ack-test", detail=None)
            db.add(a)
            db.commit()
            aid = a.id
        finally:
            db.close()
        before = len(_Handler.captured)
        r2 = client.post("/api/alerts/ack-batch",
                         json={"ids": [aid]}, headers=auth)
        assert r2.status_code == 200 and r2.json()["acked"] == 1
        # 后台线程推送是异步的，轮询等待
        for _ in range(40):
            time.sleep(0.25)
            if len(_Handler.captured) > before:
                break
        assert len(_Handler.captured) > before, "ack 通知未送达"
        body = _Handler.captured[-1]["body"]
        assert "告警确认" in body["title"] and "已确认：1 条" in body["markdown"]
    finally:
        client.put("/api/notify-config", json={"webhook_url": None}, headers=auth)
