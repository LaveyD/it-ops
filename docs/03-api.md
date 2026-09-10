# 03 · API 契约

Base：`/api`；认证：`Authorization: Bearer <jwt>`（除 `/api/auth/login` 外全部要求登录）。
错误格式：`{ "detail": "…" }`（FastAPI 默认）。时间统一 ISO8601 UTC。

## 1. 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | body `{username, password}` → `{token, expires_in}` |
| GET | `/api/auth/me` | 当前用户信息 |

内置管理员账号由 `.env` 的 `ADMIN_USER`/`ADMIN_PASSWORD` 提供，无注册/改密（后期扩展）。

## 2. 拓扑

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/topology/active` | 当前生效拓扑：`{id, name, version, canvas, devices: {deviceId: {id, name, status, ip}}}`。前端按 `node.properties.deviceId` 查 devices 得节点状态 |
| GET | `/api/topology/versions` | 版本列表 `[{id, name, version, is_active, updated_at}]`（不含 canvas） |
| POST | `/api/topology` | 保存新版本 `{name?, canvas}` → 自动 version+1；校验所有 `properties.deviceId` 必须存在（不存在返回 422 + 缺失清单）；物化 `topology_node_device`；若当前无生效版本则自动激活 |
| POST | `/api/topology/{id}/activate` | 指定版本设为生效（原生效版本自动取消） |
| GET | `/api/topology/{id}` | 取指定版本完整数据 |

## 3. 设备

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/devices` | 列表（编辑器关联下拉、设备页共用），query：`status` `type` `location` `q`（名称模糊）；每项含 `referenced_by: [{topology_id, topology_name, node_id, node_label}]` |
| GET | `/api/devices/{id}` | 详情：元数据 + 最新指标 + 最近 10 条告警 + `referenced_by` |
| GET | `/api/devices/{id}/metrics` | query：`metric`（逗号多值）`from` `to` `step`（秒，可选）→ `[{metric, points: [[ts, v], …]}]` |
| POST | `/api/devices/{id}/actions/{action}` | 运维动作占位（`restart`/`reboot`/`ping`…），本期统一返回 `501 {detail: "操作能力待 collector/operator 接入"}`；operator 抽象见 01-architecture |

## 4. 告警

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/alerts` | query：`level` `unacked=1` `device_id` `limit`（默认 50） |
| GET | `/api/alerts/stats` | query：`days`（默认 7）→ `[{date, info, warn, crit}]` 按天 × 等级（缺 0 天补零，堆叠柱数据源） |
| POST | `/api/alerts/{id}/ack` | 确认告警 |

## 5. 业务系统 / 概览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/biz-systems` | 列表 |
| GET | `/api/overview` | 首页聚合（一次拿全，减少请求）：`{device_count, online_rate, alert_counts: {info, warn, crit}, unacked_alerts, biz_systems, topology_version}` |
| GET | `/api/overview/top` | query：`metric` `n` `window_hours` → `[{device_id, name, metric, value}]` 各设备窗口内最新值降序 TOP N（卡片⑥） |

## 6. WebSocket 实时通道

`WS /ws/feed?token=*** JWT）

服务端 → 客户端消息：每轮采集（5s）产生新数据后合并广播**一条** `feed_update`（空轮不广播）；另有 15s 心跳。

```jsonc
// 合并广播：字段按需出现，无对应新数据则该字段缺省
{ "type": "feed_update",
  "statuses": [ { "id": "dev1", "name": "核心交换机", "status": "warn" } ],   // 本轮状态变更
  "alerts":   [ { /* AlertOut 全字段，含 device_name、id、created_at */ } ],  // 本轮新增告警
  "top": { "metric": "cpu", "items": [ { "device_id": "dev1", "name": "…", "value": 88.5 } ] }  // CPU TOP10
}
{ "type": "server_ping", "ts": 1700000000 }   // 15s 心跳
```

客户端 → 服务端：

```jsonc
"ping"   // 15s 心跳；服务端回 { "type": "pong" }（均为纯文本帧，非 JSON 对象）
```

约定：
- token 无效 → 服务端以 close code `4401` 断开（前端不重连，跳登录页）
- 连接失败自动重连（指数退避 1s→30s 封顶），收到任意消息重置退避
- 每次（重）连接建立后前端向各组件派发 `__resync`，由其补拉快照（alerts/top/metrics），保证断网重连后状态一致
- 广播经后端进程内 hub 发布（单机部署足够）；collector 后台任务写库提交后触发推送

## 7. 通用

- 分页：`?page=&size=`（默认 size=20），返回 `{items, total, page, size}`
- 限流：暂不启用（内网）
- 版本化：破坏性变更加 `/api/v2`，当前 v1 不带前缀
