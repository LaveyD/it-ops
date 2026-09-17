"""数据生产抽象：路由层只依赖 Collector 协议，不感知数据来源。
后期接真实源（zabbix/prometheus/动环网关/...）= 新增实现 + COLLECTOR 配置切换。"""
from typing import Protocol


class Collector(Protocol):
    name: str

    def collect(self) -> dict:
        """一次采集，返回本轮新增/更新的数据：
        {
          "metrics":  [{device_id, metric, ts, value}, ...],
          "alerts":   [{device_id, level, title, detail, source?, category?}, ...],
                     # source: device(默认) | security；security 事件 device_id 可缺省
          "statuses": [{device_id, status}, ...],
          "pool_updates":  [{pool_id, used}, ...],
          "room_metrics":  [{room_id, metric, value, ts, source?}, ...],
        }
        无新增返回空列表。
        """
        ...
