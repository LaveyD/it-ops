"""M10 系统管理测试：审计 CSV 导出 + 通知配置（mock 落地）。

通知配置为单行 mock：PUT 修改 → GET 读回一致；viewer 403。
"""
from app.config import get_settings

s = get_settings()


def test_audit_export_csv(client, auth):
    import csv as csvmod
    import io as iomod
    import json as jsonmod
    # 有审计数据（登录写过），导出应含表头 + 至少一条 login
    r = client.get("/api/audit/export?username=" + s.admin_user, headers=auth)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    text = r.text
    assert text.startswith("\ufeff")  # UTF-8 BOM
    lines = text.lstrip("\ufeff").strip().splitlines()
    assert lines[0].startswith("id,username,action,")
    assert any("login" in ln for ln in lines[1:])
    # detail 列必须是合法 JSON（非空时），不能是 Python dict repr
    rows = list(csvmod.reader(iomod.StringIO(text.lstrip("\ufeff"))))
    assert rows[0][5] == "detail"
    for row in rows[1:]:
        if row[5].strip():
            jsonmod.loads(row[5])


def test_audit_export_forbidden_for_viewer(client, token):
    import uuid
    uname = f"t-v-{uuid.uuid4().hex[:8]}"
    r = client.post("/api/users", json={"username": uname, "password": "pass123", "role": "viewer"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    uid = r.json()["id"]
    lr = client.post("/api/auth/login", json={"username": uname, "password": "pass123"})
    vauth = {"Authorization": f"Bearer {lr.json()['token']}"}
    assert client.get("/api/audit/export", headers=vauth).status_code == 403
    client.delete(f"/api/users/{uid}", headers={"Authorization": f"Bearer {token}"})


def test_notify_config_admin_get_put(client, token):
    admin = {"Authorization": f"Bearer {token}"}
    # 初始存在（迁移 seed 单行）
    r = client.get("/api/notify-config", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["notify_alert"] in (True, False)

    # PUT 修改（webhook + 关闭推送）
    r = client.put("/api/notify-config",
                   json={"webhook_url": "http://10.0.0.9:9000/hook", "notify_alert": False},
                   headers=admin)
    assert r.status_code == 200
    assert r.json()["webhook_url"] == "http://10.0.0.9:9000/hook"
    assert r.json()["notify_alert"] is False
    assert r.json()["updated_by"] == s.admin_user

    # GET 读回一致
    r = client.get("/api/notify-config", headers=admin)
    assert r.json()["webhook_url"] == "http://10.0.0.9:9000/hook"
    assert r.json()["notify_alert"] is False

    # 清空 webhook（空串 → None）
    r = client.put("/api/notify-config", json={"webhook_url": ""}, headers=admin)
    assert r.status_code == 200
    assert r.json()["webhook_url"] is None


def test_notify_config_forbidden_for_operator(client, token):
    import uuid
    uname = f"t-o-{uuid.uuid4().hex[:8]}"
    r = client.post("/api/users", json={"username": uname, "password": "pass123", "role": "operator"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    uid = r.json()["id"]
    lr = client.post("/api/auth/login", json={"username": uname, "password": "pass123"})
    oauth = {"Authorization": f"Bearer {lr.json()['token']}"}
    # operator：读/写均 403（系统管理 admin 专属）
    assert client.get("/api/notify-config", headers=oauth).status_code == 403
    assert client.put("/api/notify-config", json={"notify_alert": True}, headers=oauth).status_code == 403
    client.delete(f"/api/users/{uid}", headers={"Authorization": f"Bearer {token}"})
