"""M11 大屏三项：终端资产池 / 安防事件过滤 / 机房动环上报与查询。"""


def test_device_pools_lists_with_free(client, auth):
    r = client.get("/api/device-pools", headers=auth)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) >= 1
    for p in rows:
        assert set(p) >= {"id", "category", "total", "used", "free", "updated_at"}
        assert p["free"] == p["total"] - p["used"]


def test_alerts_source_security_filter(client, auth):
    r = client.get("/api/alerts", params={"source": "security", "limit": 50}, headers=auth)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert rows, "seed 应有安防事件样例"
    for a in rows:
        assert a["source"] == "security"
        assert a["device_id"] is None
    # 反向：device 来源不应混入 security
    r2 = client.get("/api/alerts", params={"source": "device", "limit": 20}, headers=auth)
    for a in r2.json():
        assert a["source"] == "device"


def test_room_monitor_report_and_latest(client, auth):
    # 上报：含一个不存在的机房名（应跳过并计数）
    r = client.post("/api/room-monitor/report", headers=auth, json={
        "items": [
            {"room": "不存在的机房", "metric": "temperature", "value": 20.0},
        ]
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["skipped"] == 1 and body["accepted"] == 0

    # 取 seed 里已有的机房名（Room.name 唯一，seed 建了「总部数据中心」）
    r2 = client.post("/api/room-monitor/report", headers=auth, json={
        "items": [
            {"room": "总部数据中心", "metric": "temperature", "value": 27.5, "source": "test"},
            {"room": "总部数据中心", "metric": "ups_load", "value": 60.0, "source": "test"},
        ]
    })
    assert r2.status_code == 200, r2.text
    assert r2.json() == {"accepted": 2, "skipped": 0}

    # latest 应包含刚上报的值（source=test，且为最新）
    r3 = client.get("/api/room-monitor/latest", headers=auth)
    assert r3.status_code == 200, r3.text
    rows = {f"{x['room_name']}:{x['metric']}": x for x in r3.json()}
    temp = rows.get("总部数据中心:temperature")
    ups = rows.get("总部数据中心:ups_load")
    assert temp is not None and temp["value"] == 27.5 and temp["source"] == "test"
    assert ups is not None and ups["value"] == 60.0 and ups["source"] == "test"


def test_room_monitor_history_unknown_room_404(client, auth):
    r = client.get("/api/room-monitor/history",
                   params={"room": "不存在的机房", "metric": "temperature"}, headers=auth)
    assert r.status_code == 404


def test_room_monitor_history_known_room(client, auth):
    r = client.get("/api/room-monitor/history",
                   params={"room": "总部数据中心", "metric": "temperature", "hours": 2}, headers=auth)
    assert r.status_code == 200, r.text
    pts = r.json()
    assert isinstance(pts, list) and len(pts) >= 1
    # 升序
    ts = [p["ts"] for p in pts]
    assert ts == sorted(ts)
