"""FastAPI 入口。"""
import asyncio
import logging
import time

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import alerts, audit, auth, biz_systems, devices, locations, overview, rooms, topology, users
from .ws import hub

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("it-ops")

app = FastAPI(title="IT 运维大屏 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 内网开发；生产收敛到具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(locations.router)
app.include_router(rooms.router)
app.include_router(audit.router)
app.include_router(topology.router)
app.include_router(devices.router)
app.include_router(alerts.router)
app.include_router(biz_systems.router)
app.include_router(overview.router)


@app.get("/api/health")
def health():
    return {"ok": True}


# ===== WebSocket =====
@app.websocket("/ws/feed")
async def ws_feed(ws: WebSocket, token: str = Query(default="")):
    # WS 走 query token（浏览器 WebSocket API 无法自定义握手 header）；4401 关闭表示未授权
    import jwt as _jwt
    try:
        _jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except Exception:
        await ws.close(code=4401)
        return
    await hub.connect(ws)
    try:
        while True:
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        hub.disconnect(ws)


# ===== 后台任务（M4）：采集广播 5s/轮 + 心跳 15s =====
async def _mock_loop():
    """周期性采集写库并广播 feed_update（空轮不广播）。"""
    from .jobs import run_collection
    while True:
        await asyncio.sleep(5)
        try:
            await run_collection()
        except Exception:
            log.exception("mock collection failed")


async def _heartbeat_loop():
    """服务端心跳：15s 一条 server_ping，供前端检测半开连接。"""
    while True:
        await asyncio.sleep(15)
        try:
            await hub.broadcast({"type": "server_ping", "ts": time.time()})
        except Exception:
            log.exception("heartbeat failed")


@app.on_event("startup")
async def _start():
    asyncio.create_task(_mock_loop())
    asyncio.create_task(_heartbeat_loop())


def main():
    import uvicorn
    s = get_settings()
    uvicorn.run("app.main:app", host=s.host, port=s.port, reload=True)


if __name__ == "__main__":
    main()
