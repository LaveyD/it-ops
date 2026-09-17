"""Mock 采集器：随机游走指标 + 随机告警 + 随机状态漂移
+ 终端资产池使用量漂移 + 安防事件 + 机房动环指标。
内存持有上一轮状态（进程生命周期内平滑过渡），重启后重新随机。"""
import random
import time

# 指标基线与波动范围：metric -> (base, step_range, min, max)
PROFILES = {
    "cpu": (42.0, 8.0, 1.0, 99.0),
    "memory": (58.0, 3.0, 10.0, 97.0),
    "net_in": (120.0, 30.0, 0.0, 900.0),   # Mbps
    "net_out": (80.0, 25.0, 0.0, 700.0),
}

ALERT_TEMPLATES = [
    ("warn", "CPU 使用率偏高", "cpu 持续高于 {v:.0f}%"),
    ("warn", "内存使用率偏高", "memory 持续高于 {v:.0f}%"),
    ("info", "接口流量波动", "net_in 短时波动至 {v:.0f} Mbps"),
    ("crit", "CPU 使用率过高", "cpu 超过 95%，持续 {v:.0f} 秒"),
]

# 安防事件模板：level, source, category, title, detail
SECURITY_TEMPLATES = [
    ("warn", "security", "door", "机房门未关闭", "{room} 门未关闭已持续 {v:.0f} 分钟"),
    ("crit", "security", "intrude", "未授权闯入", "{room} 检测到未授权人员闯入"),
    ("warn", "security", "door", "门被长时间开启", "{room} 门开启超过 5 分钟"),
    ("info", "security", "badge", "尾随进入", "{room} 入口检测到尾随（未单独刷卡）"),
]

# 机房动环指标：metric -> (base, step_range, min, max)
ROOM_PROFILES = {
    "temperature": (24.0, 0.4, 16.0, 35.0),   # ℃
    "humidity": (50.0, 1.5, 30.0, 75.0),      # %RH
    "ups_load": (45.0, 2.5, 10.0, 90.0),      # %
}


class MockCollector:
    name = "mock"

    def __init__(self, device_ids: list[str],
                 pool_ids: list[int] | None = None,
                 room_ids: list[int] | None = None,
                 room_names: dict[int, str] | None = None):
        self.device_ids = list(device_ids)
        self.pool_ids = list(pool_ids or [])
        self.room_ids = list(room_ids or [])
        self.room_names = dict(room_names or {})
        self._last: dict[tuple[str, str], float] = {}
        self._tick = 0

    def _walk(self, key: tuple[str, str], base: float, step: float, lo: float, hi: float) -> float:
        prev = self._last.get(key, base + random.uniform(-step, step))
        v = prev + random.uniform(-step, step)
        # 缓慢回拉基线，避免漂移过头
        v += (base - v) * 0.08
        v = max(lo, min(hi, v))
        self._last[key] = v
        return v

    def collect(self) -> dict:
        self._tick += 1
        now = time.time()
        metrics, alerts, statuses, pool_updates, room_metrics = [], [], [], [], []
        for dev in self.device_ids:
            if not self.device_ids:
                break
            for m, (base, step, lo, hi) in PROFILES.items():
                v = self._walk((dev, m), base, step, lo, hi)
                metrics.append({"device_id": dev, "metric": m, "ts": now, "value": round(v, 2)})
            # 每轮 0.2% 概率产生一条告警（≈345 条/天，大屏滚动节奏适中；
            # 早期 8% 约 2.6 万条/天，未确认告警几天内爆炸）
            if random.random() < 0.002:
                level, title, fmt = random.choice(ALERT_TEMPLATES)
                alerts.append({
                    "device_id": dev, "level": level, "title": title,
                    "detail": fmt.format(v=random.uniform(80, 99)),
                })
            # 每轮 3% 概率状态漂移
            if random.random() < 0.03:
                statuses.append({"device_id": dev, "status": random.choice(["normal", "normal", "warn", "alert"])})

        # ---- 安防事件：每轮 0.3% 概率（≈518 条/天，与告警同量级；大屏安防卡滚动节奏适中）----
        if self.room_names and random.random() < 0.003:
            level, source, category, title, fmt = random.choice(SECURITY_TEMPLATES)
            room_id = random.choice(self.room_ids)
            alerts.append({
                "device_id": None, "level": level, "title": title, "source": source,
                "category": category,
                "detail": fmt.format(room=self.room_names[room_id], v=random.uniform(1, 30)),
            })

        # ---- 终端资产池：每轮 1% 概率某个池 used ±1（借还手机/PC），有活性但变化缓慢 ----
        if self.pool_ids and random.random() < 0.01:
            pool_updates.append({"pool_id": random.choice(self.pool_ids), "delta": random.choice([-1, 1, 1])})

        # ---- 机房动环：每轮每个机房全量产出三项（最新值查询语义；source=mock）----
        for rid in self.room_ids:
            for m, (base, step, lo, hi) in ROOM_PROFILES.items():
                v = self._walk((f"room-{rid}", m), base, step, lo, hi)
                room_metrics.append({"room_id": rid, "metric": m, "value": round(v, 2),
                                     "ts": now, "source": "mock"})
        return {
            "metrics": metrics, "alerts": alerts, "statuses": statuses,
            "pool_updates": pool_updates, "room_metrics": room_metrics,
        }
