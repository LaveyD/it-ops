# IT 运维大屏

前后端分离的 IT 运维可视化大屏：网络拓扑（GraphVis 3D 引擎）+ 图表卡片 + 实时告警。

## 文档

设计文档见 [docs/](docs/README.md)：

- [01 技术架构](docs/01-architecture.md) — 选型、`apps/web` + `apps/api` 结构、collector 预留
- [02 数据模型](docs/02-data-model.md) — PostgreSQL 表结构
- [03 API 契约](docs/03-api.md) — REST + WebSocket
- [04 大屏 UI](docs/04-dashboard-ui.md) — 布局、主题、拓扑组件移植、穿透设计
- [05 开发计划](docs/05-roadmap.md) — M1~M5 里程碑与验收标准

## 快速开始（开发中，按 docs/05-roadmap.md 实施）

```bash
# 后端（apps/api）
cd apps/api && uv sync && alembic upgrade head && uv run python -m app.seed
uv run uvicorn app.main:app --reload --port 8100

# 前端（apps/web）
cd apps/web && npm install && npm run dev   # :5173，代理到 :8100
```
