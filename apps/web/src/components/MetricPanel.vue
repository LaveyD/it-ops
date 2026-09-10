<script setup lang="ts">
// 单指标曲线面板（设备详情页 2×2 大图用；useEChart 绑定固定 ref 名 'chart'，
// 所以每个面板独立一个组件实例）
import { onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { useEChart } from '../composables/useEChart'
import { CHART, baseOption, axisStyle } from '../echarts/theme'
import type { MetricSeries } from '../types'

const props = defineProps<{
  deviceId: string
  metric: string
  rangeH: number
  tick?: number   // 变化即重拉（WS feed_update / __resync 驱动）
}>()

const LABELS: Record<string, string> = {
  cpu: 'CPU 使用率', memory: '内存使用率', net_in: '入流量', net_out: '出流量',
}
const series = ref<MetricSeries | null>(null)

async function load() {
  const to = new Date().toISOString()
  const from = new Date(Date.now() - props.rangeH * 3600e3).toISOString()
  try {
    const arr = await api.deviceMetrics(props.deviceId, props.metric, from, to)
    series.value = arr[0] ?? null
  } catch (e) { console.error('metrics load failed', e) }
}

useEChart((c) => {
  const pts = series.value?.points ?? []
  const fmt = (t: string) => {
    const d = new Date(t)
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')
  }
  c.setOption({
    ...baseOption(),
    grid: { left: 8, right: 12, top: 28, bottom: 6, containLabel: true },
    title: { text: LABELS[props.metric] ?? props.metric, left: 0, top: 0,
             textStyle: { color: CHART.text, fontSize: 12, fontWeight: 600 } },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,27,48,0.94)',
      borderColor: 'rgba(90,130,200,0.4)',
      textStyle: { color: '#d7e3f4', fontSize: 12 },
      formatter: (ps: any) => {
        const p = Array.isArray(ps) ? ps[0] : ps
        if (!p) return ''
        return new Date(pts[p.dataIndex][0]).toLocaleString('zh-CN') + '<br/>' + p.value
      },
    },
    xAxis: { type: 'category', boundaryGap: false, data: pts.map(([t]) => fmt(t)), ...axisStyle },
    yAxis: { type: 'value', ...axisStyle },
    series: [{
      type: 'line', smooth: true, showSymbol: false,
      data: pts.map(([, v]) => v),
      lineStyle: { color: CHART.accent, width: 2 }, itemStyle: { color: CHART.accent },
      areaStyle: { opacity: 0.08 },
    }],
  }, true)
  // getter 返回数组：任一依赖（数据/时间窗/WS tick）变化即重绘
}, () => [series.value, props.rangeH, props.tick])

onMounted(load)
watch(() => [props.rangeH, props.tick], load)
</script>

<template>
  <div class="mp">
    <div class="chart" ref="chart"></div>
  </div>
</template>

<style scoped>
.mp {
  background: var(--card); border: 1px solid var(--border); border-radius: 10px;
  padding: 8px 10px 4px;
}
.chart { width: 100%; height: 210px; }
</style>
