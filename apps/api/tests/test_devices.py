"""设备与告警接口测试。"""
from datetime import datetime, timedelta, timezone


def _window():
    """seed 指标为「seed 时刻 -24h ~ 0」，取该窗口可复现（不依赖当前时间）。"""
    to = datetime.now(timezone.utc)
    return {"from": (to - timedelta(hours=26)).isoformat(), "to": to.isoformat()}


def test_devices_list(client, auth):
    r = client.get("/api/devices", headers=auth)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    d = items[0]
    assert d["id"] and d["name"] and d["status"]
    assert isinstance(d["referenced_by"], list)


def test_device_detail(client, auth):
    r = client.get("/api/devices", headers=auth)
    did = r.json()[0]["id"]
    r2 = client.get(f"/api/devices/{did}", headers=auth)
    assert r2.status_code == 200
    body = r2.json()
    assert body["id"] == did
    assert isinstance(body["latest_metrics"], dict)
    assert isinstance(body["recent_alerts"], list)


def test_device_metrics(client, auth):
    # 固定选有指标的设备（idc/gateway 类型不采集指标，勿用列表首项）
    did = "rtr-core-01"
    r2 = client.get(f"/api/devices/{did}/metrics", headers=auth,
                    params={**_window(), "metric": "cpu"})
    assert r2.status_code == 200
    series = r2.json()
    assert series[0]["metric"] == "cpu"
    assert len(series[0]["points"]) > 0


def test_device_metrics_bad_metric(client, auth):
    r = client.get("/api/devices", headers=auth)
    did = r.json()[0]["id"]
    r2 = client.get(f"/api/devices/{did}/metrics", headers=auth, params={"metric": "nope"})
    assert r2.status_code == 400


def test_device_not_found(client, auth):
    r = client.get("/api/devices/ghost-404", headers=auth)
    assert r.status_code == 404


def test_device_action_501(client, auth):
    r = client.get("/api/devices", headers=auth)
    did = r.json()[0]["id"]
    r2 = client.post(f"/api/devices/{did}/actions/restart", headers=auth)
    assert r2.status_code == 501


def test_alerts_list(client, auth):
    r = client.get("/api/alerts", headers=auth)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    assert items[0]["level"] in ("info", "warn", "crit")
    assert "device_name" in items[0]


def test_alert_ack(client, auth):
    r = client.get("/api/alerts", headers=auth, params={"unacked": "true", "limit": "1"})
    items = r.json()
    if not items:
        return  # 无未确认告警则跳过
    aid = items[0]["id"]
    r2 = client.post(f"/api/alerts/{aid}/ack", headers=auth)
    assert r2.status_code == 200
    assert r2.json()["acked"] is True


def test_alerts_unacked_filter(client, auth):
    """unacked 过滤双向语义：unacked=1 只出未确认，unacked=0 只出已确认。"""
    r = client.get("/api/alerts", headers=auth, params={"unacked": "1", "limit": "500"})
    assert r.status_code == 200
    assert all(a["acked"] is False for a in r.json())
    r0 = client.get("/api/alerts", headers=auth, params={"unacked": "0", "limit": "500"})
    assert all(a["acked"] is True for a in r0.json())


def test_alert_stats(client, auth):
    r = client.get("/api/alerts/stats", headers=auth, params={"days": "7"})
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 7
    for d in items:
        assert set(d.keys()) == {"date", "info", "warn", "crit"}
        assert d["info"] >= 0 and d["warn"] >= 0 and d["crit"] >= 0
    # seed + collector 保证近 7 天有告警
    assert sum(x["info"] + x["warn"] + x["crit"] for x in items) > 0


def test_overview_top(client, auth):
    r = client.get("/api/overview/top", headers=auth,
                   params={"metric": "cpu", "n": "5", "window_hours": "26"})
    assert r.status_code == 200
    items = r.json()
    assert 0 < len(items) <= 5
    assert all(x["metric"] == "cpu" for x in items)
    # 降序
    vals = [x["value"] for x in items]
    assert vals == sorted(vals, reverse=True)
