# 05 · 开发计划与验收标准

## 里程碑

### M1 脚手架（跑通全链路）✅
- 后端：`uv` 项目初始化，FastAPI + SQLAlchemy + Alembic，`db/init.sql` 建库
- 前端：`npm create vite` 脚手架（Vue3+TS），Pinia + vue-router + ECharts
- 认证：登录接口 + 前端守卫（内置 admin）
- mock 数据：`seed.py` 幂等初始化（示例拓扑 v1 激活 + 设备 + 指标 + 告警 + 业务系统）
- **验收**：`/api/overview` 返回聚合数据；前端能登录并显示一个占位页；Alembic 迁移干净

### M2 大屏首页（第一版可见效果）✅
- 布局壳（顶栏 + 三列）、暗色主题、scale-to-fit 等比缩放
- 8 张卡片（mock 数据，ECharts 暗色主题）
- **验收**：1920×1080 下布局无滚动条溢出；卡片数据真实渲染；刷新时间戳更新

### M3 拓扑接入 + 设备关联 ✅
- GraphView 只读组件移植 + 节点四态渲染（含呼吸灯）+ hover 浮层
- GraphEditor 编辑器页移植（数据源切 API：保存/版本/激活）+ **节点关联设备区块**（下拉/清除/信息卡）
- 后端：保存时 deviceId 存在性校验 + `topology_node_device` 物化；设备列表 `referenced_by`
- **DeviceDrawer**（概览/指标/告警/操作占位 Tab）+ 首页点击节点/卡片 → 抽屉
- **验收**：编辑器里给节点关联设备并保存 → 大屏首页该节点显示设备状态；WS 推 `device_status` 节点变色；保存引用不存在设备被 422 拦截且提示清单；撤销重做/分组功能不回归

### M4 实时能力 ✅
- WS 通道（hub + 心跳 + 重连）
- 后台任务：mock collector 周期产指标/告警 → 写库 → 广播
- 首页：指标趋势卡片增量刷新、告警滚动、节点状态呼吸灯
- **验收**：断网重连后状态一致；mock 告警产生后 <2s 出现在滚动列表并同步节点变色

### M5 打磨 + 部署 ✅
- 设备详情页骨架（`/devices/:id`）
- Nginx 部署（dist 静态 + /api /ws 反代）、生产环境变量
- README 补全（启停命令、环境变量、目录说明）
- **验收**：生产入口一页能进；全部 API 401/404/500 行为正确；文档可照抄运行

### M6 后台壳 + RBAC ✅（计划见 06-split-and-admin-plan.md）
- 单 monorepo 双路由树：`/dashboard` 暗色大屏 + `/admin` 浅色后台（Element Plus 侧栏壳）
- RBAC：JWT 带 role、`require_role` 依赖、admin/operator/viewer 三档；viewer 无 /admin 入口
- 用户表 + 审计日志表（alembic m6）+ 用户管理 API + 大屏 30 天 viewer 令牌（内置 screen 账号）
- 位置注册表 + 位置/机房/机柜 CRUD 底座
- **验收**：三角色菜单/接口 403 边界正确；大屏令牌可登录且身份为 screen(viewer)；审计覆盖登录/用户操作

### M7 资产与空间 + 告警中心 ✅
- 机房/机柜/设备 CRUD + 设备批量改状态 + 业务系统 CRUD
- 机房 scene 聚合接口（三维数据源：room + cabinets + 设备 U 位/状态）
- 告警中心：筛选 + 单条/批量确认 + 7 天趋势
- **验收**：资产台账闭环；scene 接口字段齐备；批量确认生效

### M8 网络与连接 ✅
- 网络拓扑管理页（编辑器升级：版本查看/改名/删除保护 409 + 只读/编辑模式 + 过滤器）
- 链路视图：active 拓扑派生只读链路台账 + 目标定位回拓扑页聚焦
- **验收**：拓扑版本管理闭环；链路状态取两端最差；深链定位正确

### M9 数字孪生 ✅
- 3D 总览：GraphView 大画布 + 8 大类类型图层 + 双击聚焦 + 演示模式
- 3D 机房：Three.js 原生场景管理器（轨道相机 + 机柜/设备 InstancedMesh + 状态着色 + 拾取 + WS 增量改色 + alert 呼吸）
- **验收**：图层过滤即时生效；WS 告警节点/机柜实时变色；3D 机房机柜点击抽屉正确

### M10 系统管理 + 收口 ✅
- 用户与角色页（CRUD/重置/禁用/大屏令牌）；审计日志页（查询/详情/CSV 导出）；通知配置页（mock 落地）
- 后端：`/api/audit/export` CSV + `/api/notify-config`（notify_config 表 + 路由，alembic m10）
- 文档同步（01/02/03 更新 + 06 转实施版）；Nginx :8041 全站回归
- **验收**：全量 pytest + build；审计覆盖登录/设备/拓扑/告警/用户/配置操作；:8041 全站 curl 验收

### M11 真实数据接入（Collector 落地）📋
- 现状：`collectors/` 仅有 MockCollector（随机游走），工厂按 `COLLECTOR` 配置切换的抽象已备好
- **PrometheusCollector**（首选）：按设备标签查询 instance 的 CPU/内存/网络指标（`curl /api/v1/query`），告警接 Prometheus Alertmanager 的 active alerts 快照对比（新增即产 alert）
- 设备↔Prometheus 实例映射：device 表加 `prom_label`（如 `instance` 标签值）字段，拓扑/台账可配
- 配置切换：`.env` `COLLECTOR=prometheus` + `PROMETHEUS_URL`；mock 保留作演示/降级
- **验收**：本地起 Prometheus 喂样例数据 → `COLLECTOR=prometheus` 重启后端 → 大屏指标/告警来自真实查询；mock 模式回归不破坏

### M12 运维动作 + 通知落地 📋
- **Operator 落地**：`operators/` 现 NoopOperator（全 501）。接 SSH 通道（paramiko）支持动作集：`reboot / power_on / power_off / console`；DeviceDrawer 操作 Tab 由占位变真实按钮 + 二次确认 + 结果回显
- **通知真实推送**：notify_config 已有 webhook 字段，落企业微信/钉钉/飞书 markdown 机器人；触发时机：crit 告警产生 + 批量告警确认；失败重试 + 审计
- **验收**：webhook 指向本地 mock 服务验证报文格式；crit 告警产生后 <5s 收到推送；动作执行全链路审计可查

### M+ 远期（不在当前排期）
- 指标表分区 / TimescaleDB（数据量持续增长后）
- WS hub 换 Redis pub/sub（多实例部署时）
- 大屏 vite 双 entry 拆包（强隔离场景）

## 每里程碑通用验收
- 前端：`vue-tsc --noEmit` + `vite build` 无错
- 后端：`pytest`（至少覆盖 auth/topology/overview）
- git：每里程碑一个 commit，不 push（除非要求）

## 风险与对策
| 风险 | 对策 |
|---|---|
| GraphVis 引擎闭源、API 靠运行时探测 | 移植时保留现成 topology.js 行为基线（已验证用例），回归对照 |
| 暗色下 3D 图标对比度 | M3 早期做视觉验证，必要时给图标加底色光晕 |
| 指标表膨胀 | 本期 mock 量小；文档已留分区/TimescaleDB 升级路径 |
| 单机 WS 广播 | 当前单机足够；hub 抽象在进程内，后期可换 Redis pub/sub |

## 立即开始（M1 任务清单）
1. `db/init.sql`：建库 `it_ops`、用户、扩展
2. `apps/api`：`pyproject.toml`（uv）、`app/{main,config,security,db,models,schemas}.py`、alembic 初始迁移
3. `apps/web`：vite 脚手架、路由（login/dashboard/editor）、代理配置
4. `apps/api/app/seed.py` + mock collector 骨架
5. 联调登录 + overview
