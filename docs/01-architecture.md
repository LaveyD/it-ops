# 01 · 技术架构

## 1. 总体架构

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  apps/web  (Vue3 + TS + Vite) │  HTTP  │  apps/api  (FastAPI)          │
│  - 大屏首页 (Dashboard)        │◄──────►│  - REST API (/api/*)          │
│  - 拓扑编辑器 (TopologyEditor) │  WS    │  - WebSocket (/ws/feed)       │
│  - ECharts 卡片               │◄──────►│  - mock 数据生成器             │
└─────────────────────────────┘        │  - collector 预留接口          │
        ▲ Nginx 托管(生产)               └──────────────┬───────────────┘
        │ dev: vite :5174 (proxy /api,/ws → :8110)      │ SQLAlchemy
                                                ┌───────▼────────┐
                                                │ PostgreSQL 17   │
                                                │ db: it_ops :23432│
                                                └────────────────┘
```

## 2. 项目结构

```
it-ops/
├── apps/
│   ├── web/                        # 前端
│   │   ├── src/
│   │   │   ├── views/
│   │   │   │   ├── Login.vue           # 登录页（内置管理员）
│   │   │   │   ├── Dashboard.vue       # 大屏首页
│   │   │   │   └── TopologyEditor.vue  # 拓扑编辑器
│   │   │   ├── components/
│   │   │   │   ├── topology/           # GraphVis 封装
│   │   │   │   │   ├── GraphView.vue   # 只读展示（首页用）
│   │   │   │   │   ├── GraphEditor.vue # 可编辑（编辑器页用）
│   │   │   │   │   ├── engine/         # 现成 topology.js 逻辑移植（TS 化或桥接）
│   │   │   │   │   └── lib/            # graphvis.min.js + icons/
│   │   │   │   ├── cards/              # StatCard/ChartCard/AlertTicker/...
│   │   │   │   └── common/             # 顶部栏、布局壳
│   │   │   ├── api/                    # 后端接口封装（TS client）
│   │   │   ├── store/                  # Pinia
│   │   │   ├── router/                 # vue-router（含登录守卫）
│   │   │   ├── theme/                  # 暗色主题 CSS 变量
│   │   │   └── main.ts
│   │   ├── index.html
│   │   ├── vite.config.ts              # dev proxy /api,/ws → localhost:8110
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── api/                          # 后端
│       ├── app/
│       │   ├── main.py                 # FastAPI 入口 + CORS + 路由挂载
│       │   ├── config.py               # 环境变量（DB URL、JWT secret、管理员账号）
│       │   ├── security.py             # JWT 签发/校验、admin 内置账号
│       │   ├── db.py                   # engine/session
│       │   ├── models.py               # SQLAlchemy 模型
│       │   ├── schemas.py              # Pydantic 模型
│       │   ├── mockdata.py             # mock 生成器（设备/指标/告警/业务系统）
│       │   └── routers/
│       │       ├── auth.py             # 登录
│       │       ├── topology.py         # 拓扑版本/保存/激活
│       │       ├── devices.py          # 设备 + 设备指标
│       │       ├── metrics.py          # 指标查询（图表用）
│       │       ├── alerts.py           # 告警
│       │       ├── biz_systems.py      # 业务系统
│       │       └── overview.py         # 首页统计汇总
│       ├── alembic/                    # 迁移
│       ├── alembic.ini
│       └── pyproject.toml              # uv 管理
├── db/
│   └── init.sql                        # 建库建角色 + 初始管理员
├── docs/                               # 本设计文档
├── .env.example
├── .gitignore
└── README.md
```

## 3. 端口与环境

| 项 | 值 | 说明 |
|---|---|---|
| 前端 dev | 5174 | Vite 默认，proxy 到 8110 |
| 后端 dev | 8110 | 避开已占用端口（8100 为 Hermes Web UI 自身） |
| PostgreSQL | 23432（本机 17/main） | 库 `it_ops`，用户 `it_ops`。注意 5432 是旧 Docker 容器，勿用 |
| 生产 | Nginx 静态托管 apps/web/dist + 反代 /api、/ws → 8110 | 端口待定（建议 8040 段，实施时定） |

## 4. 环境变量（apps/api/.env）

```
DATABASE_URL=postgresql+psycopg://it_ops:itops2026@127.0.0.1:23432/it_ops
JWT_SECRET=<随机>
ADMIN_USER=admin
ADMIN_PASSWORD=<随机，内置管理员>
HOST=0.0.0.0
PORT=8110
```

## 5. collector / operator 预留设计

后端数据生产与动作执行统一收口在抽象层，mock 是第一个实现：

```
apps/api/app/collectors/
├── base.py         # Collector 协议：fetch_metrics() / fetch_alerts() / fetch_devices()
├── mock.py         # MockCollector：随机游走指标 + 随机告警（当前唯一实现）
└── __init__.py     # get_collector()：按配置返回实现（COLLECTOR=mock|zabbix|...）

apps/api/app/operators/
├── base.py         # Operator 协议：can(action) / execute(device_id, action, **params)
├── noop.py         # NoopOperator：统一 501（当前默认）
└── __init__.py     # get_operator()：按配置返回（OPERATOR=none|snmp|...）
```

- 路由层只依赖协议，不感知数据来源/动作通道：后期接真实源或真实设备管理通道 = 新增实现 + 配置切换，**路由/前端零改动**
- 后台任务：`app/jobs.py` 定时器（asyncio）周期性调 collector → 写库 → 经 WS 广播
- 动作审计：operator 执行（成功/失败）统一写 `alert` 表（level=info，title 带 `[action]` 前缀），后期可单列 audit 表
