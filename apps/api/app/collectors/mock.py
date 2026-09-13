"""Mock 采集器：随机游走指标 + 随机告警 + 随机状态漂移。
内存持有上一轮指标值（进程生命周期内平滑过渡），重启后重新随机。"""
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


class MockCollector:
    name = "mock"

    def __init__(self, device_ids: list[str]):
        self.device_ids = list(device_ids)
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
        metrics, alerts, statuses = [], [], []
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
        return {"metrics": metrics, "alerts": alerts, "statuses": statuses}
