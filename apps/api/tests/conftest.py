"""pytest 公共 fixture：TestClient + 登录 token（不跑 lifespan，避免 mock 任务干扰）。"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.config import get_settings  # noqa: E402

s = get_settings()


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def token(client):
    r = client.post("/api/auth/login", json={"username": s.admin_user, "password": s.admin_password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth(client, token):
    return {"Authorization": f"Bearer {token}"}
