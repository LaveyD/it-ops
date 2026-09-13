<script setup lang="ts">
// @ts-nocheck
import { onMounted, onUnmounted, ref } from 'vue'
import { TopoEngine, fitToView } from './topo-core'
import { api } from '../../api'
import type { TopologyActive } from '../../types'
import { watch } from 'vue'

// 大屏只读拓扑：WS 增量（状态/新告警）+ 10s 轮询兜底（拓扑版本变更）
// hover 浮层（名称/IP/状态/最近告警）+ 点击 → 设备抽屉
import { useFeed } from '../../composables/useWs'
const emit = defineEmits<{ (e: 'open-device', deviceId: string, nodeId: string): void }>()
// M8 过滤器（后台只读模式）：数据层过滤后喂引擎，不动引擎内部。
// q=关键词（节点名/设备/IP）、status=normal|warn|alert|unmanaged、onlyAbnormal=只看异常
const props = defineProps<{
  filter?: { q?: string; status?: string; onlyAbnormal?: boolean }
  // M8 版本查看：外部指定 canvas（非生效版本快照）；不传则用 active
  externalCanvas?: { nodes: unknown[]; links: unknown[]; groups?: unknown[] } | null
}>()
const box = ref<HTMLElement>()
const active = ref<TopologyActive | null>(null)
const lastAlerts = ref<Record<string, string>>({}) // deviceId -> 最近一条告警 title
let engine: TopoEngine | null = null

// hover 浮层状态
const tip = ref({ show: false, x: 0, y: 0, nodeId: '', label: '', deviceId: '', status: '', ip: '' })

let poll: ReturnType<typeof setInterval> | null = null
let offFeed: (() => void) | null = null

// 数据层过滤：无过滤条件时原样返回（保留 groups）；有过滤时按节点状态/关键词过滤，
// 连线两端都被保留才留下，groups 清空（过滤视图不显示分组框）。
function filteredCanvas(canvas, devices) {
  const f = props.filter
  if (!f || (!f.q && !f.status && !f.onlyAbnormal)) return canvas
  const q = (f.q || '').trim().toLowerCase()
  const kept = new Set()
  const nodes = (canvas.nodes || []).filter((n) => {
    const did = n.properties && n.properties.deviceId
    const dev = did ? devices[did] : null
    const st = dev ? dev.status : 'unmanaged'
    if (q) {
      const hay = [n.label, dev ? dev.name : '', dev ? dev.ip : ''].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (f.status && st !== f.status) return false
    if (f.onlyAbnormal && st !== 'warn' && st !== 'alert') return false
    kept.add(n.id)
    return true
  })
  const links = (canvas.links || []).filter((l) => kept.has(l.source) && kept.has(l.target))
  return { nodes, links, groups: [] }
}

function renderSource(canvas, devices) {
  // 外部快照优先（查看非生效版本）
  const src = props.externalCanvas || canvas
  return filteredCanvas(src, devices)
}

async function load() {
  try {
    const a = await api.topologyActive()
    const changed = !active.value || active.value.id !== a.id
    if (engine) {
      engine.setDevices(a.devices)
      if (changed) {
        engine.renderCanvas(renderSource(a.canvas, a.devices))
        // 首次加载（active 尚为 null）或拓扑版本变更 → 重新自适应缩放居中，
        // 保证首屏就铺满并居中，而不是停在默认的左上角视图。
        setTimeout(() => { if (engine?.graph) fitToView(engine.graph) }, 60)
      }
    }
    active.value = a
    // 最近告警（每条 deviceId 一条，供 hover 浮层）
    try {
      const alerts = await api.alerts({ limit: '50' })
      const m: Record<string, string> = {}
      for (const al of alerts) if (al.device_id && !m[al.device_id]) m[al.device_id] = al.title
      lastAlerts.value = m
    } catch (e) { /* ignore */ }
  } catch (e) { console.error(e) }
}

function onNodeClick(node) {
  const did = node.properties && node.properties.deviceId
  if (did && active.value?.devices[did]) {
    emit('open-device', did, node.id)
  } else {
    emit('open-device', null, node.id) // 未纳管 → 抽屉空态
  }
}

// hover 拾取：复刻引擎事件管线坐标换算（device px → scene 数据坐标）
function pickNode(e: MouseEvent) {
  const g = engine?.graph
  if (!g || !g.scene) return null
  const rect = box.value!.getBoundingClientRect()
  const scene = g.scene
  let x = (e.clientX - rect.left) * (g.stage.pixelRatio || 1)
  let y = (e.clientY - rect.top) * (g.stage.pixelRatio || 1)
  try {
    x = x / scene.scaleX
    y = y / scene.scaleY
    const off = scene.getOffsetTranslate()
    x -= off.translateX
    y -= off.translateY
  } catch (err) { return null }
  if (scene.displayElements) {
    for (const n of scene.displayElements.nodes || []) {
      if (n.visible && n.isInBound(x, y)) return n
    }
  }
  return null
}
function onMove(e: MouseEvent) {
  const n = pickNode(e)
  if (!n) { tip.value.show = false; return }
  const did = n.properties && n.properties.deviceId
  const dev = active.value?.devices[did]
  const rect = box.value!.getBoundingClientRect()
  tip.value = {
    show: true,
    x: Math.min(e.clientX - rect.left + 14, rect.width - 210),
    y: Math.min(e.clientY - rect.top + 14, rect.height - 120),
    nodeId: n.id, label: n.label, deviceId: did || '',
    status: dev ? dev.status : 'unmanaged', ip: dev ? (dev.ip || '—') : '—',
  }
}

onMounted(async () => {
  const waitEngine = () => new Promise<void>((res) => {
    if (window.VisGraph) return res()
    let n = 0
    const t = setInterval(() => { if (window.VisGraph || ++n > 100) { clearInterval(t); res() } }, 100)
  })
  await waitEngine()
  engine = new TopoEngine(box.value!, {
    dark: true,
    readOnly: true,
    onNodeClick,
    onEmptyClick: () => { tip.value.show = false },
  })
  engine.init(null)
  await load()
  poll = setInterval(load, 10000) // 轮询兜底：拓扑版本变更（设备状态/告警走 WS）
  // 过滤器变化 → 重渲染（数据层过滤，不依赖引擎内部 API）
  watch(() => props.filter, () => {
    if (engine && active.value) {
      engine.renderCanvas(renderSource(active.value.canvas, active.value.devices))
      setTimeout(() => { if (engine?.graph) fitToView(engine.graph) }, 60)
    }
  }, { deep: true })
  // 外部快照变化（查看版本切换）→ 重渲染
  watch(() => props.externalCanvas, () => {
    if (engine && active.value) {
      engine.renderCanvas(renderSource(active.value.canvas, active.value.devices))
      setTimeout(() => { if (engine?.graph) fitToView(engine.graph) }, 60)
    }
  }, { deep: true })
  // WS 增量：状态变更 → 节点立即变色；新告警 → hover 浮层最近告警
  offFeed = useFeed((m) => {
    if (m.type !== 'feed_update') return
    if (m.statuses && active.value) {
      for (const s of m.statuses) {
        if (active.value.devices[s.id]) active.value.devices[s.id].status = s.status
      }
      if (engine) engine.setDevices(active.value.devices)
    }
    if (m.alerts) {
      const m2 = { ...lastAlerts.value }
      for (const a of m.alerts) if (a.device_id && !m2[a.device_id]) m2[a.device_id] = a.title
      lastAlerts.value = m2
    }
  })
})
onUnmounted(() => { if (poll) clearInterval(poll); offFeed?.(); engine?.dispose() })

// 供父级取节点名（抽屉标题）
function nodeLabelById(id: string) {
  const canvas = props.externalCanvas || active.value?.canvas
  return canvas?.nodes.find((n) => n.id === id)?.label || id
}
// 调试/测试：模拟点击某节点（走 onNodeClick → open-device）
function clickNode(id: string) {
  const n = active.value?.canvas.nodes.find((x) => x.id === id)
  if (n) onNodeClick(n)
}
defineExpose({ nodeLabelById, clickNode })

const statusText: Record<string, string> = { normal: '正常', warn: '警告', alert: '严重', unmanaged: '未纳管' }
</script>

<template>
  <div ref="box" class="gv" @mousemove="onMove" @mouseleave="tip.show = false">
    <div v-if="tip.show" class="tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">
      <div class="tip-name">{{ tip.label }} <span :class="'s-' + tip.status">{{ statusText[tip.status] }}</span></div>
      <div v-if="tip.deviceId" class="tip-row">IP: {{ tip.ip }}</div>
      <div v-if="tip.deviceId && lastAlerts[tip.deviceId]" class="tip-row alert">⚠ {{ lastAlerts[tip.deviceId] }}</div>
      <div v-else-if="!tip.deviceId" class="tip-row dim">该节点未关联设备</div>
      <div class="tip-row dim">点击查看设备详情</div>
    </div>
    <div v-if="!active" class="loading">拓扑加载中…</div>
  </div>
</template>

<style scoped>
.gv { position: relative; width: 100%; height: 100%; overflow: hidden; }
.tip {
  position: absolute; z-index: 10; width: 200px; pointer-events: none;
  background: rgba(10, 20, 40, 0.95); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 10px; box-shadow: 0 4px 16px rgba(0,0,0,.4);
}
.tip-name { font-size: 13px; font-weight: 600; color: var(--text); }
.tip-row { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
.tip-row.alert { color: var(--warn); }
.tip-row.dim { color: var(--text-dim); opacity: .7; }
.s-normal { color: var(--ok); } .s-warn { color: var(--warn); }
.s-alert { color: var(--crit); } .s-unmanaged { color: var(--text-dim); }
.loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text-dim); }
</style>
