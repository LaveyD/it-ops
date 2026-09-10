# IT 运维大屏 · 总体设计

## 1. 项目定位

面向运维人员在电脑端使用的 IT 运维可视化大屏：
- **首页（大屏视图）**：中央网络拓扑 + 两侧图表卡片，兼顾效果演示与交互（悬停、点击穿透）
- **拓扑编辑器**：功能页面之一，基于 GraphVis 3D 引擎（已有成熟实现，见 `/data/project/dct/graph-vis-v1`）
- 后期规划：交互穿透（节点 → 设备详情 → 指标/告警）、collector 数据接入

## 2. 技术选型（已确认）

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | Vue 3 + TypeScript + Vite | 与 GraphVis 官方 Vue 生态一致；组件库按需（大屏以自绘为主） |
| 图表 | ECharts 5 | 暗色主题、地图/仪表盘/趋势，大屏生态最成熟 |
| 状态 | Pinia | 页面少，够用 |
| 后端 | Python FastAPI + SQLAlchemy 2.0 + Alembic | 读多写少 + WebSocket 实时推送；OpenAPI 自动生成 |
| 数据库 | PostgreSQL 17 | 本机 23432（17/main 集群；5432 是旧 Docker 容器勿用），库 `it_ops`；拓扑 JSONB 版本化存储 |
| 实时 | WebSocket（FastAPI 原生） | 告警/指标/状态推送 |
| 认证 | 内置管理员账号（JWT，单账号，无账号体系） | 后期可扩展 |

## 3. 文档索引

| 文档 | 内容 |
|---|---|
| [01-architecture.md](01-architecture.md) | 技术架构、项目结构（apps/web + apps/api）、端口、部署 |
| [02-data-model.md](02-data-model.md) | 数据库表结构、索引、JSONB 约定 |
| [03-api.md](03-api.md) | REST + WebSocket 接口契约 |
| [04-dashboard-ui.md](04-dashboard-ui.md) | 首页布局、主题、拓扑组件移植方案、交互设计 |
| [05-roadmap.md](05-roadmap.md) | 开发里程碑与验收标准 |

## 4. 已确认的产品决策

1. 技术栈：Vue 3 + FastAPI
2. 使用场景：电脑端为主，兼顾演示效果与交互能力；**后期有交互及穿透**（UI 需预留穿透入口）
3. 数据：先 mock，不对接真实源；**预留 collector 抽象**（接口按可替换数据源设计）
4. 认证：内置一个管理员账号，不做账号体系
5. 拓扑规模：几十节点（无大规模渲染压力）
