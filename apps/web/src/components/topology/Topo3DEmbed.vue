<script setup lang="ts">
// 大屏嵌入版 3D 拓扑：纯 canvas 渲染 + hover 浮层 + WS 实时状态 + 点击穿透
// 复用 Topo3DCore（管理端 Topo3DView 的渲染内核），不带侧栏/图层面板
import { onMounted, onUnmounted, ref } from 'vue'
import { Topo3DCore } from './topo3d-core'
import { api } from '../../api'
import { useFeed } from '../../composables/useWs'
import type { TopologyActive } from '../../types'

const emit = defineEmits<{ (e: 'open-device', deviceId: string | null, nodeId: string, nodeLabel?: string): void }>()
const props = defineProps<{ hideLabels?: boolean }>()

const box = ref<HTMLElement>()
let core: Topo3DCore | null = null
let offFeed: (() => void) | null = null
let poll: ReturnType<typeof setInterval> | null = null

const active = ref<TopologyActive | null>(null)
const loading = ref(true)
const hover = ref<{ show: boolean; x: number; y: number; text: string }>({ show: false, x: 0, y: 0, text: '' })

const statusText: Record<string, string> = { normal: '正常', warn: '警告', alert: '严重', unmanaged: '未纳管' }

function openDevice(nodeId: string) {
  const n = active.value?.canvas.nodes.find((x) => x.id === nodeId)
  const did = n?.properties?.deviceId
  const deviceId = did && active.value?.devices[did] ? did : null
  emit('open-device', deviceId, nodeId, n?.label)
}

async function load() {
  try {
    const a = await api.topologyActive()
    const changed = !active.value || active.value.id !== a.id
    if (core && changed) core.setTopology(a.canvas, a.devices)
    active.value = a
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
  hover.value.show = true
  hover.value.text = `${n.label} · ${statusText[st]}${dev ? ' · ' + (dev.ip || '—') : ' · 未关联设备'}`
}
function onTipMove(e: MouseEvent) {
  if (!hover.value.show || !box.value) return
  const rect = box.value.getBoundingClientRect()
  hover.value.x = Math.min(e.clientX - rect.left + 14, rect.width - 240)
  hover.value.y = Math.min(e.clientY - rect.top + 14, rect.height - 60)
}

onMounted(async () => {
  core = new Topo3DCore(box.value!, { hideLabels: props.hideLabels })
  core.onNodeClick = (id) => openDevice(id)
  core.onNodeHover = (id) => onHover(id)
  await load()
  poll = setInterval(load, 10000)
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
  <div ref="box" class="t3d-embed" @mousemove="onTipMove" @mouseleave="hover.show = false">
    <div v-if="hover.show" class="tip" :style="{ left: hover.x + 'px', top: hover.y + 'px' }">{{ hover.text }}</div>
    <div v-if="loading" class="loading">3D 拓扑加载中…</div>
  </div>
</template>

<style scoped>
.t3d-embed { position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden; }
.t3d-embed canvas { display: block; }
.tip {
  position: absolute; z-index: 10; max-width: 230px; pointer-events: none;
  background: rgba(10, 20, 40, 0.95); border: 1px solid rgba(90, 130, 200, 0.3); border-radius: 8px;
  padding: 7px 10px; font-size: 12px; color: #dce8fa; box-shadow: 0 4px 16px rgba(0,0,0,.4);
}
.loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text-dim); }
</style>
