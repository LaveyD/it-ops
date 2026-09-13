<script setup lang="ts">
import { computed } from 'vue'
import type { Device } from '../../types'
import { useEChart } from '../../composables/useEChart'
import { CHART, STATUS_COLOR, baseOption } from '../../echarts/theme'

const props = defineProps<{ devices: Device[] }>()

const dist = computed(() => {
  const c: Record<string, number> = { normal: 0, warn: 0, alert: 0 }
  for (const d of props.devices) c[d.status] = (c[d.status] || 0) + 1
  return c
})

useEChart((c) => {
  const d = dist.value
  const data = [
    { value: d.normal, name: '正常', itemStyle: { color: STATUS_COLOR.normal } },
    { value: d.warn, name: '警告', itemStyle: { color: STATUS_COLOR.warn } },
    { value: d.alert, name: '严重', itemStyle: { color: STATUS_COLOR.alert } },
  ]
  c.setOption({
    ...baseOption(),
    legend: {
      bottom: 0, textStyle: { color: CHART.text, fontSize: 11 }, itemWidth: 10,
      // 图例追加数值（标签已关闭，数值在图例呈现，避免压图例）
      formatter: (name: string) => `${name}  ${data.find((x) => x.name === name)?.value ?? 0}`,
    },
    series: [{
      type: 'pie', radius: ['52%', '74%'], center: ['50%', '44%'],
      // 卡片仅 125px 高，外层 label 会与底部图例重叠
      label: { show: false },
      labelLine: { show: false },
      emphasis: { label: { show: false } },
      data,
    }],
  }, true)
}, dist)
</script>

<template>
  <div class="chart pie" ref="chart"></div>
</template>

<style scoped>
.pie { height: 125px; }
</style>
