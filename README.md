# IT 运维平台（大屏 + 后台管理）

前后端分离的 IT 运维可视化平台，单仓库单构建、双路由树：

- **大屏展示** `/dashboard`：暗色实时大屏，网络拓扑（GraphVis 3D）+ ECharts 图表卡片 + WebSocket 实时告警/指标。
- **后台管理** `/admin`：浅色侧栏，含**资产与空间 / 网络与连接 / 数字孪生 / 系统管理**四大模块（菜单参考 TDDC 数字孪生机房，不照搬实现）。

- 前端：Vue 3 + TypeScript + Vite + ECharts + Three.js（3D）+ Element Plus（后台）（`apps/web`）
- 后端：FastAPI + SQLAlchemy 2.0 + Alembic（`apps/api`）
- 数据库：PostgreSQL（默认 `127.0.0.1:23432`，库 `it_ops`）
- 拓扑引擎：GraphVis 3D（`apps/web/public/topology/`）
- 鉴权：JWT + RBAC 三角色（`admin` / `operator` / `viewer`）

## 文档

设计文档见 [docs/](docs/README.md)：

- [01 技术架构](docs/01-architecture.md) — 选型、目录结构、collector/operator 抽象
- [02 数据模型](docs/02-data-model.md) — PostgreSQL 表结构（含后台管理扩展表）
- [03 API 契约](docs/03-api.md) — REST + WebSocket 消息 + 后台端点权限矩阵
- [04 大屏 UI](docs/04-dashboard-ui.md) — 布局、主题、拓扑移植、穿透设计
- [05 开发计划](docs/05-roadmap.md) — M1~M10 里程碑与验收标准（全部完成）
- [06 拆分与后台管理改造计划](docs/06-split-and-admin-plan.md) — 大屏/后台拆分设计（已实施）

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
| `ADMIN_USER` / `ADMIN_PASSWORD` | 内置管理员账号（首个 admin，seed 落库） | admin / admin |
| `HOST` / `PORT` | 后端监听 | 0.0.0.0 / 8110 |
| `COLLECTOR` | 采集器：`mock`（内置模拟随机游走） | mock |
| `OPERATOR` | 运维动作执行器：`none`（动作返回 501） | none |

> 时间戳统一 aware-UTC 存储（ORM 端默认），东八区部署无需额外时区配置。
> 另有内置只读账号 `screen`（viewer）用于大屏令牌，密码随机生成、不可登录，仅供大屏免密 token 签发。

## 角色权限（RBAC）

| 能力 | admin | operator | viewer |
|---|:-:|:-:|:-:|
| 大屏 `/dashboard` | ✓ | ✓ | ✓ |
| 后台 `/admin`（资产/网络/数字孪生/告警） | ✓ | ✓ | — |
| 系统管理（用户/审计/通知） | ✓ | — | — |
| 大屏 30 天只读令牌签发 | ✓ | — | — |

- 登录后按角色分流：`/` → `viewer` 进大屏，其余进后台。
- 后端用 `require_role(...)` 依赖做接口级 403 边界（如审计/用户/通知仅 admin、operator）。

## 开发模式

前置：PostgreSQL 已启动，库与角色已建好（`it_ops` / `it_ops`，凭据见 `.env`）。

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
cd apps/api && uv run pytest -q        # 后端（auth/users-rbac/devices/topology/ws/assets/m8/m10）
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
│   │   ├── audit.py     # 操作审计助手（独立 session 写，异常不阻断业务）
│   │   ├── security.py  # JWT + require_role RBAC 依赖
│   │   ├── collectors/  # mock 采集器（随机游走指标 + 概率告警/状态漂移）
│   │   ├── operators/   # noop 运维动作执行器（M+ 接真实通道）
│   │   ├── routers/     # auth / users / audit / notify / topology / devices
│   │   │                # / alerts / overview / biz_systems / locations / rooms
│   │   ├── seed.py      # 种子数据（python -m app.seed [--force]）
│   │   └── config.py    # pydantic-settings（.env）
│   ├── alembic/         # 数据库迁移
│   └── tests/           # pytest（auth/users-rbac/devices/topology/ws/assets/m8/m10）
├── web/                 # Vue3 前端
│   ├── public/topology/ # GraphVis 引擎 + 3D 图标
│   └── src/
│       ├── composables/ # useEChart（图表生命周期）/ useWs（WS 单例 feed bus）
│       ├── components/  # 图表卡片 + 拓扑引擎封装（topo-core / GraphView / 抽屉）
│       ├── layouts/     # AdminLayout（浅色侧栏壳 + 角色菜单过滤 + 登录拦截）
│       └── views/       # 大屏 + 后台（见下方「页面」）
deploy/
└── nginx-itops.conf     # 生产 Nginx 模板（:8041）
docs/                    # 设计文档
```

## 页面

### 大屏展示（暗色，单页）

| 路由 | 说明 |
|---|---|
| `/dashboard` | 总览大屏：8 张 ECharts 卡片 + 拓扑（节点四态：正常/警告呼吸/严重/未纳管）+ 实时告警跑马灯 + WS 状态灯 |
| `/devices/:id` | 设备详情：元信息 + 指标 2×2 大图（近 1/6/24h，WS 增量）+ 最近告警（可确认）+ 拓扑关联跳转 + 运维动作占位 |

### 后台管理（`/admin`，浅色侧栏）

| 模块 | 路由 | 说明 | 角色 |
|---|---|---|---|
| — | `/admin` | 后台总览（关键指标 + 最近告警） | 全员 |
| 资产与空间 | `/admin/assets/location` | 机房与区域（位置注册表 CRUD） | admin/op |
| 资产与空间 | `/admin/assets/device` | 设备台账（CRUD + 批量改状态 + U 位） | admin/op |
| 资产与空间 | `/admin/assets/biz` | 业务系统（CRUD） | admin/op |
| 告警 | `/admin/alerts` | 告警中心（筛选 + 单条/批量确认 + 7 天趋势） | admin/op |
| 网络与连接 | `/admin/network/topology` | 网络拓扑（拖拽建图 + 节点关联设备 + 版本管理/激活） | admin/op |
| 网络与连接 | `/admin/network/links` | 链路视图（active 拓扑派生只读台账 + 定位回拓扑） | admin/op |
| 数字孪生 | `/admin/twin` | 3D 总览（GraphView 大画布 + 类型图层 + 双击聚焦 + 演示模式） | admin/op |
| 数字孪生 | `/admin/twin/room` | 3D 机房（Three.js 机柜/设备 + 状态着色 + 拾取 + WS 增量） | admin/op |
| 系统管理 | `/admin/system/users` | 用户与角色（CRUD/重置/禁用/大屏 30 天令牌） | **admin** |
| 系统管理 | `/admin/system/audit` | 审计日志（查询/详情/CSV 导出） | **admin** |
| 系统管理 | `/admin/system/notify` | 通知配置（webhook/邮件，M10 仅落地保存） | **admin** |

> 大屏拓扑编辑器过渡路由 `/topology`（全屏深色）在 M8 起由 `/admin/network/topology` 承接，保留兼容。

## 实时通道

`WS /ws/feed?token=*** JWT）：采集轮（5s）产生新数据后合并广播一条 `feed_update`（设备状态 + 新告警 + CPU TOP10），空轮不广播；15s `server_ping` 心跳；客户端断线指数退避重连（1→30s），每次（重）连派发 `__resync` 由前端补拉快照，保证断网重连后状态一致。
