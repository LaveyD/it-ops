<script setup lang="ts">
// 机房环境实时监测（温度/湿度/UPS 负载）：最新值轮询 + WS 增量更新
// 真源（EMQ/动环网关/Zabbix）经 POST /api/room-monitor/report 写入后本卡自动显示
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api } from '../../api'
import { useFeed } from '../../composables/useWs'
import type { RoomMetricLatest } from '../../types'

const METRICS = [
  { key: 'temperature', label: '温度', unit: '℃' },
  { key: 'humidity', label: '湿度', unit: '%RH' },
  { key: 'ups_load', label: 'UPS 负载', unit: '%' },
]

const list = ref<RoomMetricLatest[]>([])
let offFeed: (() => void) | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

const byRoom = computed(() => {
  const m = new Map<string, { name: string; items: Record<string, { value: number; ts: string }> }>()
  for (const r of list.value) {
    if (!m.has(r.room_name)) m.set(r.room_name, { name: r.room_name, items: {} })
    m.get(r.room_name)!.items[r.metric] = { value: r.value, ts: r.ts }
  }
  return [...m.values()]
})

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// 超阈值提示：温度 >30℃ 或 <18℃ / 湿度 >70% 或 <35% / UPS >85%
function statusCls(metric: string, v: number): string {
  if (metric === 'temperature' && (v > 30 || v < 18)) return 'bad'
  if (metric === 'humidity' && (v > 70 || v < 35)) return 'bad'
  if (metric === 'ups_load' && v > 85) return 'bad'
  return ''
}

function onFeed(m: any) {
  if (m.type === '__resync') { load(); return }
  if (m.type !== 'feed_update' || !m.room_metrics?.length) return
  const map = new Map(list.value.map((r) => [r.room_id + ':' + r.metric, r]))
  for (const rm of m.room_metrics) {
    map.set(rm.room_id + ':' + rm.metric, {
      room_id: rm.room_id, room_name: rm.room_name, metric: rm.metric,
      value: rm.value, source: 'mock', ts: rm.ts,
    })
  }
  list.value = [...map.values()]
}

async function load() {
  try { list.value = await api.roomMetricsLatest() } catch (e) { console.error(e) }
}

onMounted(() => {
  load()
  pollTimer = setInterval(load, 30000)
  offFeed = useFeed(onFeed)
})
onUnmounted(() => { offFeed?.(); if (pollTimer) clearInterval(pollTimer) })
</script>

<template>
  <div class="rm">
    <div v-for="room in byRoom" :key="room.name" class="room">
      <div class="rhead">{{ room.name }}</div>
      <div class="cells">
        <div v-for="mt in METRICS" :key="mt.key" class="cell" :class="statusCls(mt.key, room.items[mt.key]?.value ?? 0)">
          <b>{{ room.items[mt.key] ? room.items[mt.key].value.toFixed(1) : '--' }}</b>
          <span>{{ mt.unit }}</span>
          <em>{{ mt.label }}</em>
        </div>
      </div>
    </div>
    <div v-if="!byRoom.length" class="empty">暂无机房监测数据</div>
  </div>
</template>

<style scoped>
.rm { display: flex; flex-direction: column; gap: 10px; }
.rhead { font-size: 12px; color: var(--text-dim); margin-bottom: 6px; }
.cells { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
.cell {
  padding: 8px 6px; border-radius: 8px; text-align: center;
  background: rgba(8,16,32,.5); border: 1px solid var(--border);
}
.cell b { display: inline; font-size: 18px; color: var(--accent); font-variant-numeric: tabular-nums; }
.cell span { font-size: 11px; color: var(--text-dim); margin-left: 2px; }
.cell em { display: block; font-style: normal; font-size: 11px; color: var(--text-dim); margin-top: 3px; }
.cell.bad { border-color: var(--crit); }
.cell.bad b { color: var(--crit); }
.empty { padding: 14px 0; text-align: center; color: var(--text-dim); font-size: 12px; }
</style>
