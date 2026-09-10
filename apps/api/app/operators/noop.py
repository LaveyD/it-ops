"""无操作 Operator：全部动作不可用（501 占位）。"""


class NoopOperator:
    name = "none"
    actions: list[str] = []

    def can(self, action: str) -> bool:
        return False

    def execute(self, device_id: str, action: str, **params) -> dict:
        return {"ok": False, "message": f"操作能力待 collector/operator 接入（action={action}）"}
