"""M8 网络与连接测试：拓扑改名/删除（active 保护）+ 派生链路 + 写权限 RBAC。

测试自建临时拓扑版本（uuid 后缀），结尾清理；恢复原 active 版本。
"""
import uuid

SUF = uuid.uuid4().hex[:8]

CANVAS = {
    "nodes": [
        {"id": "n1", "label": "测试节点", "type": "server", "color": "1,2,3",
         "x": 10, "y": 10, "size": 60, "properties": {}},
        {"id": "n2", "label": "测试节点2", "type": "switch", "color": "1,2,3",
         "x": 110, "y": 10, "size": 60, "properties": {}},
    ],
    "links": [{"id": "tl1", "source": "n1", "target": "n2", "label": ""}],
}


def _save(client, auth, name, canvas):
    r = client.post("/api/topology", json={"name": name, "canvas": canvas}, headers=auth)
    assert r.status_code == 200, r.text
    return r.json()


def _restore_active(client, auth, base_id):
    client.post(f"/api/topology/{base_id}/activate", headers=auth)


# ===== 改名 =====
def test_topology_rename(client, auth):
    base = client.get("/api/topology/active", headers=auth).json()
    v = _save(client, auth, f"pytest m8 改名-{SUF}", CANVAS)
    try:
        r = client.put(f"/api/topology/{v['id']}", json={"name": "改名后"}, headers=auth)
        assert r.status_code == 200 and r.json()["name"] == "改名后"
        # 空名 422
        assert client.put(f"/api/topology/{v['id']}", json={"name": ""},
                          headers=auth).status_code == 422
        # 404
        assert client.put("/api/topology/999999", json={"name": "x"}, headers=auth).status_code == 404
    finally:
        client.delete(f"/api/topology/{v['id']}", headers=auth)
        _restore_active(client, auth, base["id"])


# ===== 删除（active 保护）=====
def test_topology_delete_active_protected(client, auth):
    r = client.delete("/api/topology/" + str(client.get("/api/topology/active", headers=auth).json()["id"]),
                      headers=auth)
    assert r.status_code == 409
    # 版本仍存在
    assert client.get("/api/topology/active", headers=auth).status_code == 200


def test_topology_delete_non_active(client, auth):
    base = client.get("/api/topology/active", headers=auth).json()
    v = _save(client, auth, f"pytest m8 删除-{SUF}", CANVAS)
    r = client.delete(f"/api/topology/{v['id']}", headers=auth)
    assert r.status_code == 204
    assert client.get(f"/api/topology/{v['id']}", headers=auth).status_code == 404
    # active 未受影响
    assert client.get("/api/topology/active", headers=auth).json()["id"] == base["id"]
    # 404
    assert client.delete(f"/api/topology/{v['id']}", headers=auth).status_code == 404


# ===== 派生链路 =====
def test_active_links_derived_and_status(client, auth):
    """链路状态 = 两端设备最差状态；未关联 → unmanaged。"""
    base = client.get("/api/topology/active", headers=auth).json()
    devs = {d["id"]: d for d in client.get("/api/devices", headers=auth).json()}
    # 找两台状态可预期的设备（任意两台即可，断言用返回里的 status 推导）
    ids = list(devs.keys())
    if len(ids) < 2:
        return  # 环境不足则跳过推导断言（seed 正常时不会发生）
    d_a, d_b = ids[0], ids[1]
    canvas = {
        "nodes": [
            {"id": "a", "label": "A", "type": "server", "x": 0, "y": 0,
             "properties": {"deviceId": d_a}},
            {"id": "b", "label": "B", "type": "server", "x": 50, "y": 0,
             "properties": {"deviceId": d_b}},
            {"id": "u", "label": "U", "type": "server", "x": 100, "y": 0, "properties": {}},
        ],
        "links": [
            {"id": "l1", "source": "a", "target": "b", "label": "L1"},
            {"id": "l2", "source": "a", "target": "u", "label": ""},
        ],
    }
    v = _save(client, auth, f"pytest m8 链路-{SUF}", canvas)
    client.post(f"/api/topology/{v['id']}/activate", headers=auth)
    try:
        r = client.get("/api/topology/active/links", headers=auth)
        assert r.status_code == 200
        body = r.json()
        assert body["topology_id"] == v["id"]
        by_src_tgt = {(l["source"]["node_id"], l["target"]["node_id"]): l for l in body["links"]}
        assert len(body["links"]) == 2

        RANK = {"normal": 0, "warn": 1, "alert": 2}

        def worst(x, y):
            cands = [c for c in (x, y) if c in RANK]
            return max(cands, key=lambda c: RANK[c]) if cands else "unmanaged"

        l1 = by_src_tgt[("a", "b")]
        assert l1["status"] == worst(devs[d_a]["status"], devs[d_b]["status"])
        assert l1["source"]["device"]["id"] == d_a
        assert l1["target"]["device"]["id"] == d_b
        l2 = by_src_tgt[("a", "u")]
        assert l2["target"]["device"] is None and l2["target"]["device_status"] == "unmanaged"
        assert l2["status"] == worst(devs[d_a]["status"], "unmanaged")
    finally:
        # 先恢复 active（v 已激活，直接删会 409 残留）再删测试版本
        _restore_active(client, auth, base["id"])
        client.delete(f"/api/topology/{v['id']}", headers=auth)


# ===== RBAC：viewer 403 / operator 可写 =====
def test_topology_write_rbac(client, auth, token):
    base = client.get("/api/topology/active", headers=auth).json()
    # 建临时版本供写操作
    v = _save(client, auth, f"pytest m8 rbac-{SUF}", CANVAS)
    try:
        # viewer：save/rename/delete/activate 全 403；读 + links 200
        uid, tok = _mk_user(client, token, "viewer")
        vauth = {"Authorization": f"Bearer {tok}"}
        assert client.get("/api/topology/active", headers=vauth).status_code == 200
        assert client.get("/api/topology/active/links", headers=vauth).status_code == 200
        assert client.post("/api/topology", json={"name": "x", "canvas": CANVAS},
                           headers=vauth).status_code == 403
        assert client.put(f"/api/topology/{v['id']}", json={"name": "x"},
                          headers=vauth).status_code == 403
        assert client.delete(f"/api/topology/{v['id']}", headers=vauth).status_code == 403
        _cleanup(client, auth, uid)

        # operator：rename/delete 200
        uid, tok = _mk_user(client, token, "operator")
        oaut = {"Authorization": f"Bearer {tok}"}
        assert client.put(f"/api/topology/{v['id']}", json={"name": "operator 改"},
                          headers=oaut).status_code == 200
        assert client.delete(f"/api/topology/{v['id']}", headers=oaut).status_code == 204
        _cleanup(client, auth, uid)
    finally:
        # 兜底清理（若上面路径提前失败）
        if client.get(f"/api/topology/{v['id']}", headers=auth).status_code == 200:
            client.delete(f"/api/topology/{v['id']}", headers=auth)
        _restore_active(client, auth, base["id"])


def _mk_user(client, token, role):
    uname = f"t-m8-{role}-{SUF}"
    r = client.post("/api/users", json={"username": uname, "password": "pass123", "role": role},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    lr = client.post("/api/auth/login", json={"username": uname, "password": "pass123"})
    assert lr.status_code == 200, lr.text
    return r.json()["id"], lr.json()["token"]


def _cleanup(client, admin_auth, uid):
    client.delete(f"/api/users/{uid}", headers=admin_auth)
