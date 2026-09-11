"""M6 RBAC 测试：用户管理 / 角色 403 / 位置 / 大屏令牌 / 审计。

测试自建临时用户（operator/viewer），结尾清理；admin 账号为种子常驻。
"""
import uuid

from app.config import get_settings

s = get_settings()


def _mk(client, token, role):
    """建一个临时用户并返回 (id, username, token)。"""
    uname = f"t-{role}-{uuid.uuid4().hex[:8]}"
    r = client.post("/api/users", json={"username": uname, "password": "pass123", "role": role},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    uid = r.json()["id"]
    lr = client.post("/api/auth/login", json={"username": uname, "password": "pass123"})
    assert lr.status_code == 200, lr.text
    return uid, uname, lr.json()["token"]


def _cleanup(client, token, uid):
    client.delete(f"/api/users/{uid}", headers={"Authorization": f"Bearer {token}"})


def test_login_returns_role(client):
    r = client.post("/api/auth/login", json={"username": s.admin_user, "password": s.admin_password})
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "admin"


def test_me_returns_role(client, auth):
    r = client.get("/api/auth/me", headers=auth)
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


def test_users_crud_and_screen_token(client, token):
    admin = {"Authorization": f"Bearer {token}"}
    # 建 viewer
    uname = f"t-v-{uuid.uuid4().hex[:8]}"
    r = client.post("/api/users", json={"username": uname, "password": "pass123", "role": "viewer"},
                    headers=admin)
    assert r.status_code == 201
    uid = r.json()["id"]
    assert r.json()["role"] == "viewer"

    # 列表可见
    r = client.get("/api/users", headers=admin)
    assert r.status_code == 200
    assert any(u["username"] == uname for u in r.json())

    # 改名
    r = client.put(f"/api/users/{uid}", json={"display_name": "改名"}, headers=admin)
    assert r.status_code == 200 and r.json()["display_name"] == "改名"

    # 重置密码后旧密码登录 401、新密码 200
    r = client.post(f"/api/users/{uid}/reset-password", json={"password": "newpass9"}, headers=admin)
    assert r.status_code == 200
    assert client.post("/api/auth/login", json={"username": uname, "password": "pass123"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": uname, "password": "newpass9"}).status_code == 200

    # 重复用户名 409
    assert client.post("/api/users", json={"username": uname, "password": "pass123"},
                       headers=admin).status_code == 409

    # 删除
    r = client.delete(f"/api/users/{uid}", headers=admin)
    assert r.status_code == 204
    assert client.post("/api/auth/login", json={"username": uname, "password": "newpass9"}).status_code == 401

    # 大屏令牌：admin 可发，token 可登录且身份为内置 screen（viewer）
    r = client.post("/api/auth/screen-token", headers=admin)
    assert r.status_code == 200
    tok = r.json()["token"]
    assert r.json()["expires_in"] >= 30 * 24 * 3600
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert me.status_code == 200
    assert me.json()["role"] == "viewer"
    assert me.json()["username"] == "screen"


def test_viewer_cannot_access_admin_api(client, token):
    uid, uname, tok = _mk(client, token, "viewer")
    vauth = {"Authorization": f"Bearer {tok}"}
    # viewer：用户管理 403、大屏令牌 403
    assert client.get("/api/users", headers=vauth).status_code == 403
    assert client.post("/api/auth/screen-token", headers=vauth).status_code == 403
    # viewer：只读大屏接口 OK
    assert client.get("/api/overview", headers=vauth).status_code == 200
    _cleanup(client, token, uid)


def test_operator_forbidden_on_users_but_ok_on_locations(client, token):
    uid, uname, tok = _mk(client, token, "operator")
    oauth = {"Authorization": f"Bearer {tok}"}
    assert client.get("/api/users", headers=oauth).status_code == 403
    # operator：位置 CRUD OK
    r = client.get("/api/locations", headers=oauth)
    assert r.status_code == 200
    lname = f"t-loc-{uuid.uuid4().hex[:8]}"
    r = client.post("/api/locations", json={"name": lname, "zone_type": "branch"}, headers=oauth)
    assert r.status_code == 201
    lid = r.json()["id"]
    assert client.delete(f"/api/locations/{lid}", headers=oauth).status_code == 204
    _cleanup(client, token, uid)


def test_disabled_user_cannot_auth(client, token):
    uid, uname, tok = _mk(client, token, "operator")
    admin = {"Authorization": f"Bearer {token}"}
    # 禁用后：旧 token 401、登录 401
    r = client.put(f"/api/users/{uid}", json={"enabled": False}, headers=admin)
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": uname, "password": "pass123"}).status_code == 401
    # 重新启用后登录恢复
    client.put(f"/api/users/{uid}", json={"enabled": True}, headers=admin)
    assert client.post("/api/auth/login", json={"username": uname, "password": "pass123"}).status_code == 200
    _cleanup(client, token, uid)


def test_audit_written_on_login(client, auth):
    # 登录已写过 audit；查询可见
    r = client.get("/api/audit?username=" + s.admin_user, headers=auth)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    actions = [a["action"] for a in body["items"]]
    assert "login" in actions
