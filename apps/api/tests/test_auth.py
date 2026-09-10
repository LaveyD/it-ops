"""认证接口测试。"""
from app.config import get_settings

s = get_settings()


def test_login_success(client):
    r = client.post("/api/auth/login", json={"username": s.admin_user, "password": s.admin_password})
    assert r.status_code == 200
    body = r.json()
    assert body["token"]
    assert body["expires_in"] > 0


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"username": s.admin_user, "password": "wrong"})
    assert r.status_code == 401


def test_me_with_token(client, auth):
    r = client.get("/api/auth/me", headers=auth)
    assert r.status_code == 200
    assert r.json()["username"] == s.admin_user


def test_me_without_token(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_protected_endpoint_without_token(client):
    r = client.get("/api/overview")
    assert r.status_code == 401
