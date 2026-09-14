"""幂等种子：示例拓扑 v1（含分组+设备关联）+ mock 设备 + 指标 + 告警 + 业务系统。
运行：uv run python -m app.seed
幂等：已有生效拓扑/设备则跳过（不重复插入）。"""
import random
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from .config import get_settings
from .db import SessionLocal
from .models import (Alert, BizSystem, Cabinet, Device, DeviceMetric, Location, Room,
                     Topology, TopologyNodeDevice, User)
from .security import hash_password

# ===== 初始拓扑 v2（5 分区 / 23 节点 / 23 连线，结构参考 TDDC 网络拓扑数据）=====
# 分区色（hex）：外网紫 / 边界红 / DMZ 青 / 办公绿 / 服务器蓝
ZONES = [
    # label, 填充 "r,g,b", 边框 "r,g,b"
    ("外网/专线", "114,46,209", "114,46,209"),
    ("边界安全区", "245,34,45", "245,34,45"),
    ("DMZ区", "19,194,194", "19,194,194"),
    ("办公网", "82,196,26", "82,196,26"),
    ("服务器区", "24,144,255", "24,144,255"),
]
ZONE_MEMBERS = {
    "外网/专线": ["isp-main", "isp-bak"],
    "边界安全区": ["edge-router", "core-fw", "ips-1"],
    "DMZ区": ["lb-1", "web-1", "web-2", "mail-1"],
    "办公网": ["office-fw", "office-sw-core", "office-sw-acc", "ap-1", "pc-1", "pc-2"],
    "服务器区": ["server-fw", "server-sw", "app-1", "app-2", "backup-1", "db-1", "file-1", "storage-1"],
}
INITIAL_NODES = [
    # 外网/专线（顶部居中）
    {"id": "isp-main", "label": "ISP 主专线", "type": "router", "color": "54,179,126", "size": 46, "x": 400, "y": 70},
    {"id": "isp-bak", "label": "ISP 备专线", "type": "router", "color": "54,179,126", "size": 46, "x": 580, "y": 70},
    # 边界安全区（中轴，核心防火墙居中）
    {"id": "edge-router", "label": "边界路由器", "type": "router", "color": "54,179,126", "size": 46, "x": 480, "y": 265},
    {"id": "core-fw", "label": "核心防火墙", "type": "firewall", "color": "245,108,108", "size": 46, "x": 480, "y": 380},
    {"id": "ips-1", "label": "IPS 入侵防御", "type": "sec", "color": "251,113,133", "size": 46, "x": 300, "y": 330},
    # DMZ（左侧纵列，整组左移拉开与边界区的间距）
    {"id": "mail-1", "label": "邮件服务器", "type": "server", "color": "167,139,250", "size": 46, "x": 40, "y": 130},
    {"id": "web-1", "label": "Web 服务器-A", "type": "server", "color": "167,139,250", "size": 46, "x": 20, "y": 245},
    {"id": "web-2", "label": "Web 服务器-B", "type": "server", "color": "167,139,250", "size": 46, "x": 150, "y": 245},
    {"id": "lb-1", "label": "负载均衡器", "type": "loadbalancer", "color": "45,212,191", "size": 46, "x": 85, "y": 365},
    # 办公网（底部居中，中轴最下）
    {"id": "office-fw", "label": "办公网防火墙", "type": "firewall", "color": "245,108,108", "size": 46, "x": 480, "y": 520},
    {"id": "office-sw-core", "label": "办公核心交换机", "type": "switch", "color": "64,158,255", "size": 46, "x": 410, "y": 615},
    {"id": "office-sw-acc", "label": "办公接入交换机", "type": "switch", "color": "64,158,255", "size": 46, "x": 575, "y": 615},
    {"id": "ap-1", "label": "无线 AP", "type": "collect", "color": "148,163,184", "size": 46, "x": 300, "y": 700},
    {"id": "pc-1", "label": "办公终端-1", "type": "collect", "color": "148,163,184", "size": 46, "x": 475, "y": 705},
    {"id": "pc-2", "label": "办公终端-2", "type": "collect", "color": "148,163,184", "size": 46, "x": 650, "y": 700},
    # 服务器区（右侧纵长条，整组右移拉开与办公网/边界的间距）
    {"id": "server-fw", "label": "服务器区防火墙", "type": "firewall", "color": "245,108,108", "size": 46, "x": 920, "y": 235},
    {"id": "server-sw", "label": "服务器核心交换机", "type": "switch", "color": "64,158,255", "size": 46, "x": 920, "y": 340},
    {"id": "app-1", "label": "应用服务器-1", "type": "server", "color": "167,139,250", "size": 46, "x": 790, "y": 445},
    {"id": "app-2", "label": "应用服务器-2", "type": "server", "color": "167,139,250", "size": 46, "x": 1010, "y": 445},
    {"id": "db-1", "label": "数据库服务器", "type": "server", "color": "167,139,250", "size": 46, "x": 790, "y": 550},
    {"id": "file-1", "label": "文件服务器", "type": "server", "color": "167,139,250", "size": 46, "x": 1010, "y": 550},
    {"id": "backup-1", "label": "备份服务器", "type": "server", "color": "167,139,250", "size": 46, "x": 790, "y": 655},
    {"id": "storage-1", "label": "核心存储", "type": "db", "color": "245,158,11", "size": 46, "x": 1010, "y": 655},
]


def _link(lid, src, tgt, speed, status="active", sp=None, tp=None):
    props = {"speed": speed, "status": status}
    if sp: props["sourcePort"] = sp
    if tp: props["targetPort"] = tp
    return {"id": lid, "source": src, "target": tgt, "label": "", "properties": props}


INITIAL_LINKS = [
    _link("l01", "isp-main", "edge-router", "10G", sp="G0/0/0", tp="Gig0/0"),
    _link("l02", "isp-bak", "edge-router", "1G", status="faulty", sp="G0/0/0", tp="Gig0/1"),
    _link("l03", "edge-router", "core-fw", "10G", sp="Gig0/2", tp="Gig0/0/0"),
    _link("l04", "core-fw", "ips-1", "10G", sp="Gig0/0/1", tp="eth0"),
    _link("l05", "ips-1", "lb-1", "10G", sp="eth1", tp="Gig0/0"),
    _link("l06", "lb-1", "web-1", "1G", sp="Gig1/0", tp="eth1"),
    _link("l07", "lb-1", "web-2", "1G", sp="Gig1/1", tp="eth1"),
    _link("l08", "web-2", "mail-1", "1G", sp="eth2", tp="eth1"),
    _link("l09", "core-fw", "office-fw", "1G", sp="Gig0/0/2", tp="Gig0/0/0"),
    _link("l10", "office-fw", "office-sw-core", "1G", sp="Gig0/0/1", tp="XGE1/0/1"),
    _link("l11", "office-sw-core", "office-sw-acc", "1G", sp="XGE1/0/2", tp="XGE1/0/1"),
    _link("l12", "office-sw-core", "ap-1", "1G", sp="GE1/0/1", tp="eth0"),
    _link("l13", "office-sw-acc", "pc-1", "1G", sp="GE1/0/1", tp="eth0"),
    _link("l14", "office-sw-acc", "pc-2", "1G", status="faulty", sp="GE1/0/2", tp="eth0"),
    _link("l15", "core-fw", "server-fw", "10G", sp="Gig0/0/3", tp="Gig0/0/0"),
    _link("l16", "server-fw", "server-sw", "10G", sp="Gig0/0/1", tp="XGE1/0/1"),
    _link("l17", "server-sw", "app-1", "10G", sp="XGE1/0/2", tp="eth1"),
    _link("l18", "server-sw", "app-2", "10G", sp="XGE1/0/3", tp="eth1"),
    _link("l19", "server-sw", "db-1", "10G", sp="XGE1/0/4", tp="eth1"),
    _link("l20", "server-sw", "file-1", "10G", sp="XGE1/0/5", tp="eth1"),
    _link("l21", "server-sw", "backup-1", "1G", sp="XGE1/0/6", tp="eth1"),
    _link("l22", "db-1", "storage-1", "16G", sp="FC1", tp="FC1"),
    _link("l23", "app-1", "db-1", "10G", sp="eth2", tp="eth2"),
]
INITIAL_GROUPS = [
    {
        "label": label, "shape": "round", "padding": 20, "alpha": 0.10,
        "headerAlpha": 0.88, "borderWidth": 1.5, "borderColor": border,
        "dash": [], "font": "bold 13px Arial", "textAlign": "center",
        "fontColor": "255,255,255", "fillColor": fill, "headerColor": border,
        "headerHeight": 30, "textOffsetX": 0,
        "selectedBorderColor": "47,123,255", "selectedBorderWidth": 2,
        "memberIds": ZONE_MEMBERS[label],
    }
    for label, fill, border in ZONES
]

# 节点 -> 设备 关联（部分节点纳管；复用现有设备，保留 normal/warn/alert 分布）
NODE_DEVICE = {
    "edge-router": "rtr-core-01",      # 核心路由器-01 (normal)
    "core-fw": "fw-01",                # 边界防火墙-01 (normal)
    "office-fw": "fw-02",              # 边界防火墙-02 (warn)
    "server-fw": "fw-03",              # 数据区防火墙 (normal)
    "office-sw-core": "swt-aggr-01",   # 汇聚交换机 (normal)
    "office-sw-acc": "swt-lan-01",     # 接入交换机 (normal)
    "app-1": "srv-app-01",             # 应用服务器-01 (normal)
    "app-2": "srv-app-02",             # 应用服务器-02 (alert)
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

# 示例位置注册表（M6，三维机房 M7 会扩展）
LOCATIONS = [
    ("总部机房", "machine_room", "总部园区 A 座 3F"),
    ("分部", "branch", "分部办公楼"),
    ("数据中心", "machine_room", "自建机房"),
]

# 示例机房（M7）：总部数据中心 2 行 × 12 机柜，机柜名 A1-01..A2-12
# 设备 U 位填充：device_id -> (机柜列, u_start)；按行1布置（row=1）
ROOM_NAME = "总部数据中心"
ROOM_ROWS, ROOM_COLS = 2, 12
DEVICE_U_SLOTS = {
    "rtr-core-01": (1, 36), "rtr-core-02": (1, 18),
    "fw-01": (2, 36), "fw-02": (2, 18),
    "swt-aggr-01": (3, 36), "swt-lan-01": (3, 18),
    "fw-03": (4, 36), "fw-04": (4, 18),
    "srv-app-01": (5, 36), "srv-app-02": (5, 18),
}

METRIC_BASE = {"cpu": 45, "memory": 60, "net_in": 120, "net_out": 80}


def _ts(t: float) -> datetime:
    return datetime.fromtimestamp(t, tz=timezone.utc)


def seed(force: bool = False) -> None:
    db = SessionLocal()
    try:
        # ---- 管理员账号（.env ADMIN_USER/ADMIN_PASSWORD → user 表首个 admin，幂等）----
        # 只创建不覆盖：用户在管理台改密码后，重跑 seed 不会把密码打回 .env 值。
        s = get_settings()
        admin = db.scalar(select(User).where(User.username == s.admin_user))
        if admin is None:
            db.add(User(username=s.admin_user, password_hash=hash_password(s.admin_password),
                        display_name="管理员", role="admin"))
            print(f"管理员账号已创建（{s.admin_user}）")
        else:
            print(f"管理员账号已存在，跳过（{s.admin_user}）")

        # ---- 位置注册表 ----
        existing_locs = set(db.execute(select(Location.name)).scalars())
        for name, zt, remark in LOCATIONS:
            if name not in existing_locs:
                db.add(Location(name=name, zone_type=zt, remark=remark))
        db.flush()
        print(f"位置注册表已就绪（{len(LOCATIONS)} 条）")

        # ---- 示例机房 + 机柜（M7，幂等）----
        room = db.scalar(select(Room).where(Room.name == ROOM_NAME))
        if room is None:
            loc_hq = db.scalar(select(Location).where(Location.name == "数据中心"))
            room = Room(name=ROOM_NAME, location_id=loc_hq.id if loc_hq else None,
                        rows=ROOM_ROWS, cols=ROOM_COLS, remark="示例机房（M7 seed）")
            db.add(room)
            db.flush()
            for r in range(1, ROOM_ROWS + 1):
                for c in range(1, ROOM_COLS + 1):
                    db.add(Cabinet(room_id=room.id, name=f"A{r}-{c:02d}",
                                   row=r, col=c, u_height=42))
            print(f"示例机房已创建（{ROOM_NAME} {ROOM_ROWS}×{ROOM_COLS}）")
        else:
            print(f"示例机房已存在，跳过（{room.name}）")
        # 设备 U 位填充统一放在设备落库后（见「设备」段之后）

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
        links = [dict(l) for l in INITIAL_LINKS]
        canvas = {"nodes": nodes, "links": links, "groups": list(INITIAL_GROUPS)}

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
            print(f"拓扑 v1 已创建（{len(nodes)} 节点 / {len(links)} 连线 / {len(INITIAL_GROUPS)} 分区 / {len(NODE_DEVICE)} 关联）")

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

        # ---- 设备 U 位填充（M7，幂等：只填 cabinet_id 为空的）----
        if room is not None:
            cabs = {c.name: c for c in db.execute(
                select(Cabinet).where(Cabinet.room_id == room.id)).scalars()}
            filled = 0
            for did, (col, u) in DEVICE_U_SLOTS.items():
                d = db.get(Device, did)
                cab = cabs.get(f"A1-{col:02d}")
                if d is None or cab is None or d.cabinet_id is not None:
                    continue
                d.cabinet_id = cab.id
                d.u_start = u
                filled += 1
            if filled:
                print(f"设备 U 位已填充 {filled} 台")

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
