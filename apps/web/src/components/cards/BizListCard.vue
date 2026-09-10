<script setup lang="ts">
import type { BizSystem } from '../../types'

const props = defineProps<{ systems: BizSystem[] }>()
</script>

<template>
  <ul class="biz-list">
    <li v-for="b in props.systems" :key="b.id">
      <span class="dot" :class="b.status"></span>
      <span class="name">{{ b.name }}</span>
      <span class="owner" v-if="b.owner">{{ b.owner }}</span>
      <span class="sla" :class="{ low: b.sla_actual != null && b.sla_target != null && b.sla_actual < b.sla_target }">
        {{ b.sla_actual != null ? b.sla_actual + '%' : '—' }}
      </span>
    </li>
  </ul>
</template>

<style scoped>
.biz-list { list-style: none; display: flex; flex-direction: column; gap: 9px; }
.biz-list li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.biz-list .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.biz-list .owner { color: var(--text-dim); font-size: 11px; }
.biz-list .sla { color: var(--text-dim); font-size: 12px; min-width: 44px; text-align: right; }
.biz-list .sla.low { color: var(--warn); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot.normal { background: var(--ok); }
.dot.warn { background: var(--warn); }
.dot.alert { background: var(--crit); box-shadow: 0 0 8px var(--crit); }
</style>
