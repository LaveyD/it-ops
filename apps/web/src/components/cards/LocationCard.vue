<script setup lang="ts">
import { computed } from 'vue'
import type { Device } from '../../types'
import { useEChart } from '../../composables/useEChart'
import { CHART, baseOption, axisStyle } from '../../echarts/theme'

const props = defineProps<{ devices: Device[] }>()

const locs = computed(() => {
  const m: Record<string, number> = {}
  for (const d of props.devices) {
    const loc = d.location || '未分配'
    m[loc] = (m[loc] || 0) + 1
  }
  return Object.entries(m)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
})

useEChart((c) => {
  c.setOption({
    ...baseOption(),
    grid: { left: 8, right: 34, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', minInterval: 1, ...axisStyle },
    yAxis: { type: 'category', data: locs.value.map((l) => l.name).reverse(), ...axisStyle },
    series: [{
      type: 'bar', barWidth: 14,
      data: locs.value.map((l) => l.value).reverse(),
      itemStyle: { color: CHART.accent, borderRadius: [0, 5, 5, 0] },
      label: { show: true, position: 'right', color: CHART.text, fontSize: 11 },
    }],
  }, true)
}, locs)
</script>

<template>
  <div class="chart chart-md" ref="chart"></div>
</template>

<style scoped>
.chart-md { height: 170px; }
</style>
