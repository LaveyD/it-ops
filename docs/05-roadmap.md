# 05 · 开发计划与验收标准

## 里程碑

### M1 脚手架（跑通全链路）
- 后端：`uv` 项目初始化，FastAPI + SQLAlchemy + Alembic，`db/init.sql` 建库
- 前端：`npm create vite` 脚手架（Vue3+TS），Pinia + vue-router + ECharts
- 认证：登录接口 + 前端守卫（内置 admin）
- mock 数据：`seed.py` 幂等初始化（示例拓扑 v1 激活 + 设备 + 指标 + 告警 + 业务系统）
- **验收**：`/api/overview` 返回聚合数据；前端能登录并显示一个占位页；Alembic 迁移干净

### M2 大屏首页（第一版可见效果）
- 布局壳（顶栏 + 三列）、暗色主题、rem 适配
- 8 张卡片（mock 数据，ECharts 暗色主题）
- **验收**：1920×1080 下布局无滚动条溢出；卡片数据真实渲染；刷新时间戳更新

### M3 拓扑接入 + 设备关联
- GraphView 只读组件移植 + 节点四态渲染（含呼吸灯）+ hover 浮层
- GraphEditor 编辑器页移植（数据源切 API：保存/版本/激活）+ **节点关联设备区块**（下拉/清除/信息卡）
- 后端：保存时 deviceId 存在性校验 + `topology_node_device` 物化；设备列表 `referenced_by`
- **DeviceDrawer**（概览/指标/告警/操作占位 Tab）+ 首页点击节点/卡片 → 抽屉
- **验收**：编辑器里给节点关联设备并保存 → 大屏首页该节点显示设备状态；WS 推 `device_status` 节点变色；保存引用不存在设备被 422 拦截且提示清单；撤销重做/分组功能不回归

### M4 实时能力
- WS 通道（hub + 心跳 + 重连）
- 后台任务：mock collector 周期产指标/告警 → 写库 → 广播
- 首页：指标趋势卡片增量刷新、告警滚动、节点状态呼吸灯
- **验收**：断网重连后状态一致；mock 告警产生后 <2s 出现在滚动列表并同步节点变色

### M5 打磨 + 部署
- 设备详情页骨架（`/devices/:id`）
- Nginx 部署（dist 静态 + /api /ws 反代）、生产环境变量
- README 补全（启停命令、环境变量、目录说明）
- **验收**：生产入口一页能进；全部 API 401/404/500 行为正确；文档可照抄运行

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
