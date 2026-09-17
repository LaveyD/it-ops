"""Collector 工厂：按配置返回实现。"""
from ..config import get_settings
from .base import Collector
from .mock import MockCollector


def get_collector(device_ids: list[str], pool_ids: list[int] | None = None,
                  room_ids: list[int] | None = None,
                  room_names: dict[int, str] | None = None) -> Collector:
    kind = get_settings().collector
    if kind == "mock":
        return MockCollector(device_ids, pool_ids=pool_ids, room_ids=room_ids, room_names=room_names)
    raise ValueError(f"未知 collector: {kind}")
