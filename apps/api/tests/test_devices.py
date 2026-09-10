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
