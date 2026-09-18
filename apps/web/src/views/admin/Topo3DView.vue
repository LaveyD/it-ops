<script setup lang="ts">
// 3D 拓扑预览（实验页）：Three.js 三维网络纵深视图
// 数据源与 2D 版相同（/api/topology/active），交互对齐：
//  - 点击节点 → DeviceDrawer
//  - 类型图层开关（隐藏 = mesh 不可见）
//  - WS feed_update 增量改色（状态变化节点抬升/回落，alert 呼吸）
//  - 双击节点 → 镜头聚焦
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Topo3DCore } from '../../components/topology/topo3d-core'
import DeviceDrawer from '../../components/topology/DeviceDrawer.vue'
import { api } from '../../api'
import { useFeed } from '../../composables/useWs'
import type { TopologyActive } from '../../types'

const router = useRouter()
const box = ref<HTMLElement>()
let core: Topo3DCore | null = null
let offFeed: (() => void) | null = null
let poll: ReturnType<typeof setInterval> | null = null

const active = ref<TopologyActive | null>(null)
let activeFp = '' // active canvas 指纹：覆盖保存不改 id，靠内容变化触发重绘
const loading = ref(true)

// hover 浮层
const hover = ref<{ show: boolean; x: number; y: number; text: string }>({ show: false, x: 0, y: 0, text: '' })

// 类型图层（与状态孪生页同一分组口径）
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
const hiddenTypes = ref<string[]>([])
const typeCount = computed(() => {
  const m: Record<string, number> = {}
  for (const n of active.value?.canvas.nodes || []) m[n.type] = (m[n.type] || 0) + 1
  return m
})
const groupVisible = (g: { types: string[] }) => !g.types.some((t) => hiddenTypes.value.includes(t))
function toggleGroup(g: { types: string[] }) {
  const on = groupVisible(g)
  if (on) hiddenTypes.value = [...new Set([...hiddenTypes.value, ...g.types])]
  else hiddenTypes.value = hiddenTypes.value.filter((t) => !g.types.includes(t))
  core?.setHiddenTypes(hiddenTypes.value)
}

const statusText: Record<string, string> = { normal: '正常', warn: '警告', alert: '严重', unmanaged: '未纳管' }
const statusCss: Record<string, string> = {
  normal: '#22c55e', warn: '#faad14', alert: '#ff4d4f', unmanaged: '#5a6b85',
}

// 抽屉
const drawer = reactive({ open: false, deviceId: null as string | null, nodeId: '' })
function openDevice(nodeId: string) {
  const n = active.value?.canvas.nodes.find((x) => x.id === nodeId)
  const did = n?.properties?.deviceId
  drawer.deviceId = did && active.value?.devices[did] ? did : null
  drawer.nodeId = nodeId
  drawer.open = true
}

async function load() {
  try {
    const a = await api.topologyActive()
    // 结构变更判定：id 变化（新建/切换版本）或 canvas 内容变化
    // （"覆盖保存当前版本"不改 id，必须比内容，否则已打开的 3D 页不刷新）
    const fp = JSON.stringify(a.canvas)
    const changed = !active.value || active.value.id !== a.id || fp !== activeFp
    if (core && changed) core.setTopology(a.canvas, a.devices)
    active.value = a
    activeFp = fp
  } catch (e) { console.error(e) }
  loading.value = false
}

function onHover(id: string | null) {
  if (!id) { hover.value.show = false; return }
  const n = active.value?.canvas.nodes.find((x) => x.id === id)
  if (!n) return
  const did: string | undefined = n.properties?.deviceId
  const dev = did ? active.value?.devices[did] : null
  const st = dev ? dev.status : 'unmanaged'
  hover.value = {
    show: true, x: 0, y: 0,
    text: `${n.label} · ${statusText[st]}${dev ? ' · ' + (dev.ip || '—') : ' · 未关联设备'}`,
  }
}
function onTipMove(e: MouseEvent) {
  if (!hover.value.show) return
  const rect = box.value!.getBoundingClientRect()
  hover.value.x = Math.min(e.clientX - rect.left + 14, rect.width - 260)
  hover.value.y = Math.min(e.clientY - rect.top + 14, rect.height - 80)
}

onMounted(async () => {
  core = new Topo3DCore(box.value!)
  core.onNodeClick = (id) => openDevice(id)
  core.onNodeHover = (id) => onHover(id)
  await load()
  poll = setInterval(load, 10000)
  // WS 增量：状态变更 → 改色 + 抬升/回落
  offFeed = useFeed((m) => {
    if (m.type !== 'feed_update' || !active.value) return
    if (m.statuses) {
      for (const s of m.statuses) {
        if (active.value.devices[s.id]) active.value.devices[s.id].status = s.status
        core?.setDeviceStatus(s.id, s.status)
      }
    }
  })
})
onUnmounted(() => {
  if (poll) clearInterval(poll)
  offFeed?.()
  core?.dispose()
  core = null
})
</script>

<template>
  <div class="t3d">
    <aside class="side">
      <div class="side-head">
        <span class="t">3D 拓扑 · 实验</span>
        <span class="dim">Three.js 实时渲染</span>
      </div>

      <section class="sec">
        <div class="sec-head">操作</div>
        <ul class="dim hints">
          <li>左键拖拽 — 旋转</li>
          <li>右键拖拽 — 平移</li>
          <li>滚轮 — 缩放</li>
          <li>双击节点 — 镜头聚焦</li>
          <li>点击节点 — 设备详情</li>
        </ul>
      </section>

      <section class="sec">
        <div class="sec-head">状态图例</div>
        <div class="legend">
          <span v-for="(txt, k) in statusText" :key="k" class="lg">
            <i :style="{ background: statusCss[k] }"></i>{{ txt }}
          </span>
        </div>
        <p class="dim note">状态决定抬升高度：严重节点最高并呼吸闪烁</p>
      </section>

      <section class="sec">
        <div class="sec-head">类型图层 <span class="dim">（{{ (active?.canvas.nodes || []).length }} 节点）</span></div>
        <div class="layers">
          <label v-for="g in LAYER_GROUPS" :key="g.key" class="layer" :class="{ off: !groupVisible(g) }">
            <input type="checkbox" :checked="groupVisible(g)" @change="toggleGroup(g)" />
            <span class="lg-label">{{ g.label }}</span>
            <span class="lg-count">{{ g.types.reduce((s, t) => s + (typeCount[t] || 0), 0) }}</span>
          </label>
        </div>
      </section>
    </aside>

    <div ref="box" class="stage" @mousemove="onTipMove">
      <div v-if="hover.show" class="tip" :style="{ left: hover.x + 'px', top: hover.y + 'px' }">{{ hover.text }}</div>
      <div v-if="loading" class="loading">3D 拓扑加载中…</div>
    </div>

    <DeviceDrawer
      :device-id="drawer.deviceId"
      :node-id="drawer.nodeId"
      :node-label="drawer.nodeId ? (active?.canvas.nodes.find(n => n.id === drawer.nodeId)?.label || '') : ''"
      :open="drawer.open"
      @close="drawer.open = false"
      @goto-editor="(nodeId: string) => { drawer.open = false; router.push({ path: '/admin/network/topology', query: { node: nodeId } }) }"
    />
  </div>
</template>

<style scoped>
.t3d { display: flex; height: 100%; min-height: 0; background: #0a1220; }
.side {
  width: 250px; flex: none; overflow-y: auto; padding: 14px 14px 20px;
  background: #0d1830; border-right: 1px solid rgba(90, 130, 200, 0.15);
  color: #dce8fa;
}
.side-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 14px; }
.side-head .t { font-size: 15px; font-weight: 700; color: #eaf2ff; }
.dim { color: #7d93b2; font-size: 12px; }
.note { opacity: .75; margin-top: 6px; }
.sec { margin-bottom: 16px; }
.sec-head { font-size: 12px; font-weight: 600; color: #9fb6d6; margin-bottom: 8px; }
.hints { margin: 0; padding-left: 16px; line-height: 1.8; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 10px; }
.lg { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; }
.lg i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.layers { display: flex; flex-direction: column; gap: 4px; }
.layer {
  display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px;
  cursor: pointer; font-size: 13px; background: rgba(47, 123, 255, 0.06);
}
.layer.off { opacity: .4; }
.lg-label { flex: 1; }
.lg-count { color: #7d93b2; font-size: 12px; }
.stage { position: relative; flex: 1; min-width: 0; overflow: hidden; }
.stage canvas { display: block; }
.tip {
  position: absolute; z-index: 10; max-width: 250px; pointer-events: none;
  background: rgba(10, 20, 40, 0.95); border: 1px solid rgba(90, 130, 200, 0.3); border-radius: 8px;
  padding: 8px 10px; font-size: 12px; color: #dce8fa; box-shadow: 0 4px 16px rgba(0,0,0,.4);
}
.loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #7d93b2; }
</style>
