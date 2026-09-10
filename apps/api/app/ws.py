"""WebSocket 连接 hub（进程内广播；后期可换 Redis pub/sub）。"""
import asyncio
import json
import logging
from dataclasses import dataclass, field

from fastapi import WebSocket

log = logging.getLogger("it-ops.ws")


@dataclass
class Hub:
    _conns: set[WebSocket] = field(default_factory=set)

    @property
    def size(self) -> int:
        return len(self._conns)

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._conns.add(ws)
        log.info("ws connected, conns=%d", self.size)

    def disconnect(self, ws: WebSocket) -> None:
        self._conns.discard(ws)
        log.info("ws disconnected, conns=%d", self.size)

    async def broadcast(self, message: dict) -> None:
        if not self._conns:
            return
        data = json.dumps(message, ensure_ascii=False, default=str)
        dead = []
        for ws in list(self._conns):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._conns.discard(ws)


hub = Hub()
