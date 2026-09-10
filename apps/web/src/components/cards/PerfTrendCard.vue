<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { api } from '../../api'
import type { Device, MetricSeries } from '../../types'
import { useEChart } from '../../composables/useEChart'
import { CHART, baseOption, axisStyle } from '../../echarts/theme'

const props = defineProps<{ devices: Device[] }>()

// 有指标的设备（idc/gateway 不采集）
const withMetrics = computed(() =>
  props.devices.filter((d) => !['idc', 'gateway'].includes(d.type)))
const selected = ref<string>('')
const series = ref<MetricSeries[]>([])
let poll: ReturnType<typeof setInterval> | null = null

async function loadSeries() {
  if (!selected.value) return
  try {
    series.value = await api.deviceMetrics(selected.value, 'cpu,memory')
  } catch (e) {
    console.error('metrics load failed', e)
  }
}

watch(selected, loadSeries)

useEChart((c) => {
  const cpu = series.value.find((s) => s.metric === 'cpu')
  const mem = series.value.find((s) => s.metric === 'memory')
  const fmt = (p: [string, number][]) =>
    p.map(([t]) => `${new Date(t).getHours()}:${String(new Date(t).getMinutes()).padStart(2, '0')}`)
  c.setOption({
    ...baseOption(),
    legend: { data: ['CPU', '内存'], top: 0, right: 0, textStyle: { color: CHART.text, fontSize: 11 } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: fmt(cpu?.points ?? []), ...axisStyle },
    yAxis: { type: 'value', max: 100, ...axisStyle },
    series: [
      { name: 'CPU', type: 'line', smooth: true, data: (cpu?.points ?? []).map(([, v]) => v),
        lineStyle: { color: CHART.accent }, itemStyle: { color: CHART.accent }, areaStyle: { opacity: 0.1 } },
      { name: '内存', type: 'line', smooth: true, data: (mem?.points ?? []).map(([, v]) => v),
        lineStyle: { color: CHART.purple }, itemStyle: { color: CHART.purple }, areaStyle: { opacity: 0.08 } },
    ],
  }, true)
}, series)

onMounted(() => {
  selected.value = withMetrics.value[0]?.id ?? ''
  loadSeries()
  poll = setInterval(loadSeries, 30000)
})
onUnmounted(() => { if (poll) clearInterval(poll) })
</script>

<template>
  <div class="perf">
    <select v-model="selected" class="dev-select">
      <option v-for="d in withMetrics" :key="d.id" :value="d.id">{{ d.name }}</option>
    </select>
    <div class="chart chart-sm" ref="chart"></div>
  </div>
</template>

<style scoped>
.perf { display: flex; flex-direction: column; gap: 8px; }
.dev-select {
  width: 100%; padding: 6px 10px; font-size: 12px; color: var(--text);
  background: rgba(8, 16, 32, 0.8); border: 1px solid var(--border); border-radius: 6px; outline: none;
}
.chart-sm { height: 115px; }
</style>
