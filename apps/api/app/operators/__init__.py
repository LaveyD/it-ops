"""Operator 工厂：按配置返回实现。"""
from ..config import get_settings
from .base import Operator
from .noop import NoopOperator


def get_operator() -> Operator:
    kind = get_settings().operator
    if kind == "none":
        return NoopOperator()
    raise ValueError(f"未知 operator: {kind}")
