<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from 'vue'
import * as echarts from 'echarts'
import { api } from '../api'
import type { Overview } from '../types'

const overview = ref<Overview | null>(null)
const now = ref(new Date())
const clockTimer = setInterval(() => (now.value = new Date()), 1000)

// ECharts 容器
const pieEl = shallowRef<HTMLElement>()
const barEl = shallowRef<HTMLElement>()
const lineEl = shallowRef<HTMLElement>()
const charts: echarts.ECharts[] = []
let pollTimer: ReturnType<typeof setInterval> | null = null
let cleanup: (() => void) | null = null
const darkText = '#7d93b2'
const okColor = '#22c55e'
const warnColor = '#faad14'
const critColor = '#ff4d4f'
const accentColor = '#2f7bff'

function baseOption(): echarts.EChartsCoreOption {
  return {
    backgroundColor: 'transparent',
    textStyle: { color: darkText },
    grid: { left: 34, right: 12, top: 24, bottom: 22 },
    tooltip: { trigger: 'item' },
  }
}

function renderPie() {
  if (!pieEl.value || !overview.value) return
  const c = echarts.init(pieEl.value)
  charts.push(c)
  c.setOption({
    ...baseOption(),
    legend: { bottom: 0, textStyle: { color: darkText, fontSize: 11 }, itemWidth: 10 },
    series: [{
      type: 'pie', radius: ['52%', '74%'], center: ['50%', '44%'],
      label: { color: darkText, fontSize: 11, formatter: '{b}: {c}' },
      data: [
        { value: overview.value.device_count - countAbnormal(), name: '正常', itemStyle: { color: okColor } },
        { value: overview.value.alert_counts.warn, name: '警告', itemStyle: { color: warnColor } },
        { value: overview.value.alert_counts.crit, name: '严重', itemStyle: { color: critColor } },
      ],
    }],
  })
}

function countAbnormal() {
  if (!overview.value) return 0
  const a = overview.value.alert_counts
  return a.warn + a.crit
}

function renderBar() {
  if (!barEl.value || !overview.value) return
  const c = echarts.init(barEl.value)
  charts.push(c)
  const a = overview.value.alert_counts
  c.setOption({
    ...baseOption(),
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: ['info', 'warn', 'crit'], axisLabel: { color: darkText } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(90,130,200,0.15)' } }, axisLabel: { color: darkText } },
    series: [{
      type: 'bar', barWidth: 26,
      data: [
        { value: a.info, itemStyle: { color: accentColor } },
        { value: a.warn, itemStyle: { color: warnColor } },
        { value: a.crit, itemStyle: { color: critColor } },
      ],
      label: { show: true, position: 'top', color: darkText },
    }],
  })
}

function renderLine() {
  if (!lineEl.value) return
  const c = echarts.init(lineEl.value)
  charts.push(c)
  // mock 趋势（M2 接 /api/devices/{id}/metrics）
  const ts: string[] = []
  const v1: number[] = []
  const v2: number[] = []
  let a = 45, b = 60
  for (let i = 23; i >= 0; i--) {
    const d = new Date(Date.now() - i * 3600e3)
    ts.push(`${String(d.getHours()).padStart(2, '0')}:00`)
    a = Math.max(5, Math.min(95, a + (Math.random() - 0.5) * 14))
    b = Math.max(20, Math.min(95, b + (Math.random() - 0.5) * 8))
    v1.push(+a.toFixed(1)); v2.push(+b.toFixed(1))
  }
  c.setOption({
    ...baseOption(),
    legend: { data: ['CPU', '内存'], textStyle: { color: darkText, fontSize: 11 }, top: 0, right: 0 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: ts, axisLabel: { color: darkText, fontSize: 10, interval: 5 } },
    yAxis: { type: 'value', max: 100, splitLine: { lineStyle: { color: 'rgba(90,130,200,0.15)' } }, axisLabel: { color: darkText } },
    series: [
      { name: 'CPU', type: 'line', smooth: true, data: v1, lineStyle: { color: accentColor }, itemStyle: { color: accentColor }, areaStyle: { opacity: 0.12 } },
      { name: '内存', type: 'line', smooth: true, data: v2, lineStyle: { color: '#8b5cf6' }, itemStyle: { color: '#8b5cf6' } },
    ],
  })
}

async function load() {
  try {
    overview.value = await api.overview()
    renderPie(); renderBar(); renderLine()
  } catch (e) {
    console.error('overview load failed', e)
  }
}

onMounted(() => {
  load()
  pollTimer = setInterval(load, 30000)
  const onResize = () => charts.forEach((c) => c.resize())
  window.addEventListener('resize', onResize)
  cleanup = () => {
    if (pollTimer) clearInterval(pollTimer)
    clearInterval(clockTimer)
    window.removeEventListener('resize', onResize)
    charts.forEach((c) => c.dispose())
  }
})
onUnmounted(() => cleanup?.())
</script>

<template>
  <div class="dash" v-if="overview">
    <header class="topbar">
      <div class="logo">IT 运维<span>大屏</span></div>
      <div class="nav">
        <router-link to="/" class="active">总览</router-link>
        <router-link to="/editor">拓扑编辑</router-link>
      </div>
      <div class="stat-chip">设备在线率 <b>{{ (overview.online_rate * 100).toFixed(1) }}%</b></div>
      <div class="stat-chip">未确认告警 <b>{{ overview.unacked_alerts }}</b></div>
      <div class="stat-chip" v-if="overview.topology">拓扑 v{{ overview.topology.version }}</div>
      <div class="clock">{{ now.toLocaleDateString('zh-CN') }} {{ now.toLocaleTimeString('zh-CN') }}</div>
    </header>

    <div class="dash-body">
      <!-- 左列 -->
      <div class="col">
        <div class="card">
          <div class="head"><span class="t">设备状态分布</span><span class="time">{{ overview.device_count }} 台</span></div>
          <div class="chart" ref="pieEl"></div>
        </div>
        <div class="card">
          <div class="head"><span class="t">性能趋势（示例）</span></div>
          <div class="chart" ref="lineEl"></div>
        </div>
        <div class="card">
          <div class="head"><span class="t">业务系统</span></div>
          <ul class="biz-list">
            <li v-for="b in overview.biz_systems" :key="b.id">
              <span class="dot" :class="b.status"></span>
              <span class="name">{{ b.name }}</span>
              <span class="sla" v-if="b.sla_actual != null">{{ b.sla_actual }}%</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- 中：拓扑（M3 接 GraphView） -->
      <div class="center">
        <div class="topo-box">
          <b>网络拓扑</b>
          <p>GraphView 组件将在 M3 接入（3D 图标 + 分组 + 告警着色 + 点击穿透）</p>
          <p class="dim">当前版本：{{ overview.topology?.name }} v{{ overview.topology?.version }}</p>
        </div>
      </div>

      <!-- 右列 -->
      <div class="col">
        <div class="card">
          <div class="head"><span class="t">告警等级（未确认）</span></div>
          <div class="chart" ref="barEl"></div>
        </div>
        <div class="card">
          <div class="head"><span class="t">实时告警</span><span class="time">M4 接入 WS</span></div>
          <p class="dim" style="font-size:13px">M4 接入 WebSocket 后，告警将在此滚动展示。</p>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="dash"><p style="padding:40px;color:var(--text-dim)">加载数据中…</p></div>
</template>

<style scoped>
.biz-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
.biz-list li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.biz-list .name { flex: 1; }
.biz-list .sla { color: var(--text-dim); font-size: 12px; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot.normal { background: var(--ok); }
.dot.warn { background: var(--warn); }
.dot.alert { background: var(--crit); box-shadow: 0 0 8px var(--crit); }
.dim { color: var(--text-dim); font-size: 12px; }
.topo-box .dim { margin-top: 4px; }
</style>
