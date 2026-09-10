<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from '../../api'
import type { AlertDailyCount } from '../../types'
import { useEChart } from '../../composables/useEChart'
import { CHART, LEVEL_COLOR, baseOption, axisStyle } from '../../echarts/theme'

const data = ref<AlertDailyCount[]>([])

useEChart((c) => {
  c.setOption({
    ...baseOption(),
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, textStyle: { color: CHART.text, fontSize: 11 }, itemWidth: 10 },
    xAxis: { type: 'category', data: data.value.map((d) => d.date.slice(5)), ...axisStyle },
    yAxis: { type: 'value', minInterval: 1, ...axisStyle },
    series: [
      { name: '严重', type: 'bar', stack: 'a', barWidth: 16, data: data.value.map((d) => d.crit), itemStyle: { color: LEVEL_COLOR.crit } },
      { name: '警告', type: 'bar', stack: 'a', data: data.value.map((d) => d.warn), itemStyle: { color: LEVEL_COLOR.warn } },
      { name: '提示', type: 'bar', stack: 'a', data: data.value.map((d) => d.info), itemStyle: { color: LEVEL_COLOR.info } },
    ],
  }, true)
}, data)

onMounted(async () => {
  try { data.value = await api.alertStats(7) } catch (e) { console.error(e) }
})
onUnmounted(() => { /* 轮询由父级刷新 */ })
</script>

<template>
  <div class="chart bars" ref="chart"></div>
</template>

<style scoped>
.bars { height: 145px; }
</style>
