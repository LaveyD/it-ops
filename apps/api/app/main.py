"""FastAPI 入口。"""
import asyncio
import logging

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import alerts, auth, biz_systems, devices, overview, topology
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
    # M1 先只校验 token 能解析；完整鉴权在 M4 收口（WS 走 query token）
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


# ===== 后台 mock 任务（M4 完整化：心跳/重连/广播节奏；M1 仅跑通数据生产）=====
async def _mock_loop():
    """周期性调 mock collector 写库并广播（M4 接入 hub 广播完整消息）。"""
    from .jobs import run_collection
    while True:
        await asyncio.sleep(10)
        try:
            await run_collection()
        except Exception:
            log.exception("mock collection failed")


@app.on_event("startup")
async def _start():
    asyncio.create_task(_mock_loop())


def main():
    import uvicorn
    s = get_settings()
    uvicorn.run("app.main:app", host=s.host, port=s.port, reload=True)


if __name__ == "__main__":
    main()
