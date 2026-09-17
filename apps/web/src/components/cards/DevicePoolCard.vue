<script setup lang="ts">
// 终端设备资产池：总量/使用量/余量，分类条形 + 顶部合计
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api } from '../../api'
import { useFeed } from '../../composables/useWs'
import type { DevicePool } from '../../types'

const pools = ref<DevicePool[]>([])
let offFeed: (() => void) | null = null

const totals = computed(() => pools.value.reduce(
  (acc, p) => ({ total: acc.total + p.total, used: acc.used + p.used }),
  { total: 0, used: 0 }))
const freeTotal = computed(() => totals.value.total - totals.value.used)

// 利用率颜色：>=85% 橙、>=95% 红
function barClass(p: DevicePool) {
  if (p.total === 0) return ''
  const r = p.used / p.total
  return r >= 0.95 ? 'hot' : r >= 0.85 ? 'warm' : ''
}

function onFeed(m: any) {
  if (m.type === '__resync') { load(); return }
  if (m.type !== 'feed_update' || !m.pools?.length) return
  const map = new Map(m.pools.map((p: any) => [p.id, p]))
  pools.value = pools.value.map((p) => map.get(p.id) ?? p)
}

async function load() {
  try { pools.value = await api.devicePools() } catch (e) { console.error(e) }
}

onMounted(() => {
  load()
  offFeed = useFeed(onFeed)
})
onUnmounted(() => { offFeed?.() })
</script>

<template>
  <div class="pool">
    <div class="sum">
      <div class="sum-item">
        <b>{{ totals.total }}</b><span>总量</span>
      </div>
      <div class="sum-item">
        <b class="used">{{ totals.used }}</b><span>使用中</span>
      </div>
      <div class="sum-item">
        <b class="free">{{ freeTotal }}</b><span>余量</span>
      </div>
    </div>
    <div class="rows">
      <div v-for="p in pools" :key="p.id" class="row">
        <span class="cat">{{ p.category }}</span>
        <div class="bar"><i :class="barClass(p)" :style="{ width: (p.total ? (p.used / p.total) * 100 : 0) + '%' }"></i></div>
        <span class="num">{{ p.used }}/{{ p.total }}<em>余 {{ p.free }}</em></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pool { display: flex; flex-direction: column; gap: 10px; }
.sum { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
.sum-item {
  text-align: center; padding: 8px 4px; border-radius: 8px;
  background: rgba(8,16,32,.5); border: 1px solid var(--border);
}
.sum-item b { display: block; font-size: 20px; color: var(--accent); }
.sum-item b.used { color: var(--ok); }
.sum-item b.free { color: var(--text); }
.sum-item span { font-size: 11px; color: var(--text-dim); }
.rows { display: flex; flex-direction: column; gap: 7px; }
.row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.cat { flex-shrink: 0; width: 56px; color: var(--text-dim); text-align: right; }
.bar { flex: 1; height: 8px; border-radius: 4px; background: rgba(20,34,60,.6); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, #2f7bff, #34c8ff); transition: width .6s; }
.bar i.warm { background: linear-gradient(90deg, #faad14, #ffc53d); }
.bar i.hot { background: linear-gradient(90deg, #ff4d4f, #ff7875); }
.num { flex-shrink: 0; font-variant-numeric: tabular-nums; }
.num em { font-style: normal; color: var(--text-dim); margin-left: 6px; }
</style>
