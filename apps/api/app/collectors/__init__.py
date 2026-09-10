"""Collector 工厂：按配置返回实现。"""
from ..config import get_settings
from .base import Collector
from .mock import MockCollector


def get_collector(device_ids: list[str]) -> Collector:
    kind = get_settings().collector
    if kind == "mock":
        return MockCollector(device_ids)
    raise ValueError(f"未知 collector: {kind}")
