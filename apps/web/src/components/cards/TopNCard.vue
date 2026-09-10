<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from '../../api'
import type { DeviceTopItem } from '../../types'
import { useEChart } from '../../composables/useEChart'
import { CHART, baseOption, axisStyle } from '../../echarts/theme'

const data = ref<DeviceTopItem[]>([])
const emit = defineEmits<{ (e: 'open-device', deviceId: string): void }>()

useEChart((c) => {
  // ECharts 横向条形：最上为最大值
  const items = [...data.value].reverse()
  c.setOption({
    ...baseOption(),
    grid: { left: 8, right: 34, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', max: 100, ...axisStyle },
    yAxis: { type: 'category', data: items.map((d) => d.name), ...axisStyle },
    series: [{
      type: 'bar', barWidth: 10,
      data: items.map((d) => ({
        value: d.value,
        itemStyle: { color: d.value >= 80 ? CHART.crit : d.value >= 60 ? CHART.warn : CHART.accent, borderRadius: [0, 5, 5, 0] },
      })),
      label: { show: true, position: 'right', color: CHART.text, fontSize: 10, formatter: '{c}%' },
    }],
  }, true)
  // 点击条目 → 打开设备抽屉
  c.off('click')
  c.on('click', (p) => {
    const d = data.value[data.value.length - 1 - p.dataIndex]
    if (d) emit('open-device', d.device_id)
  })
}, data)

onMounted(async () => {
  try { data.value = await api.deviceTop('cpu', 10, 24) } catch (e) { console.error(e) }
})
onUnmounted(() => { /* 轮询由父级刷新 */ })
</script>

<template>
  <div class="chart chart-lg" ref="chart"></div>
</template>

<style scoped>
.chart-lg { height: 160px; }
</style>
