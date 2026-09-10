"""幂等种子：示例拓扑 v1（含分组+设备关联）+ mock 设备 + 指标 + 告警 + 业务系统。
运行：uv run python -m app.seed
幂等：已有生效拓扑/设备则跳过（不重复插入）。"""
import random
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from .db import SessionLocal
from .models import Alert, BizSystem, Device, DeviceMetric, Topology, TopologyNodeDevice

# ===== 初始拓扑（来自 graph-vis-v1 示例，24 节点/25 连线 + 1 分组）=====
INITIAL_NODES = [
    {"id": "collect1", "label": "采集设备", "type": "collect", "color": "90,140,200", "size": 56, "x": 250, "y": 90},
    {"id": "router1", "label": "路由器", "type": "router", "color": "46,108,220", "size": 60, "x": 180, "y": 210},
    {"id": "router2", "label": "路由器", "type": "router", "color": "46,108,220", "size": 60, "x": 330, "y": 210},
    {"id": "fw1", "label": "防火墙", "type": "firewall", "color": "214,80,80", "size": 56, "x": 150, "y": 340},
    {"id": "fw2", "label": "防火墙", "type": "firewall", "color": "214,80,80", "size": 56, "x": 360, "y": 340},
    {"id": "app1", "label": "应用系统", "type": "app", "color": "80,150,170", "size": 54, "x": 120, "y": 470},
    {"id": "app2", "label": "应用系统", "type": "app", "color": "80,150,170", "size": 54, "x": 390, "y": 470},
    {"id": "room", "label": "计算机房", "type": "idc", "color": "90,120,200", "size": 58, "x": 540, "y": 90},
    {"id": "atm1", "label": "ATM路由器", "type": "atm", "color": "116,120,224", "size": 58, "x": 470, "y": 210},
    {"id": "atm2", "label": "ATM路由器", "type": "atm", "color": "116,120,224", "size": 58, "x": 620, "y": 210},
    {"id": "fw3", "label": "防火墙", "type": "firewall", "color": "214,80,80", "size": 56, "x": 450, "y": 340},
    {"id": "fw4", "label": "防火墙", "type": "firewall", "color": "214,80,80", "size": 56, "x": 640, "y": 340},
    {"id": "mgmt1", "label": "管理平台", "type": "mgmt", "color": "230,90,120", "size": 52, "x": 800, "y": 90},
    {"id": "mgmt2", "label": "管理平台", "type": "mgmt", "color": "230,90,120", "size": 52, "x": 880, "y": 90},
    {"id": "mgmt3", "label": "管理平台", "type": "mgmt", "color": "230,90,120", "size": 52, "x": 960, "y": 90},
    {"id": "gw", "label": "智能家庭网关", "type": "gateway", "color": "224,110,60", "size": 58, "x": 880, "y": 220},
    {"id": "aggr", "label": "汇聚交换机", "type": "aggr", "color": "41,128,185", "size": 62, "x": 300, "y": 600},
    {"id": "lan", "label": "组网交换机", "type": "switch", "color": "52,152,219", "size": 62, "x": 560, "y": 600},
    {"id": "fw5", "label": "防火墙", "type": "firewall", "color": "214,80,80", "size": 56, "x": 360, "y": 720},
    {"id": "fw6", "label": "防火墙", "type": "firewall", "color": "214,80,80", "size": 56, "x": 500, "y": 720},
    {"id": "home", "label": "家庭", "type": "home", "color": "224,148,66", "size": 54, "x": 240, "y": 840},
    {"id": "corp", "label": "公司", "type": "corp", "color": "120,140,210", "size": 54, "x": 360, "y": 850},
    {"id": "factory", "label": "工厂", "type": "factory", "color": "200,120,90", "size": 54, "x": 500, "y": 850},
    {"id": "apt", "label": "公寓", "type": "apt", "color": "150,120,200", "size": 54, "x": 620, "y": 840},
]
INITIAL_LINKS = [
    ("l1", "collect1", "router1"), ("l2", "collect1", "router2"), ("l3", "router1", "fw1"),
    ("l4", "router2", "fw2"), ("l5", "fw1", "app1"), ("l6", "fw2", "app2"),
    ("l7", "room", "atm1"), ("l8", "room", "atm2"), ("l9", "atm1", "fw3"),
    ("l10", "atm2", "fw4"), ("l11", "mgmt1", "gw"), ("l12", "mgmt2", "gw"),
    ("l13", "mgmt3", "gw"), ("l14", "app1", "aggr"), ("l15", "app2", "aggr"),
    ("l16", "fw3", "aggr"), ("l17", "gw", "lan"), ("l18", "aggr", "fw5"),
    ("l19", "lan", "fw6"), ("l20", "fw5", "home"), ("l21", "fw5", "corp"),
    ("l22", "fw6", "factory"), ("l23", "fw6", "apt"), ("l24", "fw5", "factory"),
    ("l25", "fw6", "corp"),
]
INITIAL_GROUP = {
    "label": "终端接入区", "shape": "round", "padding": 20, "alpha": 0.5,
    "headerAlpha": 0.8, "borderWidth": 2, "borderColor": "80,140,255",
    "dash": [6, 4], "font": "normal 14px Arial", "textAlign": "center",
    "fontColor": "255,255,255", "fillColor": "40,70,140", "headerColor": "30,50,120",
    "headerHeight": 36, "textOffsetX": 0,
    "selectedBorderColor": "30,30,250", "selectedBorderWidth": 2,
    "memberIds": ["home", "corp", "factory", "apt"],
}

# 节点 -> 设备 关联（部分节点纳管）
NODE_DEVICE = {
    "router1": "rtr-core-01", "router2": "rtr-core-02",
    "fw1": "fw-01", "fw2": "fw-02", "fw3": "fw-03", "fw4": "fw-04",
    "aggr": "swt-aggr-01", "lan": "swt-lan-01",
    "app1": "srv-app-01", "app2": "srv-app-02",
    "room": "idc-hq-01", "gw": "gw-home-01",
}

DEVICES = [
    # id, name, type, ip, location, owner, status
    ("rtr-core-01", "核心路由器-01", "router", "10.0.0.1", "总部机房", "张工", "normal"),
    ("rtr-core-02", "核心路由器-02", "router", "10.0.0.2", "总部机房", "张工", "normal"),
    ("fw-01", "边界防火墙-01", "firewall", "10.0.1.1", "总部机房", "李工", "normal"),
    ("fw-02", "边界防火墙-02", "firewall", "10.0.1.2", "总部机房", "李工", "warn"),
    ("fw-03", "数据区防火墙", "firewall", "10.0.2.1", "总部机房", "李工", "normal"),
    ("fw-04", "DMZ防火墙", "firewall", "10.0.2.2", "总部机房", "李工", "normal"),
    ("swt-aggr-01", "汇聚交换机", "switch", "10.0.3.1", "总部机房", "王工", "normal"),
    ("swt-lan-01", "接入交换机", "switch", "10.0.3.2", "总部机房", "王工", "normal"),
    ("srv-app-01", "应用服务器-01", "server", "10.0.10.11", "总部机房", "赵工", "normal"),
    ("srv-app-02", "应用服务器-02", "server", "10.0.10.12", "总部机房", "赵工", "alert"),
    ("idc-hq-01", "总部机房", "idc", None, "总部", "运维", "normal"),
    ("gw-home-01", "智能网关", "gateway", "192.168.1.1", "分部", "运维", "normal"),
]

BIZ_SYSTEMS = [
    ("OA 办公系统", "行政部", "normal", 99.9, 99.95),
    ("CRM 客户系统", "业务部", "normal", 99.9, 99.92),
    ("财务系统", "财务部", "warn", 99.95, 99.80),
    ("数据平台", "数据部", "normal", 99.9, 99.97),
    ("统一认证", "安全部", "normal", 99.99, 99.99),
]

METRIC_BASE = {"cpu": 45, "memory": 60, "net_in": 120, "net_out": 80}


def _ts(t: float) -> datetime:
    return datetime.fromtimestamp(t, tz=timezone.utc)


def seed(force: bool = False) -> None:
    db = SessionLocal()
    try:
        has_topo = db.scalar(select(Topology.id)) is not None
        has_dev = db.scalar(select(Device.id)) is not None

        # ---- 拓扑 ----
        nodes = []
        for n in INITIAL_NODES:
            n = dict(n)
            dev = NODE_DEVICE.get(n["id"])
            n["properties"] = {"deviceId": dev} if dev else {}
            n.setdefault("alpha", 1)
            n.setdefault("radius", n.get("size", 60) // 2)
            n.setdefault("fillColor", n.get("color"))
            nodes.append(n)
        links = [{"id": i, "source": s, "target": t, "label": ""} for i, s, t in INITIAL_LINKS]
        canvas = {"nodes": nodes, "links": links, "groups": [INITIAL_GROUP]}

        if has_topo and not force:
            print("已存在拓扑，跳过拓扑种子（force=True 可重建）")
        else:
            # force 重建：删除旧拓扑版本（topology_node_device 由 FK ondelete CASCADE 联动清理）
            for t in db.execute(select(Topology)).scalars():
                db.delete(t)
            db.flush()
            topo = Topology(name="默认拓扑", canvas=canvas, version=1, is_active=True)
            db.add(topo)
            db.flush()
            for node_id, device_id in NODE_DEVICE.items():
                db.add(TopologyNodeDevice(topology_id=topo.id, node_id=node_id, device_id=device_id))
            print(f"拓扑 v1 已创建（{len(nodes)} 节点 / {len(links)} 连线 / 1 分组 / {len(NODE_DEVICE)} 关联）")

        # ---- 设备 ----
        if has_dev and not force:
            print("已存在设备，跳过设备种子")
        else:
            for did, name, dtype, ip, loc, owner, status in DEVICES:
                db.merge(Device(id=did, name=name, type=dtype, ip=ip,
                                location=loc, owner=owner, status=status))
            db.flush()  # 确保设备落库，后续指标/告警外键可解析
            print(f"设备 {len(DEVICES)} 台已创建")

            # ---- 指标：近 24h，每 5min 一条 ----
            now = time.time()
            step = 300
            for did, _name, dtype, _ip, _loc, _owner, _status in DEVICES:
                if dtype in ("idc", "gateway"):
                    continue
                for m, base in METRIC_BASE.items():
                    v = base + random.uniform(-10, 10)
                    for i in range(int(24 * 3600 / step)):
                        ts = now - (i + 1) * step
                        v += random.uniform(-4, 4)
                        v += (base - v) * 0.05
                        v = max(1, min(99, v))
                        db.add(DeviceMetric(device_id=did, metric=m, ts=_ts(ts), value=round(v, 2)))
            print("指标 24h × 5min 已生成")

            # ---- 告警 ----
            samples = [
                ("srv-app-02", "crit", "CPU 使用率过高", "cpu 96.8% 持续 120s"),
                ("fw-02", "warn", "内存使用率偏高", "memory 88%"),
                ("fw-02", "info", "配置变更", "管理员修改了 ACL 规则"),
                ("rtr-core-01", "info", "路由收敛", "OSPF 邻居重收敛完成"),
                ("srv-app-01", "warn", "磁盘空间不足", "disk /data 使用 91%"),
            ]
            # 近 7 天历史告警（让「告警等级统计」堆叠柱有分布），时间均匀散布
            for d in range(7):
                for j in range(random.randint(2, 4)):
                    did, lv, title, detail = random.choice(samples)
                    offset = d * 86400 + random.uniform(0, 86400)
                    db.add(Alert(device_id=did, level=lv, title=title, detail=detail,
                                 created_at=_ts(now - offset), acked=random.random() < 0.7))
            for i, (did, lv, title, detail) in enumerate(samples):
                db.add(Alert(device_id=did, level=lv, title=title, detail=detail,
                             created_at=_ts(now - (i + 1) * 1800), acked=i > 2))
            print("告警 近7天历史 + 5 条实时样例 已创建")

        # ---- 业务系统 ----
        existing = set(db.execute(select(BizSystem.name)).scalars())
        missing = [row for row in BIZ_SYSTEMS if row[0] not in existing]
        if missing or force:
            for name, owner, status, sla_t, sla_a in missing:
                db.add(BizSystem(name=name, owner=owner, status=status,
                                 sla_target=sla_t, sla_actual=sla_a))
            print(f"业务系统新增 {len(missing)} 个（已存在 {len(existing)} 个跳过）")

        db.commit()
        print("seed 完成。")
    finally:
        db.close()


if __name__ == "__main__":
    import sys
    seed(force="--force" in sys.argv)
