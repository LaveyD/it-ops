<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from '../api'
import type { Device, Overview } from '../types'
import ChartCard from '../components/ChartCard.vue'
import DevicePieCard from '../components/cards/DevicePieCard.vue'
import PerfTrendCard from '../components/cards/PerfTrendCard.vue'
import BizListCard from '../components/cards/BizListCard.vue'
import AlertBarsCard from '../components/cards/AlertBarsCard.vue'
import AlertFeedCard from '../components/cards/AlertFeedCard.vue'
import TopNCard from '../components/cards/TopNCard.vue'
import LocationCard from '../components/cards/LocationCard.vue'
import OnDutyCard from '../components/cards/OnDutyCard.vue'

const overview = ref<Overview | null>(null)
const devices = ref<Device[]>([])
const now = ref(new Date())
const scale = ref(1)
let clockTimer: ReturnType<typeof setInterval> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let onResize: (() => void) | null = null

// 大屏 scale-to-fit：固定 1920×1080 画布，按视口等比缩放居中（非 16:9 留黑边）
function fit() {
  scale.value = Math.min(innerWidth / 1920, innerHeight / 1080)
}

async function load() {
  try {
    const [o, d] = await Promise.all([api.overview(), api.devices()])
    overview.value = o
    devices.value = d
  } catch (e) {
    console.error('dashboard load failed', e)
  }
}

onMounted(() => {
  load()
  fit()
  onResize = fit
  window.addEventListener('resize', onResize)
  clockTimer = setInterval(() => (now.value = new Date()), 1000)
  pollTimer = setInterval(load, 30000)
})
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  if (pollTimer) clearInterval(pollTimer)
  if (onResize) window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="stage-wrap" v-if="overview">
    <div class="stage" :style="{ transform: `scale(${scale})` }">
      <header class="topbar">
        <div class="logo">IT 运维<span>大屏</span></div>
        <div class="nav">
          <router-link to="/" class="active">总览</router-link>
          <router-link to="/editor">拓扑编辑</router-link>
        </div>
        <div class="stat-chip">设备在线率 <b>{{ (overview.online_rate * 100).toFixed(1) }}%</b></div>
        <div class="stat-chip alert-chip" v-if="overview.unacked_alerts">
          未确认告警 <b>{{ overview.unacked_alerts }}</b>
        </div>
        <div class="stat-chip" v-if="overview.topology">拓扑 v{{ overview.topology.version }}</div>
        <div class="clock">{{ now.toLocaleDateString('zh-CN') }} {{ now.toLocaleTimeString('zh-CN') }}</div>
      </header>

    <div class="dash-body">
      <!-- 左列 -->
      <div class="col">
        <ChartCard title="设备状态分布" :time="`${overview.device_count} 台`">
          <DevicePieCard :devices="devices" />
        </ChartCard>
        <ChartCard title="性能趋势" extra="近 6 小时">
          <PerfTrendCard :devices="devices" />
        </ChartCard>
        <ChartCard title="业务系统概览" :time="`${overview.biz_systems.length} 个`">
          <BizListCard :systems="overview.biz_systems" />
        </ChartCard>
        <ChartCard title="告警等级统计" extra="近 7 天">
          <AlertBarsCard />
        </ChartCard>
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
        <ChartCard title="实时告警" extra="4s 滚动">
          <AlertFeedCard />
        </ChartCard>
        <ChartCard title="CPU TOP 10" extra="近 24h">
          <TopNCard />
        </ChartCard>
        <ChartCard title="机房分布">
          <LocationCard :devices="devices" />
        </ChartCard>
        <ChartCard title="值班信息">
          <OnDutyCard />
        </ChartCard>
      </div>
    </div>
    </div>
  </div>
  <div v-else class="stage-wrap"><p class="loading">加载数据中…</p></div>
</template>

<style scoped>
/* scale-to-fit：外层铺满视口居中，内层固定 1920×1080 画布等比缩放 */
.stage-wrap {
  width: 100vw; height: 100vh; overflow: hidden;
  display: flex; align-items: center; justify-content: center; background: var(--bg);
}
.stage {
  width: 1920px; height: 1080px; flex-shrink: 0;
  transform-origin: center center;
  display: grid; grid-template-rows: 56px 1fr;
  background: radial-gradient(1400px 700px at 70% -10%, #14264a 0%, var(--bg) 55%);
}
.loading { padding: 40px; color: var(--text-dim); }
</style>
