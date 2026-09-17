<script setup lang="ts">
// 安防异常事件（未关门/闯入/尾随等），复用 alert 表 source=security
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from '../../api'
import { useFeed } from '../../composables/useWs'
import type { Alert } from '../../types'

const events = ref<Alert[]>([])
let offFeed: (() => void) | null = null

const levelText: Record<string, string> = { info: '提示', warn: '警告', crit: '严重' }
const timeStr = (iso: string) => new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

function onFeed(m: any) {
  if (m.type === '__resync') { load(); return }
  if (m.type !== 'feed_update' || !m.alerts?.length) return
  for (const a of m.alerts) {
    if (a.source !== 'security') continue
    if (!events.value.some((x) => x.id === a.id)) events.value.unshift(a)
  }
  events.value = events.value.slice(0, 8)
}

async function load() {
  try {
    const list = await api.alerts({ source: 'security', limit: '8' })
    events.value = [...list]
  } catch (e) { console.error(e) }
}

onMounted(() => {
  load()
  offFeed = useFeed(onFeed)
})
onUnmounted(() => { offFeed?.() })
</script>

<template>
  <div class="sec">
    <div v-for="a in events" :key="a.id" class="ev" :class="[a.level, { unacked: !a.acked }]">
      <span class="lv" :class="a.level">{{ levelText[a.level] }}</span>
      <div class="info">
        <div class="title">{{ a.title }}</div>
        <div class="sub">{{ a.detail || '—' }}<span v-if="!a.acked" class="mark">待处理</span></div>
      </div>
      <span class="time">{{ timeStr(a.created_at) }}</span>
    </div>
    <div v-if="!events.length" class="empty">暂无安防事件</div>
  </div>
</template>

<style scoped>
.sec { display: flex; flex-direction: column; gap: 6px; }
.ev {
  display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 6px;
  background: rgba(20,34,60,.4); font-size: 12px;
}
.ev.crit { border-left: 2px solid var(--crit); }
.ev.warn { border-left: 2px solid var(--warn); }
.ev.info { border-left: 2px solid var(--accent); }
.ev.unacked { outline: 1px solid rgba(255,255,255,.06); }
.lv { flex-shrink: 0; font-size: 10px; padding: 1px 5px; border-radius: 4px; }
.lv.info { color: var(--accent); background: rgba(47,123,255,.12); }
.lv.warn { color: var(--warn); background: rgba(250,173,20,.12); }
.lv.crit { color: var(--crit); background: rgba(255,77,79,.12); }
.info { flex: 1; min-width: 0; }
.title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { font-size: 11px; color: var(--text-dim); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mark { color: var(--crit); margin-left: 6px; }
.time { flex-shrink: 0; color: var(--text-dim); font-size: 11px; }
.empty { padding: 14px 0; text-align: center; color: var(--text-dim); font-size: 12px; }
</style>
