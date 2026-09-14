<script setup lang="ts">
// M9.1 状态孪生（原"3D 总览"重做）：网络拓扑页管"结构"（编辑/版本/链路），
// 本页管"状态"——实时概览 + 异常设备/告警下钻定位（focusNode 镜头飞行）+ 图层。
// 复用 GraphView（readOnly + WS 实时着色 + focusNode expose），不动引擎。
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../../api'
import { useFeed } from '../../composables/useWs'
import GraphView from '../../components/topology/GraphView.vue'
import DeviceDrawer from '../../components/topology/DeviceDrawer.vue'
import type { Alert, Device, Overview } from '../../types'

const router = useRouter()

// ===== 数据 =====
const overview = ref<Overview | null>(null)
const devices = ref<Device[]>([])
const alerts = ref<Alert[]>([])

const abnormals = computed(() =>
  devices.value.filter((d) => d.status !== 'normal')
    .sort((a, b) => (a.status === 'alert' ? -1 : b.status === 'alert' ? 1 : 0)))

// 设备状态过滤（概览条点击切换）：'' = 全部异常
const statusFilter = ref<'' | 'warn' | 'alert'>('')
const shownAbnormals = computed(() =>
  statusFilter.value ? abnormals.value.filter((d) => d.status === statusFilter.value) : abnormals.value)

const unackedCount = computed(() => alerts.value.length)

// ===== 类型图层（保留原 M9 能力） =====
const LAYER_GROUPS = [
  { key: 'router', label: '路由器', types: ['router', 'atm'] },
  { key: 'switch', label: '交换机', types: ['core', 'switch', 'aggr', 'loadbalancer', '1u', '2u'] },
  { key: 'firewall', label: '安全设备', types: ['firewall', 'sec'] },
  { key: 'server', label: '服务器', types: ['server', '1u', '2u'] },
  { key: 'data', label: '数据/资源', types: ['db', 'pool', 'cloud', 'idc'] },
  { key: 'app', label: '业务/管理', types: ['app', 'plat', 'mgmt', 'biz', 'gateway'] },
  { key: 'site', label: '站点/园区', types: ['home', 'corp', 'factory', 'apt', 'room'] },
  { key: 'other', label: '其他', types: ['collect', 'optic'] },
]
const filter = reactive({ hiddenTypes: [] as string[] })
const typeCount = reactive<Record<string, number>>({})
const totalNodes = computed(() => Object.values(typeCount).reduce((a, b) => a + b, 0))

function toggleGroup(g) {
  const hidden = new Set(filter.hiddenTypes)
  const allIn = g.types.every((t) => hidden.has(t))
  for (const t of g.types) { if (allIn) hidden.delete(t); else hidden.add(t) }
  filter.hiddenTypes = [...hidden]
}
const groupVisible = (g) => !g.types.every((t) => filter.hiddenTypes.includes(t))

// ===== 下钻定位：设备/告警 → 拓扑节点 → 镜头飞行 + 设备抽屉 =====
const gvRef = ref<InstanceType<typeof GraphView>>()
const drawer = ref({ deviceId: null as string | null, nodeId: '', open: false })

function nodeOfDevice(d: Device | undefined) {
  return d?.referenced_by?.find((r) => r.node_id) ?? null
}
function drillToDevice(d: Device) {
  const node = nodeOfDevice(d)
  if (node) gvRef.value?.focusNode(node.node_id)
  drawer.value = { deviceId: d.id, nodeId: node?.node_id || '', open: true }
}
function drillToAlert(a: Alert) {
  if (!a.device_id) return
  const d = devices.value.find((x) => x.id === a.device_id)
  const node = nodeOfDevice(d)
  if (node) gvRef.value?.focusNode(node.node_id)
  drawer.value = { deviceId: a.device_id, nodeId: node?.node_id || '', open: true }
}
function openDevice(deviceId: string | null, nodeId: string) {
  if (demo.value) return
  drawer.value = { deviceId, nodeId, open: true }
}

// ===== 实时：WS 增量 + 30s 轮询兜底 =====
let offFeed: (() => void) | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

async function load() {
  try {
    const [o, d, a] = await Promise.all([
      api.overview(), api.devices(), api.alerts({ limit: '30', unacked: '1' }),
    ])
    overview.value = o
    devices.value = d
    // 只保留新拉取列表里没有的（已确认的会被过滤掉，本地同步剔除）
    const ids = new Set(a.map((x) => x.id))
    alerts.value = alerts.value.filter((x) => ids.has(x.id)).concat(a.filter((x) => !alerts.value.some((y) => y.id === x.id)))
    // 拓扑类型统计（首屏后 topologyActive 已含在 GraphView 内，这里为图层面板计数）
    if (Object.keys(typeCount).length === 0) {
      const t = await api.topologyActive()
      for (const n of t.canvas.nodes || []) if (n.type) typeCount[n.type] = (typeCount[n.type] || 0) + 1
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  }
}

function onFeed(m: any) {
  if (m.type === '__resync') { load(); return }
  if (m.type !== 'feed_update') return
  if (m.statuses) {
    for (const s of m.statuses) {
      const d = devices.value.find((x) => x.id === s.id)
      if (d) d.status = s.status
    }
  }
  if (m.alerts?.length) {
    for (const a of m.alerts) {
      if (!alerts.value.some((x) => x.id === a.id)) alerts.value.unshift(a)
    }
    alerts.value = alerts.value.slice(0, 30)
  }
}

// ===== 演示模式（保留） =====
const demo = ref(false)

const levelText: Record<string, string> = { info: '提示', warn: '警告', crit: '严重' }
const timeStr = (iso: string) => new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

onMounted(() => {
  load()
  pollTimer = setInterval(load, 30000)
  offFeed = useFeed(onFeed)
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  offFeed?.()
})
</script>

<template>
  <div class="tw">
    <!-- 左侧状态面板 -->
    <aside v-if="!demo" class="tw-panel">
      <!-- 状态概览条（点击切换异常列表过滤） -->
      <div class="tw-stats">
        <div class="tw-stat"><span class="tw-stat-num">{{ devices.length }}</span><span>设备</span></div>
        <div class="tw-stat ok"><span class="tw-stat-num">{{ devices.length - abnormals.length }}</span><span>正常</span></div>
        <div class="tw-stat warn" :class="{ on: statusFilter === 'warn' }" @click="statusFilter = statusFilter === 'warn' ? '' : 'warn'">
          <span class="tw-stat-num">{{ abnormals.filter((d) => d.status === 'warn').length }}</span><span>警告</span>
        </div>
        <div class="tw-stat alert" :class="{ on: statusFilter === 'alert' }" @click="statusFilter = statusFilter === 'alert' ? '' : 'alert'">
          <span class="tw-stat-num">{{ abnormals.filter((d) => d.status === 'alert').length }}</span><span>严重</span>
        </div>
        <div class="tw-stat unacked"><span class="tw-stat-num">{{ unackedCount }}</span><span>未确认告警</span></div>
      </div>

      <!-- 异常设备（下钻） -->
      <section class="tw-sec">
        <div class="tw-sec-head">异常设备 <span class="dim">（点击定位）</span></div>
        <div v-if="shownAbnormals.length === 0" class="tw-empty">暂无异常设备</div>
        <div v-for="d in shownAbnormals" :key="d.id" class="tw-item" :class="'st-' + d.status" @click="drillToDevice(d)">
          <i class="tw-dot" />
          <div class="tw-item-main">
            <div class="tw-item-name">{{ d.name }}</div>
            <div class="tw-item-sub">{{ d.ip || '—' }}<template v-if="d.referenced_by?.length"> · {{ d.referenced_by[0].node_label }}</template></div>
          </div>
          <span class="tw-item-tag">{{ d.status === 'alert' ? '严重' : '警告' }}</span>
        </div>
      </section>

      <!-- 实时告警（未确认，下钻） -->
      <section class="tw-sec grow">
        <div class="tw-sec-head">实时告警 <span class="dim">（未确认，点击定位）</span></div>
        <div v-if="alerts.length === 0" class="tw-empty">暂无未确认告警</div>
        <div v-for="a in alerts" :key="a.id" class="tw-item" :class="'lv-' + a.level" @click="drillToAlert(a)">
          <i class="tw-dot" />
          <div class="tw-item-main">
            <div class="tw-item-name">{{ a.device_name || '（未关联设备）' }}：{{ a.title }}</div>
            <div class="tw-item-sub">{{ levelText[a.level] }} · {{ timeStr(a.created_at) }}</div>
          </div>
        </div>
      </section>

      <!-- 类型图层 -->
      <section class="tw-sec">
        <div class="tw-sec-head">类型图层 <span class="dim">（{{ totalNodes }} 节点）</span></div>
        <div class="tw-layers">
          <label v-for="g in LAYER_GROUPS" :key="g.key" class="tw-layer" :class="{ off: !groupVisible(g) }">
            <input type="checkbox" :checked="groupVisible(g)" @change="toggleGroup(g)" />
            <span class="tw-ly-label">{{ g.label }}</span>
            <span class="tw-ly-count">{{ g.types.reduce((s, t) => s + (typeCount[t] || 0), 0) }}</span>
          </label>
        </div>
      </section>

      <button class="tw-demo-btn" @click="demo = true">▶ 演示模式</button>
    </aside>

    <!-- 画布 -->
    <div class="tw-canvas" :class="{ full: demo }" @click.self="demo = false">
      <GraphView ref="gvRef" :filter="{ hiddenTypes: filter.hiddenTypes }" @open-device="openDevice" />
      <div v-if="demo" class="tw-demo-tag">IT 运维状态孪生 · 实时</div>
      <div v-if="demo" class="tw-demo-quit">点击空白处退出演示</div>
    </div>

    <!-- 设备抽屉 -->
    <DeviceDrawer
      :device-id="drawer.deviceId"
      :node-id="drawer.nodeId"
      :node-label="drawer.nodeId ? (gvRef?.nodeLabelById(drawer.nodeId) || '') : ''"
      :open="drawer.open"
      @close="drawer.open = false"
      @goto-editor="(nodeId) => { drawer.open = false; router.push({ path: '/admin/network/topology', query: { node: nodeId } }) }"
    />
  </div>
</template>

<style scoped>
.tw { display: flex; height: 100%; min-height: 0; }
.tw-panel {
  width: 264px; flex-shrink: 0; background: #fff; border-right: 1px solid #e4e7ed;
  display: flex; flex-direction: column; gap: 10px; padding: 12px 14px;
}
.dim { color: #909399; font-weight: 400; font-size: 12px; }

/* 状态概览条 */
.tw-stats { display: flex; gap: 6px; }
.tw-stat {
  flex: 1; text-align: center; padding: 7px 2px 6px; border-radius: 8px;
  background: #f5f7fa; display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: #606266;
}
.tw-stat-num { font-size: 16px; font-weight: 700; color: #303133; line-height: 1; }
.tw-stat.ok .tw-stat-num { color: #18a058; }
.tw-stat.warn { cursor: pointer; }
.tw-stat.warn .tw-stat-num { color: #e6a23c; }
.tw-stat.warn.on { background: #fdf3e3; }
.tw-stat.alert { cursor: pointer; }
.tw-stat.alert .tw-stat-num { color: #e64545; }
.tw-stat.alert.on { background: #fdecec; }
.tw-stat.unacked .tw-stat-num { color: #2f7bff; }

/* 区块 */
.tw-sec { display: flex; flex-direction: column; min-height: 0; }
.tw-sec.grow { flex: 1; overflow-y: auto; }
.tw-sec-head { font-weight: 600; font-size: 13px; color: #303133; margin-bottom: 6px; flex-shrink: 0; }

.tw-empty { font-size: 12px; color: #b0b6bf; padding: 6px 2px; }

/* 列表项（下钻） */
.tw-item {
  display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px;
  cursor: pointer; border-left: 3px solid transparent;
}
.tw-item:hover { background: #f0f7ff; }
.tw-item.st-alert, .tw-item.lv-crit { border-left-color: #e64545; }
.tw-item.st-warn, .tw-item.lv-warn { border-left-color: #e6a23c; }
.tw-item.lv-info { border-left-color: #b0b6bf; }
.tw-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: #b0b6bf; }
.tw-item.st-alert .tw-dot, .tw-item.lv-crit .tw-dot { background: #e64545; animation: tw-pulse 1.2s infinite; }
.tw-item.st-warn .tw-dot, .tw-item.lv-warn .tw-dot { background: #e6a23c; }
@keyframes tw-pulse { 50% { opacity: .35; } }
.tw-item-main { flex: 1; min-width: 0; }
.tw-item-name { font-size: 12.5px; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tw-item-sub { font-size: 11px; color: #909399; margin-top: 1px; }
.tw-item-tag {
  font-size: 11px; padding: 1px 7px; border-radius: 8px; flex-shrink: 0;
  background: #f0f2f5; color: #909399;
}
.tw-item.st-alert .tw-item-tag { background: #fdecec; color: #e64545; }
.tw-item.st-warn .tw-item-tag { background: #fdf3e3; color: #e6a23c; }

/* 图层 */
.tw-layers { display: flex; flex-direction: column; gap: 2px; }
.tw-layer {
  display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px;
  font-size: 12.5px; color: #303133; cursor: pointer; user-select: none;
}
.tw-layer:hover { background: #f0f7ff; }
.tw-layer.off { color: #b0b6bf; }
.tw-layer input { accent-color: #2f7bff; }
.tw-ly-label { flex: 1; }
.tw-ly-count { font-size: 11px; color: #909399; background: #f0f2f5; padding: 1px 7px; border-radius: 8px; }
.tw-layer.off .tw-ly-count { background: #f5f5f5; color: #c8cdd3; }

.tw-demo-btn {
  width: 100%; padding: 9px 0; border: none; border-radius: 8px; cursor: pointer; flex-shrink: 0;
  background: linear-gradient(135deg, #2f7bff, #1a56db); color: #fff; font-size: 13px; font-weight: 600;
}
.tw-demo-btn:hover { filter: brightness(1.08); }

.tw-canvas { flex: 1; min-width: 0; position: relative; background: #0a1220; }
.tw-canvas.full { position: fixed; inset: 0; z-index: 50; }
.tw-demo-tag {
  position: absolute; top: 16px; left: 24px; z-index: 30;
  font-size: 15px; letter-spacing: 2px; color: rgba(150, 190, 255, 0.85); pointer-events: none;
}
.tw-demo-quit {
  position: absolute; bottom: 14px; right: 20px; z-index: 30;
  font-size: 12px; color: rgba(150, 190, 255, 0.45); pointer-events: none;
}
</style>
