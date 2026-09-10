<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api } from '../../api'
import type { Alert } from '../../types'

const alerts = ref<Alert[]>([])
const top = ref<Alert | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

// 跑马灯：逐条上移
const current = computed(() => top.value)

function tick() {
  if (!alerts.value.length) return
  top.value = null
  setTimeout(() => {
    top.value = alerts.value.shift() ?? null
    if (top.value) alerts.value.push(top.value)
  }, 700)
}

const levelText: Record<string, string> = { info: '提示', warn: '警告', crit: '严重' }
const timeStr = (iso: string) => new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

onMounted(async () => {
  try {
    const list = await api.alerts({ limit: '30' })
    alerts.value = [...list]
  } catch (e) { console.error(e) }
  timer = setInterval(tick, 4000)
  tick()
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div class="feed">
    <div class="slot" v-if="current">
      <span class="lv" :class="current.level">{{ levelText[current.level] }}</span>
      <div class="info">
        <div class="title">{{ current.title }}</div>
        <div class="sub">{{ current.device_name || '—' }} · {{ timeStr(current.created_at) }}
          <span v-if="current.acked" class="acked">已确认</span>
        </div>
      </div>
    </div>
    <div class="slot empty" v-else>等待新告警…</div>
    <div class="queue">
      <div class="q-item" v-for="a in alerts.slice(0, 3)" :key="a.id" :class="a.level">
        <span class="lv-mini" :class="a.level">{{ levelText[a.level] }}</span>
        <span class="q-title">{{ a.title }}</span>
        <span class="q-time">{{ timeStr(a.created_at) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.feed { display: flex; flex-direction: column; gap: 8px; }
.slot {
  display: flex; gap: 10px; padding: 10px 12px; border-radius: 8px;
  background: rgba(8, 16, 32, 0.5); border: 1px solid var(--border);
}
.slot.empty { justify-content: center; color: var(--text-dim); font-size: 12px; border-style: dashed; }
.lv {
  flex-shrink: 0; width: 34px; height: 34px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
}
.lv.info { background: rgba(47,123,255,.15); color: var(--accent); }
.lv.warn { background: rgba(250,173,20,.15); color: var(--warn); }
.lv.crit { background: rgba(255,77,79,.15); color: var(--crit); }
.info { min-width: 0; }
.title { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { font-size: 11px; color: var(--text-dim); margin-top: 3px; }
.acked { color: var(--ok); margin-left: 6px; }
.queue { display: flex; flex-direction: column; gap: 5px; }
.q-item { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 5px 8px; border-radius: 6px; background: rgba(20,34,60,.4); }
.q-item.crit { border-left: 2px solid var(--crit); }
.q-item.warn { border-left: 2px solid var(--warn); }
.q-item.info { border-left: 2px solid var(--accent); }
.lv-mini { flex-shrink: 0; font-size: 10px; padding: 1px 5px; border-radius: 4px; }
.lv-mini.info { color: var(--accent); background: rgba(47,123,255,.12); }
.lv-mini.warn { color: var(--warn); background: rgba(250,173,20,.12); }
.lv-mini.crit { color: var(--crit); background: rgba(255,77,79,.12); }
.q-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.q-time { color: var(--text-dim); font-size: 11px; flex-shrink: 0; }
</style>
