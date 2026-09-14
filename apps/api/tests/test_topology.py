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
    try:
        assert r.json()["version"] == base["version"] + 1
        assert r.json()["is_active"] is False  # 已有生效版本，不应自动激活
    finally:
        # 清理测试版本（保留 active 不变；必须清理，否则版本号漂移污染后续运行）
        _delete_topology(new_id)


def test_topology_save_overrides_current_version(client, auth):
    """保存当前版本（target_id）：canvas 覆盖、版本号不变、不新增行。"""
    base = client.get("/api/topology/active", headers=auth).json()
    canvas = {
        "nodes": [{"id": "o1", "label": "覆盖节点", "type": "server", "color": "1,2,3",
                   "x": 5, "y": 5, "size": 60, "properties": {}}],
        "links": [],
    }
    before_count = len(client.get("/api/topology/versions", headers=auth).json())
    r = client.post("/api/topology", headers=auth,
                    json={"name": base["name"], "canvas": canvas, "target_id": base["id"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == base["id"]
    assert body["version"] == base["version"]  # 版本号不变
    assert body["is_active"] is True
    # 覆盖生效
    active = client.get("/api/topology/active", headers=auth).json()
    assert [n["id"] for n in active["canvas"]["nodes"]] == ["o1"]
    # 未新增版本行
    assert len(client.get("/api/topology/versions", headers=auth).json()) == before_count
    # 恢复原 canvas
    r2 = client.post("/api/topology", headers=auth,
                     json={"name": base["name"], "canvas": base["canvas"], "target_id": base["id"]})
    assert r2.status_code == 200, r2.text
    # 目标版本不存在 → 404
    r3 = client.post("/api/topology", headers=auth,
                     json={"canvas": canvas, "target_id": 99999999})
    assert r3.status_code == 404


def test_topology_activate_switches_active(client, auth):
    """激活另一版本：双 UPDATE 分批复行，不撞部分唯一索引 ux_topology_active。"""
    base = client.get("/api/topology/active", headers=auth).json()
    canvas = {
        "nodes": [{"id": "a1", "label": "A", "type": "server", "color": "1,2,3",
                   "x": 0, "y": 0, "size": 60, "properties": {}}],
        "links": [],
    }
    v2 = client.post("/api/topology", headers=auth, json={"name": "pytest 激活-v2", "canvas": canvas}).json()
    v3 = client.post("/api/topology", headers=auth, json={"name": "pytest 激活-v3", "canvas": canvas}).json()
    try:
        # 激活 v3（当前 active 是 base）
        r = client.post(f"/api/topology/{v3['id']}/activate", headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()["is_active"] is True
        # 再切回 v2：连续两次 activate 都必须成功
        r = client.post(f"/api/topology/{v2['id']}/activate", headers=auth)
        assert r.status_code == 200, r.text
        active = client.get("/api/topology/active", headers=auth).json()
        assert active["id"] == v2["id"]
    finally:
        # 恢复 base 生效并清理测试版本
        client.post(f"/api/topology/{base['id']}/activate", headers=auth)
        _delete_topology(v2["id"])
        _delete_topology(v3["id"])


def _delete_topology(topo_id: int):
    from sqlalchemy import delete
    from app.db import SessionLocal
    from app.models import Topology
    db = SessionLocal()
    try:
        db.execute(delete(Topology).where(Topology.id == topo_id))
        db.commit()
    finally:
        db.close()
