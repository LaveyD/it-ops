"""M7 资产与空间测试：设备/业务系统 CRUD + 批量 + 机房/机柜 + scene 聚合 + RBAC。

测试自建临时资源（uuid 后缀），结尾清理；seed 常驻数据（机房/设备）只读断言。
"""
import uuid

from app.config import get_settings

s = get_settings()
SUF = uuid.uuid4().hex[:8]


# ===== 设备 CRUD =====
def test_device_crud(client, auth):
    did = f"t-dev-{SUF}"
    # 创建
    r = client.post("/api/devices", json={"id": did, "name": "测试服务器", "type": "server",
                                          "ip": "10.9.9.9", "status": "normal"}, headers=auth)
    assert r.status_code == 201, r.text
    assert r.json()["id"] == did

    # 重复 ID 409
    r = client.post("/api/devices", json={"id": did, "name": "x", "type": "server"}, headers=auth)
    assert r.status_code == 409

    # 非法 cabinet_id → 422
    r = client.put(f"/api/devices/{did}", json={"cabinet_id": 999999}, headers=auth)
    assert r.status_code == 422

    # 更新（局部）
    r = client.put(f"/api/devices/{did}", json={"status": "warn", "owner": "测试员"}, headers=auth)
    assert r.status_code == 200 and r.json()["status"] == "warn" and r.json()["owner"] == "测试员"
    assert r.json()["type"] == "server"  # 未传字段保持

    # 详情
    assert client.get(f"/api/devices/{did}", headers=auth).status_code == 200

    # 删除（幂等清理用）
    assert client.delete(f"/api/devices/{did}", headers=auth).status_code == 204
    assert client.get(f"/api/devices/{did}", headers=auth).status_code == 404


def test_device_delete_unbinds_topology(client, auth):
    """删设备 → topology_node_device.device_id 置 NULL（节点保留）。

    不新建拓扑版本（避免版本号漂移污染 test_topology），直接复用 active 拓扑 + ORM 物化关联。
    """
    from app.db import SessionLocal
    from app.models import Topology, TopologyNodeDevice

    topo_id = client.get("/api/topology/active", headers=auth).json()["id"]
    did = f"t-unbind-{SUF}"
    client.post("/api/devices", json={"id": did, "name": "临时", "type": "server"}, headers=auth)

    from sqlalchemy import delete as sa_delete

    db = SessionLocal()
    try:
        topo = db.get(Topology, topo_id)
        node_id = topo.canvas["nodes"][0]["id"]
        # 幂等：清掉该 (topo, node) 上任何残留关联行（上次运行 device_id=None 残留）
        db.execute(sa_delete(TopologyNodeDevice).where(
            TopologyNodeDevice.topology_id == topo_id,
            TopologyNodeDevice.node_id == node_id))
        db.add(TopologyNodeDevice(topology_id=topo_id, node_id=node_id, device_id=did))
        db.commit()
        tnd = db.get(TopologyNodeDevice, (topo_id, node_id))
        assert tnd.device_id == did
    finally:
        db.close()

    # 删除设备 → 关联置空
    assert client.delete(f"/api/devices/{did}", headers=auth).status_code == 204
    db = SessionLocal()
    try:
        tnd = db.get(TopologyNodeDevice, (topo_id, node_id))
        assert tnd is not None and tnd.device_id is None  # 节点保留、解绑
    finally:
        db.close()
    # 设备详情 404
    assert client.get(f"/api/devices/{did}", headers=auth).status_code == 404
    # 清理：删掉解绑后的残留行，避免下次运行撞 PK
    db = SessionLocal()
    try:
        db.execute(sa_delete(TopologyNodeDevice).where(
            TopologyNodeDevice.topology_id == topo_id,
            TopologyNodeDevice.node_id == node_id))
        db.commit()
    finally:
        db.close()


def test_device_batch_status(client, auth):
    d1, d2 = f"t-b1-{SUF}", f"t-b2-{SUF}"
    for d in (d1, d2):
        client.post("/api/devices", json={"id": d, "name": "b", "type": "server"}, headers=auth)
    r = client.post("/api/devices/batch-status", json={"ids": [d1, d2, "no-such"], "status": "alert"},
                    headers=auth)
    assert r.status_code == 200
    assert r.json()["updated"] == 2 and r.json()["missing"] == ["no-such"]
    assert client.get(f"/api/devices/{d1}", headers=auth).json()["status"] == "alert"
    client.delete(f"/api/devices/{d1}", headers=auth)
    client.delete(f"/api/devices/{d2}", headers=auth)


# ===== 业务系统 CRUD =====
def test_biz_system_crud(client, auth):
    name = f"测试系统-{SUF}"
    r = client.post("/api/biz-systems", json={"name": name, "owner": "测试", "sla_target": 99.5},
                    headers=auth)
    assert r.status_code == 201, r.text
    bid = r.json()["id"]
    # 重名 409
    assert client.post("/api/biz-systems", json={"name": name}, headers=auth).status_code == 409
    # 更新
    r = client.put(f"/api/biz-systems/{bid}", json={"name": name, "status": "warn",
                                                    "sla_actual": 99.1}, headers=auth)
    assert r.status_code == 200 and r.json()["status"] == "warn"
    # 删除
    assert client.delete(f"/api/biz-systems/{bid}", headers=auth).status_code == 204


# ===== 机房 / 机柜 =====
def test_room_cabinet_crud(client, auth):
    # 建机房
    r = client.post("/api/rooms", json={"name": f"t-room-{SUF}", "rows": 2, "cols": 3}, headers=auth)
    assert r.status_code == 201, r.text
    rid = r.json()["id"]

    # 建机柜
    r = client.post(f"/api/rooms/{rid}/cabinets",
                    json={"name": "C-01", "row": 1, "col": 1, "u_height": 42}, headers=auth)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]

    # 行列越界 422
    r = client.post(f"/api/rooms/{rid}/cabinets", json={"name": "C-X", "row": 5, "col": 1}, headers=auth)
    assert r.status_code == 422

    # 重名 409
    r = client.post(f"/api/rooms/{rid}/cabinets", json={"name": "C-01", "row": 1, "col": 2}, headers=auth)
    assert r.status_code == 409

    # 机柜改名
    r = client.put(f"/api/rooms/cabinets/{cid}", json={"name": "C-01b", "row": 1, "col": 1},
                   headers=auth)
    assert r.status_code == 200 and r.json()["name"] == "C-01b"

    # 有机柜时删机房 409
    assert client.delete(f"/api/rooms/{rid}", headers=auth).status_code == 409
    # 删机柜后删机房 OK
    assert client.delete(f"/api/rooms/cabinets/{cid}", headers=auth).status_code == 204
    assert client.delete(f"/api/rooms/{rid}", headers=auth).status_code == 204


def test_seed_room_scene(client, auth):
    """seed 常驻机房：scene 聚合结构可渲染。"""
    rooms = client.get("/api/rooms", headers=auth).json()
    room = next(r for r in rooms if r["name"] == "总部数据中心")
    assert room["rows"] == 2 and room["cols"] == 12
    r = client.get(f"/api/rooms/{room['id']}/scene", headers=auth)
    assert r.status_code == 200
    body = r.json()
    assert body["room"]["cols"] == 12
    assert len(body["cabinets"]) == 24
    cab01 = next(c for c in body["cabinets"] if c["name"] == "A1-01")
    devs = {d["id"]: d for d in cab01["devices"]}
    assert "rtr-core-01" in devs and devs["rtr-core-01"]["u_start"] == 36
    # 空机柜
    assert next(c for c in body["cabinets"] if c["name"] == "A2-12")["devices"] == []


def test_scene_404(client, auth):
    assert client.get("/api/rooms/999999/scene", headers=auth).status_code == 404


# ===== 告警批量确认 =====
def test_alert_ack_batch(client, auth):
    # 取两条未确认告警
    alerts = client.get("/api/alerts?unacked=1&limit=5", headers=auth).json()
    assert alerts, "seed 应产生未确认告警"
    ids = [a["id"] for a in alerts[:2]]
    r = client.post("/api/alerts/ack-batch", json={"ids": ids + [99999999]}, headers=auth)
    assert r.status_code == 200
    assert r.json()["acked"] == 2 and r.json()["missing"] == [99999999]
    # 已确认
    remaining = {a["id"] for a in client.get("/api/alerts?unacked=1", headers=auth).json()}
    assert not (set(ids) & remaining)


# ===== RBAC =====
def test_m7_rbac(client, token):
    admin = {"Authorization": f"Bearer {token}"}
    # viewer：读 OK、写 403
    uid, uname, tok = _mk(client, token, "viewer")
    vauth = {"Authorization": f"Bearer {tok}"}
    assert client.get("/api/rooms", headers=vauth).status_code == 200
    assert client.post("/api/rooms", json={"name": "x1"}, headers=vauth).status_code == 403
    assert client.post("/api/devices", json={"id": f"t-{SUF}", "name": "x", "type": "server"},
                       headers=vauth).status_code == 403
    assert client.post("/api/devices/batch-status", json={"ids": ["a"], "status": "warn"},
                       headers=vauth).status_code == 403
    assert client.post("/api/biz-systems", json={"name": "x"}, headers=vauth).status_code == 403
    assert client.post("/api/alerts/ack-batch", json={"ids": [1]}, headers=vauth).status_code == 403
    _cleanup(client, token, uid)

    # operator：写 OK、用户管理 403
    uid, uname, tok = _mk(client, token, "operator")
    oauth = {"Authorization": f"Bearer {tok}"}
    r = client.post("/api/rooms", json={"name": f"t-op-{SUF}", "rows": 1, "cols": 1}, headers=oauth)
    assert r.status_code == 201
    rid = r.json()["id"]
    assert client.delete(f"/api/rooms/{rid}", headers=oauth).status_code == 204
    assert client.get("/api/users", headers=oauth).status_code == 403
    _cleanup(client, token, uid)


def _mk(client, token, role):
    uname = f"t-{role}-{SUF}"
    r = client.post("/api/users", json={"username": uname, "password": "pass123", "role": role},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    lr = client.post("/api/auth/login", json={"username": uname, "password": "pass123"})
    assert lr.status_code == 200, lr.text
    return r.json()["id"], uname, lr.json()["token"]


def _cleanup(client, token, uid):
    client.delete(f"/api/users/{uid}", headers={"Authorization": f"Bearer {token}"})
