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
// M9 hiddenTypes=隐藏的设备类型（3D 总览图层开关）
const props = defineProps<{
  filter?: { q?: string; status?: string; onlyAbnormal?: boolean; hiddenTypes?: string[] }
  // M8 版本查看：外部指定 canvas（非生效版本快照）；不传则用 active
  externalCanvas?: { nodes: unknown[]; links: unknown[]; groups?: unknown[] } | null
  // 隐藏节点名称标签（大屏模式）：默认隐藏，hover 浮层展示名称
  hideLabels?: boolean
}>()
const box = ref<HTMLElement>()
const active = ref<TopologyActive | null>(null)
let activeFp = '' // canvas 指纹：覆盖保存不改 id，靠内容变化触发重绘
const lastAlerts = ref<Record<string, string>>({}) // deviceId -> 最近一条告警 title
let engine: TopoEngine | null = null

// hover 浮层状态
const tip = ref({ show: false, x: 0, y: 0, nodeId: '', label: '', deviceId: '', status: '', ip: '' })
const nodeStyle = ref('flat') // 大屏节点样式切换：flat 扁平圆 / cube 立体立方体

let poll: ReturnType<typeof setInterval> | null = null
let offFeed: (() => void) | null = null

// 数据层过滤：无过滤条件时原样返回（保留 groups）；有过滤时按节点状态/关键词/类型过滤，
// 连线两端都被保留才留下，groups 清空（过滤视图不显示分组框）。
function filteredCanvas(canvas, devices) {
  const f = props.filter
  if (!f || (!f.q && !f.status && !f.onlyAbnormal && !(f.hiddenTypes && f.hiddenTypes.length))) return canvas
  const q = (f.q || '').trim().toLowerCase()
  const hidden = new Set(f.hiddenTypes || [])
  const kept = new Set()
  const nodes = (canvas.nodes || []).filter((n) => {
    if (hidden.has(n.type)) return false
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
    // 结构变更判定：id 变化或 canvas 内容变化（"覆盖保存当前版本"不改 id）
    const fp = JSON.stringify(a.canvas)
    const changed = !active.value || active.value.id !== a.id || fp !== activeFp
    if (engine) {
      engine.setDevices(a.devices)
      if (changed) {
        engine.renderCanvas(renderSource(a.canvas, a.devices))
        // 首次加载（active 尚为 null）或拓扑结构变更 → 重新自适应缩放居中，
        // 保证首屏就铺满并居中，而不是停在默认的左上角视图。
        setTimeout(() => { if (engine?.graph) fitToView(engine.graph) }, 60)
      }
    }
    active.value = a
    activeFp = fp
    // 最近告警（每条 deviceId 一条，供 hover 浮层）
    try {
      const alerts = await api.alerts({ limit: '50' })
      const m: Record<string, string> = {}
      for (const al of alerts) if (al.device_id && !m[al.device_id]) m[al.device_id] = al.title
      lastAlerts.value = m
    } catch (e) { /* ignore */ }
  } catch (e) { console.error(e) }
}

function toggleNodeStyle() {
  nodeStyle.value = nodeStyle.value === 'flat' ? 'cube' : 'flat'
  engine?.setNodeStyle(nodeStyle.value)
}

// ===== 容器尺寸跟随 =====
// 引擎（GraphVis UMD）只在 window resize 时同步 canvas 到容器尺寸，不响应容器自身变化。
// 大屏流式布局下页面高度会随卡片加载后撑高（实测容器 1161→1586），2D canvas 停在旧高度：
// 切 3D 再切回 2D 时新 canvas 按新高度居中，图整体下移约 213px。
// 这里用 ResizeObserver 监听容器：尺寸变化且 window 没变时代发 window.resize 让引擎同步
// canvas（引擎的处理器会保留 scale/translate）；加载稳定窗口内（用户未交互）再 fitToView
// 重新居中，保证首屏与切换回 2D 后的构图一致。用户一旦拖动/缩放/点击即停止自动居中。
let ro: ResizeObserver | null = null
let lastWinW = 0
let lastWinH = 0
let userTouched = false
let stabilizeTimer: ReturnType<typeof setTimeout> | null = null

function onUserTouch() { userTouched = true }

function onContainerResize() {
  const el = box.value
  const g = engine?.graph
  if (!el || !g || !g.stage) return
  const w = el.clientWidth, h = el.clientHeight
  if (w < 4 || h < 4 || (g.stage.width === w && g.stage.height === h)) return
  // window 真的变了 → 引擎自己的 window.resize 处理器会同步，这里不重复派发
  if (window.innerWidth !== lastWinW || window.innerHeight !== lastWinH) {
    lastWinW = window.innerWidth
    lastWinH = window.innerHeight
    return
  }
  window.dispatchEvent(new Event('resize'))
  if (!userTouched) setTimeout(() => { if (engine?.graph && !userTouched) fitToView(engine.graph) }, 60)
}

function setupResizeFollow() {
  if (!box.value) return
  lastWinW = window.innerWidth
  lastWinH = window.innerHeight
  ro = new ResizeObserver(onContainerResize)
  ro.observe(box.value)
  box.value.addEventListener('mousedown', onUserTouch)
  box.value.addEventListener('wheel', onUserTouch, { passive: true })
  // 加载稳定窗口：卡片陆续加载导致容器数次变高，窗口结束后停止自动 re-fit
  stabilizeTimer = setTimeout(() => { userTouched = true }, 800)
}

function onNodeClick(node) {
  const did = node.properties && node.properties.deviceId
  if (did && active.value?.devices[did]) {
    emit('open-device', did, node.id)
  } else {
    emit('open-device', null, node.id) // 未纳管 → 抽屉空态
  }
}

// M9 3D 总览：节点双击 → 相机聚焦。引擎 readOnly 模式吞掉 dblClick 回调，
// 故在容器 DOM 层自行监听（引擎的 handler 不 stopPropagation，事件仍可冒泡）。
function onDblClick(e: MouseEvent) {
  const n = pickNode(e)
  if (n && engine) engine.focusNode(n.id)
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
    nodeStyle: nodeStyle.value,
    hideLabels: props.hideLabels,
    onNodeClick,
    onEmptyClick: () => { tip.value.show = false },
  })
  engine.init(null)
  setupResizeFollow()
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
onUnmounted(() => {
  if (poll) clearInterval(poll)
  if (stabilizeTimer) clearTimeout(stabilizeTimer)
  if (ro) { if (box.value) { box.value.removeEventListener('mousedown', onUserTouch); box.value.removeEventListener('wheel', onUserTouch) }; ro.disconnect(); ro = null }
  offFeed?.()
  engine?.dispose()
})

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
defineExpose({
  nodeLabelById, clickNode,
  // M9：供父级（3D 总览图层面板等）聚焦某节点
  focusNode: (id: string) => engine?.focusNode(id),
})

const statusText: Record<string, string> = { normal: '正常', warn: '警告', alert: '严重', unmanaged: '未纳管' }
</script>

<template>
  <div ref="box" class="gv" @mousemove="onMove" @mouseleave="tip.show = false" @dblclick="onDblClick">
    <button class="style-toggle" :title="nodeStyle === 'flat' ? '切换为立体节点（等距立方体）' : '切换为扁平节点（圆）'" @click.stop="toggleNodeStyle">{{ nodeStyle === 'flat' ? '⬢' : '◻' }}</button>
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
.style-toggle {
  position: absolute; top: 10px; right: 10px; z-index: 12;
  width: 30px; height: 30px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--border); background: rgba(13,26,48,.7);
  color: var(--text-dim); font-size: 15px; line-height: 1;
}
.style-toggle:hover { color: var(--text); background: rgba(47,123,255,.2); }
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
