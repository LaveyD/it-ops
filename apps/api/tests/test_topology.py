"""概览与拓扑接口测试。"""
from app.config import get_settings


def test_overview(client, auth):
    r = client.get("/api/overview", headers=auth)
    assert r.status_code == 200
    body = r.json()
    assert body["device_count"] >= 1
    assert 0 <= body["online_rate"] <= 1
    assert set(body["alert_counts"].keys()) == {"info", "warn", "crit"}
    assert body["topology"] is not None
    assert body["topology"]["version"] >= 1


def test_topology_active(client, auth):
    r = client.get("/api/topology/active", headers=auth)
    assert r.status_code == 200
    body = r.json()
    assert body["canvas"]["nodes"]
    assert body["canvas"]["links"]
    assert len(body["devices"]) >= 1
    # 设备状态映射可用
    some_dev = list(body["devices"].values())[0]
    assert "status" in some_dev


def test_topology_save_validates_canvas(client, auth):
    r = client.post("/api/topology", headers=auth, json={
        "canvas": {"nodes": [{"id": "a"}], "links": [{"id": "l", "source": "a", "target": "ghost"}]},
    })
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert detail["detail"] == "canvas 校验失败"
    assert any("links" in e for e in detail["errors"])


def test_topology_save_missing_device(client, auth):
    r = client.post("/api/topology", headers=auth, json={
        "canvas": {
            "nodes": [{"id": "n1", "label": "t", "type": "server", "x": 0, "y": 0,
                       "properties": {"deviceId": "no-such-device-xyz"}}],
            "links": [],
        },
    })
    assert r.status_code == 422
    assert "no-such-device-xyz" in str(r.json())


def test_topology_save_new_version(client, auth):
    base = client.get("/api/topology/active", headers=auth).json()
    canvas = {
        "nodes": [
            {"id": "n1", "label": "测试节点", "type": "server", "color": "1,2,3", "x": 10, "y": 10,
             "size": 60, "properties": {}},
            {"id": "n2", "label": "测试节点2", "type": "switch", "color": "1,2,3", "x": 110, "y": 10,
             "size": 60, "properties": {}},
        ],
        "links": [{"id": "tl1", "source": "n1", "target": "n2", "label": ""}],
    }
    r = client.post("/api/topology", headers=auth, json={"name": "pytest 临时版本", "canvas": canvas})
    assert r.status_code == 200, r.text
    new_id = r.json()["id"]
    assert r.json()["version"] == base["version"] + 1
    assert r.json()["is_active"] is False  # 已有生效版本，不应自动激活
    # 清理测试版本（保留 active 不变）
    from sqlalchemy import delete
    from app.db import SessionLocal
    from app.models import Topology
    db = SessionLocal()
    try:
        db.execute(delete(Topology).where(Topology.id == new_id))
        db.commit()
    finally:
        db.close()
