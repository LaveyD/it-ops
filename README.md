# IT 运维大屏

前后端分离的 IT 运维可视化大屏：网络拓扑（GraphVis 3D 引擎）+ ECharts 图表卡片 + WebSocket 实时告警/指标。

- 前端：Vue 3 + TypeScript + Vite + ECharts（`apps/web`）
- 后端：FastAPI + SQLAlchemy 2.0 + Alembic（`apps/api`）
- 数据库：PostgreSQL（默认 `127.0.0.1:23432`）
- 拓扑引擎：GraphVis 3D（`apps/web/public/topology/`）

## 文档

设计文档见 [docs/](docs/README.md)：

- [01 技术架构](docs/01-architecture.md) — 选型、目录结构、collector/operator 抽象
- [02 数据模型](docs/02-data-model.md) — PostgreSQL 表结构
- [03 API 契约](docs/03-api.md) — REST + WebSocket 消息
- [04 大屏 UI](docs/04-dashboard-ui.md) — 布局、主题、拓扑移植、穿透设计
- [05 开发计划](docs/05-roadmap.md) — M1~M5 里程碑与验收标准（M1~M5 已完成）

## 端口约定

| 用途 | 端口 |
|---|---|
| 前端 dev（Vite，proxy `/api`、`/ws` → 8110） | 5174 |
| 后端 dev / 生产（uvicorn） | 8110 |
| 生产入口（Nginx 静态 + 反代） | 8041 |

> 8100 为 Hermes Web UI，勿占用。

## 环境变量（后端 `apps/api/.env`）

| 变量 | 说明 | 默认 |
|---|---|---|
| `DATABASE_URL` | 数据库连接串（`postgresql+psycopg://…`） | 指向 23432 |
| `JWT_SECRET` | JWT 签名密钥（生产必须改） | dev-secret |
| `JWT_EXPIRE_MINUTES` | 登录 token 有效期（分钟） | 720 |
| `ADMIN_USER` / `ADMIN_PASSWORD` | 内置管理员账号（无注册/改密） | admin / admin |
| `HOST` / `PORT` | 后端监听 | 0.0.0.0 / 8110 |
| `COLLECTOR` | 采集器：`mock`（内置模拟随机游走） | mock |
| `OPERATOR` | 运维动作执行器：`none`（动作返回 501） | none |

> 时间戳统一 aware-UTC 存储（ORM 端默认），东八区部署无需额外时区配置。

## 开发模式

前置：PostgreSQL 已启动，库与角色已建好（如 `it_ops` / `it_ops` 库，凭据见 `.env`）。

```bash
# 1. 后端
cd apps/api
uv sync                      # 装依赖（或 pip install -e .）
alembic upgrade head         # 建表/迁移
uv run python -m app.seed    # 种子数据（--force 清空重建）
uv run uvicorn app.main:app --host 0.0.0.0 --port 8110   # 采集循环每 5s 一轮

# 2. 前端（另开终端）
cd apps/web
npm install
npm run dev                  # :5174，已配置代理 /api、/ws → 8110
```

浏览器打开 `http://<host>:5174`，用 `ADMIN_USER`/`ADMIN_PASSWORD` 登录。

测试：

```bash
cd apps/api && uv run pytest -q        # 后端（含 WS/拓扑/告警）
cd apps/web && npx vue-tsc --noEmit    # 前端类型
```

## 生产部署（Nginx）

```bash
# 1. 前端构建
cd apps/web && npm run build           # 产物 → apps/web/dist

# 2. 后端常驻（生产建议 systemd，示例为直接起进程）
cd apps/api
uv run uvicorn app.main:app --host 0.0.0.0 --port 8110

# 3. Nginx
sudo cp deploy/nginx-itops.conf /etc/nginx/conf.d/itops.conf
sudo nginx -t && sudo nginx -s reload
```

`deploy/nginx-itops.conf`：`:8041` 静态托管 `apps/web/dist`（SPA `try_files` 兜底）+ `/api/`、`/ws/`（含 Upgrade 头）反代 `127.0.0.1:8110`。改 `root` 路径为实际部署位置、改端口后 `nginx -t` 即可。

浏览器打开 `http://<host>:8041`。

## 目录结构

```
apps/
├── api/                 # FastAPI 后端
│   ├── app/
│   │   ├── main.py      # 应用入口 + WS /ws/feed + 采集/心跳后台任务
│   │   ├── models.py    # SQLAlchemy ORM（时间戳 ORM 端默认）
│   │   ├── jobs.py      # 采集轮询：collector → 写库 → 合并广播 feed_update
│   │   ├── ws.py        # 进程内 WS hub（connect/disconnect/broadcast）
│   │   ├── collectors/  # mock 采集器（随机游走指标 + 概率告警/状态漂移）
│   │   ├── routers/     # auth / devices / alerts / topology / overview / biz
│   │   ├── seed.py      # 种子数据（python -m app.seed [--force]）
│   │   └── config.py    # pydantic-settings（.env）
│   ├── alembic/         # 数据库迁移
│   └── tests/           # pytest（auth/devices/topology/ws）
├── web/                 # Vue3 前端
│   ├── public/topology/ # GraphVis 引擎 + 3D 图标
│   └── src/
│       ├── composables/ # useEChart（图表生命周期）/ useWs（WS 单例 feed bus）
│       ├── components/  # 图表卡片 + 拓扑引擎封装（topo-core / GraphView / 抽屉）
│       └── views/       # Dashboard / DeviceDetail / TopologyEditor / Login
deploy/
└── nginx-itops.conf     # 生产 Nginx 模板（:8041）
docs/                    # 设计文档
```

## 页面

| 路由 | 说明 |
|---|---|
| `/login` | 登录（JWT） |
| `/` | 总览大屏：8 张 ECharts 卡片 + 拓扑（节点四态：正常/警告呼吸/严重/未纳管）+ 实时告警跑马灯 + WS 状态灯 |
| `/editor` | 拓扑编辑器：拖拽建图、节点关联设备、版本管理（保存/激活） |
| `/devices/:id` | 设备详情：元信息 + 指标 2×2 大图（近 1/6/24h，WS 增量）+ 最近告警（可确认）+ 拓扑关联跳转 + 运维动作占位 |

## 实时通道

`WS /ws/feed?token=*** JWT）：采集轮（5s）产生新数据后合并广播一条 `feed_update`（设备状态 + 新告警 + CPU TOP10），空轮不广播；15s `server_ping` 心跳；客户端断线指数退避重连（1→30s），每次（重）连派发 `__resync` 由前端补拉快照，保证断网重连后状态一致。
