# 02 · 数据模型（PostgreSQL 17）

库：`it_ops`；用户：`it_ops`；建库脚本 `db/init.sql`。

## 1. 表结构

### topology —— 拓扑版本化快照

编辑器保存的完整画布（节点/连线/分组），JSONB 存 GraphVis 序列化格式，天然兼容引擎。

```sql
CREATE TABLE topology (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '默认拓扑',
  canvas      JSONB NOT NULL,             -- {nodes[], links[], groups[]}
  version     INT NOT NULL DEFAULT 1,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_topology_active ON topology(is_active) WHERE is_active;
```

`canvas` 结构（与现编辑器 `serializeGraph()` 输出一致）：

```jsonc
{
  "nodes": [{ "id": "home", "label": "家庭", "type": "home",
              "color": "…", "fillColor": "…", "x": 240, "y": 840,
              "size": 60, "radius": 30, "alpha": 1,
              "properties": { "deviceId": "gw-home-01" } }],
  "links": [{ "id": "l1", "source": "core1", "target": "home",
              "label": "万兆", "color": "…", "lineWidth": 2,
              "lineDash": [0], "showArrow": false }],
  "groups": [{ "label": "终端接入区", "shape": "round", "padding": 20,
               "alpha": 0.5, "borderWidth": 2, "borderColor": "80,140,255",
               "dash": [6,4], "font": "…", "textAlign": "center",
               "fontColor": "…", "fillColor": "…", "headerColor": "…",
               "memberIds": ["home", "corp", "factory"] }]
}
```

### device —— 设备注册表（独立于拓扑）

```sql
CREATE TABLE device (
  id          TEXT PRIMARY KEY,            -- 设备唯一编码（如 core1 / fw-a），管理端分配
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,               -- router/switch/server/db/fw/home/...
  ip          TEXT,
  status      TEXT NOT NULL DEFAULT 'normal',  -- normal | warn | alert
  location    TEXT,                        -- 机房/区域
  owner       TEXT,                        -- 责任人
  extra       JSONB NOT NULL DEFAULT '{}', -- 业务系统、SN 等扩展
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### topology_node_device —— 节点↔设备关联（物化表，可空引用）

```sql
CREATE TABLE topology_node_device (
  topology_id  BIGINT NOT NULL REFERENCES topology(id) ON DELETE CASCADE,
  node_id      TEXT NOT NULL,              -- 拓扑节点 id
  device_id    TEXT REFERENCES device(id) ON DELETE SET NULL,
  PRIMARY KEY (topology_id, node_id)
);
CREATE INDEX ix_tnd_device ON topology_node_device (device_id);
```

- **事实来源 = canvas 的 `node.properties.deviceId`**（编辑器配置，随拓扑版本保存）
- 后端保存时物化（`POST /api/topology` 解析 canvas → upsert），仅用于关系反查（"这台设备被哪些节点引用"），不允许绕过 topology 接口直接改
- `ON DELETE SET NULL`：设备删除后关联记录保留、`device_id` 置空 → 前端显示"关联设备已删除"

### device_metric —— 指标时序

```sql
CREATE TABLE device_metric (
  id          BIGSERIAL PRIMARY KEY,
  device_id   TEXT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  metric      TEXT NOT NULL,               -- cpu / memory / net_in / net_out / ...
  ts          TIMESTAMPTZ NOT NULL,
  value       DOUBLE PRECISION NOT NULL
);
CREATE INDEX ix_metric_lookup ON device_metric (device_id, metric, ts DESC);
```

> 先普通表 + 索引；量级上来后按月分区或换 TimescaleDB（表结构不变，只加分区 DDL）。

### alert —— 告警

```sql
CREATE TABLE alert (
  id          BIGSERIAL PRIMARY KEY,
  device_id   TEXT REFERENCES device(id) ON DELETE CASCADE,  -- 可空：全局告警
  level       TEXT NOT NULL,               -- info | warn | crit
  title       TEXT NOT NULL,
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  acked       BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX ix_alert_newest ON alert (created_at DESC);
CREATE INDEX ix_alert_unacked ON alert (level, created_at DESC) WHERE NOT acked;
```

### biz_system —— 业务系统概览

```sql
CREATE TABLE biz_system (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  owner       TEXT,
  status      TEXT NOT NULL DEFAULT 'normal',  -- normal | warn | alert
  sla_target  NUMERIC(5,2),                  -- 如 99.95
  sla_actual  NUMERIC(5,2),
  extra       JSONB NOT NULL DEFAULT '{}'
);
```

### 后台管理扩展表（M6~M10）

```sql
-- M6 用户与审计（后台管理 RBAC 底座）
CREATE TABLE user (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'operator',  -- admin | operator | viewer
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  username    TEXT NOT NULL,
  action      TEXT NOT NULL,            -- login / login_failed / user_create / topology_save …
  target_type TEXT,                     -- user / device / topology / alert …
  target_id   TEXT,
  detail      JSONB NOT NULL DEFAULT '{}',
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_time ON audit_log (created_at DESC);

-- M6 位置注册表（设备/机房归属，zone_type 分类）
CREATE TABLE location (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  zone_type  TEXT NOT NULL DEFAULT 'other',  -- headquarters | branch | machine_room | other
  remark     TEXT
);

-- M7 机房（几何参数，三维机房渲染数据源）
CREATE TABLE room (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  location_id INTEGER REFERENCES location(id) ON DELETE SET NULL,
  rows        INTEGER NOT NULL DEFAULT 1,    -- 行数
  cols        INTEGER NOT NULL DEFAULT 1,    -- 每行机柜数
  remark      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- M7 机柜（行/列定位 + U 高，InstancedMesh 实例化渲染数据源）
CREATE TABLE cabinet (
  id         BIGSERIAL PRIMARY KEY,
  room_id    INTEGER NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,                 -- 如 A1-01
  row        INTEGER NOT NULL DEFAULT 1,
  col        INTEGER NOT NULL DEFAULT 1,
  u_height   INTEGER NOT NULL DEFAULT 42,   -- 标准 42U
  status     TEXT NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, name)
);

-- M10 通知配置（单行 mock，id 恒为 1；仅落地保存，推送 M+ 接入）
CREATE TABLE notify_config (
  id           INTEGER PRIMARY KEY,
  webhook_url  TEXT,
  email_to     TEXT,
  email_from   TEXT,
  notify_alert BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);
```

`device` 表 M6/M7 扩展列：`location_id INT REFERENCES location(id) ON DELETE SET NULL`、
`cabinet_id INT REFERENCES cabinet(id) ON DELETE SET NULL`、`u_start INT`（U 位起，三维机房用，可空）；
原 `location TEXT` 保留为展示冗余。

> 迁移全部**手工编写**（`alembic/versions/`）：m6（user/audit_log/location）、m7（room/cabinet + device 三列 + 存量 location 文本归并回填）、m10（notify_config + seed 单行）。

## 2. 约定

1. **节点↔设备 = N:1**：一个节点最多关联 1 台设备（`node.properties.deviceId`），一台设备可被多个拓扑/多节点引用；关联是**可选的**，未关联 = "未纳管"
2. **大屏节点状态四态**：`normal` / `warn` / `alert`（来自关联设备 `device.status`）/ `unmanaged`（未关联或关联设备已删除），渲染规则见 [04-dashboard-ui.md](04-dashboard-ui.md)
3. **拓扑与设备解耦**：编辑器可画任何节点、自由关联/解绑设备；关联完整性后端保存时校验（deviceId 必须存在，否则拒绝并返回明确错误）
4. **JSONB 校验**：canvas 的 schema 校验放 Pydantic（写入时），DB 层用 `CHECK (jsonb_typeof(canvas) = 'object')`
5. **时区**：全部 `TIMESTAMPTZ`，API 统一返回 ISO8601 UTC，前端本地化

## 3. 初始数据（seed）

- 管理员账号不入库（内置于 `.env`，JWT 签发）
- 默认拓扑：导入现编辑器的 INITIAL 示例（24 节点/25 连线）为 v1 并激活，其中部分节点预置 `properties.deviceId`
- mock 设备：12~16 台（与部分拓扑节点关联）+ 基线指标 + 若干历史告警 + 4~6 个业务系统
- seed 脚本：`apps/api/app/seed.py`（`uv run python -m app.seed`，幂等）
