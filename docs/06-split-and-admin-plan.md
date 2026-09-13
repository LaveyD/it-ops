# 06 · it-ops 拆分与后台管理改造计划（参考 TDDC）

> 状态：**已实施完成（M6~M10，2026-09-11）**
> 目标：把 it-ops 拆成 **大屏展示** 与 **后台管理** 两半；后台管理菜单参考 TDDC（3d-datacenter）的
> 「空间与资产 / 网络与连接 / 数字孪生 / 系统管理」四个模块，其中「网络与连接 → 网络拓扑」与
> it-ops 现有拓扑编辑器合并。原则：**借鉴交互与信息架构，不照搬实现与数据模型**。
> 各里程碑实施 commit：M6 `352907c` / M7 `84ea541` / M8 `40565ca` / M9 `9957f26` / M10（本次）。

---

## 1. 现状盘点（一句话）

- 前端单应用：`/login` + `/`（大屏，暗色自绘样式）+ `/editor`（拓扑编辑器）+ `/devices/:id`（设备详情）；无组件库、无侧栏布局。
- 后端单 FastAPI :8110，5 张表（topology JSONB 版本 / topology_node_device / device / device_metric / alert / biz_system），单管理员 JWT，无角色、无审计。
- M1~M5 已完成，生产 :8041（Nginx dist 静态 + /api /ws 反代）。

## 2. 拆分总策略（关键决策）

**单 monorepo、单构建、双路由树、单 Nginx 站点**，不拆两个独立应用：

| 项 | 方案 | 理由 |
|---|---|---|
| 大屏 | 路由迁到 `/dashboard/*`（现 Dashboard 原样搬家），暗色、无菜单、可全屏 | 电视/大屏机收藏 `/dashboard`；行为零回归 |
| 后台 | 新增 `/admin/*` 路由树 + 侧栏布局（AdminLayout），**浅色**主题 | 管理台与大屏场景不同，浅色是管理台惯例（TDDC 亦浅色） |
| 构建/部署 | 一个 dist，:8041 站点不变；`/` 按角色跳转（viewer→/dashboard，其余→/admin） | 不新增端口、不双份构建；SPA 兜底已支持深链 |
| 后端 | 不拆服务，只加表、加路由、加 RBAC 依赖 | 数据同源（PG 23432/it_ops），拆服务无收益 |
| 组件库 | 后台引入 **Element Plus**（按需引入，仅 /admin 路由懒加载）；大屏保持现有自绘暗色样式 | 管理台全是表格/表单/抽屉，手搓成本过高；路由级分包保证大屏 chunk 不受影响 |

> 若将来要"大屏机器只能看到大屏"的强隔离：M10 可选做 vite 双 entry 拆包（大屏包不含 admin 代码）。本期不做。

## 3. 对 TDDC 的取舍（不照搬清单）

| TDDC 做法 | it-ops 取舍 | 原因 |
|---|---|---|
| 技术栈 React + antd Pro + G6 + R3F | Vue3 + Element Plus + GraphVis 拓扑引擎 + **Three.js 原生**（仅三维机房页） | 不引 G6、不引 R3F（React 专属）；拓扑引擎已移植且四态/分组/撤销已验证 |
| 连接 Connection 独立实体（源端口→目标端口）+ 端口管理页 | **链路视图 = 从 active 拓扑派生的只读台账**（后端展开 canvas.links），不做独立 connection 表，不做端口管理 | 单一事实来源，避免"拓扑边"与"连接表"双写同步；it-ops 几十节点规模，端口级模型过重 |
| 空间 = 机房/机柜/PDU/设备模板 四级 | **机房（room）+ 机柜（cabinet）两张表**（行/列/U 位坐标）+ 设备 `location_id`/`cabinet_id`；不做 PDU/设备模板 | 三维机房渲染需要机房/机柜几何数据，其余物理资产（PDU/U 位模板）it-ops 用不上 |
| 数字孪生 = R3F（@react-three/fiber，React 声明式）三维机房场景 + 布局编辑器 | **本期做真三维机房**：Three.js 原生 API + Vue 壳（Vue 无 R3F 对等物；按"黑盒引擎+壳"策略自建 `room-core.ts` 场景管理器）+ 3D 拓扑总览 | 参照 TDDC 场景结构与交互（轨道相机/机柜点击/热力图/LOD），不拷 React 组件；数据模型（机房/机柜表）自建落 PG |
| 系统管理 = 组织/角色/用户 三 Tab + 审计 + 任务 + 数据健康 | **用户与角色**（2 张表，无组织）+ **审计日志** + **通知配置**（mock 落地） | 规模不需要组织树；任务/数据健康本期无对应物 |
| 数据全部 mock（内存态） | 全部落 PG + Alembic 迁移 | it-ops 本来就是持久化架构 |
| 拓扑：每机房一张 + zone combo + 路径查询 | 保留 **JSONB 版本快照**（it-ops 优势），借鉴其**过滤器交互**（关键词/状态/只看异常）与**详情抽屉**模式；路径查询列为风险项 | 版本化快照 + 设备关联是 it-ops 已有资产，不动数据模型 |
| 拓扑只读（无编辑） | 网络拓扑页 = **编辑/只读双模式**（it-ops 编辑器 + 版本管理面板 + 过滤器） | 用户要求：网络拓扑菜单结合 it-ops 拓扑编辑 |

## 4. 后台管理信息架构（新菜单树）

```
/admin（AdminLayout：左侧 el-menu + 顶栏用户下拉）
├─ 总览            管理台轻量首页：今日告警/在线率/SLA/拓扑版本 chip + 各菜单快捷入口（新做，区别于大屏）
├─ 资产与空间
│   ├─ 机房与区域   location 注册表 + 机房/机柜 CRUD（三维机房的几何数据源）
│   ├─ 设备台账     设备 CRUD + 批量改状态 + 拓扑引用 chip + 详情抽屉（复用 DeviceDetail）
│   └─ 业务系统     biz_system CRUD + SLA
├─ 监控告警
│   └─ 告警中心     筛选 + 单条/批量确认 + 7 天趋势图
├─ 网络与连接
│   ├─ 网络拓扑     ★ 核心：现编辑器升级为管理页（见 §5）
│   └─ 链路视图     从 active 拓扑派生的只读链路台账 + 点击定位回拓扑页
├─ 数字孪生
│   ├─ 3D 总览      GraphView 大画布 + 类型图层 + 聚焦 + 演示模式（网络孪生）
│   └─ 3D 机房      Three.js 真三维机房：行/机柜实例化 + 设备状态着色 + 点击穿透 + 轨道相机（本期）
└─ 系统管理
    ├─ 用户与角色   用户 CRUD / 重置密码 / 启用禁用 / 大屏令牌
    ├─ 审计日志     查询 + 详情 + CSV 导出
    └─ 通知配置     渠道表单（webhook/邮件）仅落地保存，推送 M+ 再做
```

角色可见性：`admin` 全部；`operator` 除系统管理外全部；`viewer` 无 /admin 入口（只进 /dashboard）。

## 5. 「网络拓扑」菜单设计（与拓扑编辑器合并，核心页）

一个页面三块，复用 `topo-core.ts` / `GraphEditor` / `GraphView` / 撤销重做，不动引擎：

1. **模式切换（顶栏）**：`编辑 | 只读`。只读 = 现 GraphView 行为（禁拖拽、WS 实时着色），用于日常查看/演示；编辑 = 现编辑器全能力。
2. **版本管理面板（左侧，新增）**：版本列表（名称/版本号/更新时间/是否生效），操作：激活、改名、删除（**active 版本禁删**）、以某版本为底新建副本。现状版本只散落在编辑器下拉里，升级为正式管理面。
3. **过滤器（顶栏，借鉴 TDDC 交互）**：关键词搜索（名称/关联设备）、状态下拉（normal/warn/alert/未纳管）、"只看异常"开关。实现方式：**数据层过滤**（Vue 壳过滤后喂引擎），不依赖引擎内部 API → 引擎黑盒无风险。

后续可选项（不进本期里程碑，列风险）：A→B 路径查询——需确认 GraphVis 引擎是否暴露路径遍历 API。

## 6. 数字孪生（本期）

### 6.1 `/admin/twin`「3D 总览」（网络孪生）
- GraphView 全屏大画布（复用，含四态 + WS 实时着色 + hover 浮层）
- 左侧**类型图层**开关（router/switch/firewall/server/… 7 类，勾选控制显隐，数据层过滤）
- 节点双击 → 相机聚焦（引擎 focusNode 已有）；点击 → 设备抽屉
- **演示模式**：隐藏所有 UI 外壳，纯大屏观感（给汇报场景用）

### 6.2 `/admin/twin/room`「3D 机房」（真三维，本期）
- **实现策略**：Three.js 原生 API（`three` + 自带 OrbitControls），命令式场景管理器 `room-core.ts`（建场景/光照/地面/机柜 InstancedMesh/拾取/相机），Vue 壳 `RoomView.vue` 只管生命周期、数据喂入和 UI 面板——与 GraphVis 引擎"黑盒+壳"策略一致。TDDC 的 `components/3d/` 仅作为**交互与观感参考**（轨道相机、机柜点击高亮、设备状态着色、热力图、LOD），不拷任何 React 组件。
- **场景内容**（由 room/cabinet/device 表驱动）：
  - 机房：地面 + 行（aisle）划分，每行一排机柜
  - 机柜：InstancedMesh 批量渲染（几十~几百台一次 draw call），点击拾取实例 id → 机柜抽屉（U 位设备清单/状态）
  - 设备：机柜 U 位处渲染简模（服务器/交换机按类型分色块），状态着色 normal/warn/alert（alert 呼吸，与大屏同语义）
  - 交互：轨道相机（旋转/缩放/平移）、机柜/设备点击 → Element Plus 抽屉、双击聚焦
- **实时**：WS feed 更新设备状态 → room-core `updateDeviceStatus()` 增量改色（不重建场景）
- **数据前提**：room/cabinet 表 + 设备 `cabinet_id`+`u_start`；M7 机房与区域页提供 CRUD，seed 生成示例机房（2 行 × 12 机柜 + 已有关联设备填充 U 位）
- **性能红线**：机柜/设备实例化渲染，目标 500 机柜 60fps；超过再上 LOD（默认关）

## 7. 数据模型扩展（新增 5 表，Alembic 迁移）

```
user          (id, username UNIQUE, password_hash, display_name, role[admin|operator|viewer],
               enabled, created_at, updated_at)
audit_log     (id, username, action, target_type, target_id, detail JSONB, ip, created_at)
location      (id, name UNIQUE, zone_type[headquarters|branch|machine_room|other], remark)
room          (id, name, location_id → location.id, cols, rows, remark)          -- 机房几何参数
cabinet       (id, room_id → room.id, name, row, col, u_height DEFAULT 42,
               status, created_at, updated_at)                                    -- 行/列定位三维布局
```

- 改：`device` 加 `location_id → location.id`、`cabinet_id → cabinet.id`、`u_start`（U 位起，可空）（迁移后文本 location 字段保留为展示冗余或弃用，实施时定）。
- 种子：现有 `ADMIN_USER/ADMIN_PASSWORD` 建为首个 admin；3 个示例 location；1 个示例机房（2 行 × 12 机柜）+ 已关联设备填充 U 位；审计/用户无 mock。
- 密码哈希用 passlib/bcrypt（替换现在明文比较）。

## 8. API 契约扩展（摘要，完整签名补入 docs/03-api.md）

| 模块 | 端点 | 权限 |
|---|---|---|
| auth | login/me 响应加 `role`；`POST /api/auth/logout`（写审计） | 登录 |
| users | `GET/POST /api/users`、`PUT/DELETE /api/users/{id}`、`POST /api/users/{id}/reset-password`、`POST /api/screen-token`（30 天 viewer JWT） | admin |
| audit | `GET /api/audit`（分页+筛选）、`GET /api/audit/export`（CSV） | admin/operator |
| locations | `GET/POST /api/locations`、`PUT/DELETE /api/locations/{id}` | admin/operator |
| rooms | `GET/POST /api/rooms`、`PUT/DELETE /api/rooms/{id}`（删除时机柜级联删/禁删，实施定）、`GET /api/rooms/{id}/scene`（三维场景聚合：room+cabinet+设备 U 位/状态） | 写 admin/operator，读 全部登录用户 |
| cabinets | `GET/POST /api/rooms/{id}/cabinets`、`PUT/DELETE /api/cabinets/{id}` | admin/operator |
| devices | 新增 `POST /api/devices`、`PUT/DELETE /api/devices/{id}`（删除时 topology_node_device.device_id 置 NULL）、`POST /api/devices/batch-status` | admin/operator |
| biz_systems | 新增 `POST/PUT/DELETE` | admin/operator |
| alerts | 新增 `POST /api/alerts/ack-batch` | admin/operator |
| topology | 新增 `DELETE /api/topology/{id}`（active 禁删 409）、`PUT /api/topology/{id}`（改名）、`GET /api/topology/active/links`（派生链路：两端设备+最差状态+带宽） | 写 admin/operator，读 全部登录用户 |
| notify | `GET/PUT /api/notify-config`（mock 落 PG） | admin |

RBAC 实现：JWT payload 加 `role`；`Depends(require_role("admin","operator"))` 依赖；大屏只读接口保持"任意登录用户"。

## 9. 大屏侧变化（尽量零回归）

- 路由 `/` → `/dashboard`；页面代码原样搬家（views/Dashboard/ 保持现名），WS/卡片/拓扑只读全部不动。
- 顶栏「拓扑编辑」链接改指 `/admin/network/topology`；viewer 角色隐藏该入口。
- 登录分流：viewer → `/dashboard`，其余 → `/admin`。
- 大屏令牌：管理台「用户与角色」页生成，电视打开 `/dashboard?token=*** 自动登录（api client 支持 query token 写入 localStorage）。
- 部署：:8041 不变，`/` 302/前端路由按角色分发；Nginx 无需改动（SPA 兜底已覆盖）。

## 10. 前端工程调整

- 新增依赖：`element-plus`（按需）+ `@element-plus/icons-vue`（仅 /admin 路由懒加载）；`three` + `@types/three`（仅 /admin/twin/room 页懒加载）。
- 新增 `layouts/AdminLayout.vue`（侧栏 + 顶栏 + 用户下拉：进大屏/退出）。
- 目录：`views/Dashboard/`（大屏搬家）、`views/admin/{overview,assets,alerts,network,twin,system}/*`。
- 复用不动：`topo-core.ts`、`GraphView.vue`、`GraphEditor`（迁进 admin/network 内）、`DeviceDrawer.vue`、`useWs.ts`、`useEChart.ts`、`DeviceDetail.vue`（挂到 /admin 路由下，保留原路径别名）。
- 三维机房：`components/twin/room-core.ts`（Three.js 场景管理器，`// @ts-nocheck` 与否按情况）+ `RoomView.vue`；three 按需 import，不进大屏 chunk。
- api client：login 响应存 role；query-token 引导；403 提示而非跳登录。

## 11. 里程碑（沿用现有流程：每里程碑一个 commit，不 push，vue-tsc + vite build + pytest 全过）

| 里程碑 | 内容 | 验收 |
|---|---|---|
| **M6 壳 + RBAC** | user/audit/location 表 + 迁移；bcrypt；require_role；AdminLayout + 菜单骨架；路由搬家 /dashboard；登录分流；大屏令牌 | 三角色菜单/路由/接口 403 行为正确；令牌 URL 免密进大屏；大屏零回归（WS/卡片/拓扑抽查） |
| **M7 资产与空间 + 告警中心** | location/device/biz CRUD 后端；room/cabinet 表 + CRUD + `/scene` 聚合接口；设备台账页（表格+表单抽屉+批量+拓扑引用 chip）；机房与区域页（location + 机房/机柜管理）；业务系统页；告警中心页（筛选/批量确认/趋势）；seed 示例机房（2×12）+ 设备 U 位 | CRUD 闭环 + 删设备级联置 NULL + 双向回归测试；scene 接口返回结构可渲染；vue-tsc 0 错 |
| **M8 网络与连接** | 网络拓扑管理页（模式切换/版本面板/过滤器/删除保护）；链路视图页（派生 + 状态推导 + ?node= 深链定位） | 编辑器旧能力全回归（深链/撤销/关联 422）；active 版本删除 409；链路状态取两端最差 |
| **M9 数字孪生** | 3D 总览页（图层开关/聚焦/抽屉/演示模式）；**3D 机房页**（room-core：轨道相机/机柜 InstancedMesh 拾取/设备 U 位简模/状态着色/WS 实时改色/机柜抽屉） | 图层过滤即时生效；WS 告警节点实时变色；演示模式无 UI 残影；3D 机房 2×12 场景 60fps、机柜点击抽屉正确、告警设备呼吸 |
| **M10 系统管理 + 收口** | 用户管理页（CRUD/重置/禁用/令牌）；审计日志页（查询/CSV）；通知配置页（mock）；文档同步（01/02/03 更新 + 本文档转实施版）；Nginx 回归 | 全量 pytest + build；审计覆盖登录/设备/拓扑/告警/用户操作；:8041 全站 curl 验收 |

## 12. 风险与开放问题

1. **Element Plus 引入**：后台体积 +~数百 KB（路由分包后不影响大屏）。若坚持零依赖则手搓表格/表单，工作量约 +30%——默认按引入执行。
2. **路径查询**：依赖引擎黑盒 API 是否支持，M8 开工前探测，不支持则砍掉只留过滤器。
3. **Three.js 三维机房**：Vue 下无 R3F，room-core 手写（约 500~800 行），工作量是 M9 的主要成本；若真实机房几何数据（行数/列数/U 位）拿不到，seed 的示例机房仅作演示——数据源对接方式实施时确认。
4. **大屏强隔离**：同 dist 意味着大屏机器可访问 /admin 代码（有 RBAC 兜底，viewer 无数据权限）。有强隔离诉求再拆双 entry。
5. **device.location 迁移**：文本 location → location_id 的存量数据清洗方式（按现文本归并 or 全部落"未分配"），M7 实施时定。
