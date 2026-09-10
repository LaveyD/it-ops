"""设备动作执行抽象（运维操作通道预留）。
当前默认 NoopOperator（全部 501）；后期接 SNMP/设备管理通道 = 新增实现 + OPERATOR 配置切换。"""
from typing import Protocol


class Operator(Protocol):
    name: str
    actions: list[str]

    def can(self, action: str) -> bool:
        ...

    def execute(self, device_id: str, action: str, **params) -> dict:
        """执行动作，返回 {"ok": bool, "message": str}。"""
        ...
