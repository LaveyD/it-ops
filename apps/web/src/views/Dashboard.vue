<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
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
import GraphView from '../components/topology/GraphView.vue'
import DeviceDrawer from '../components/topology/DeviceDrawer.vue'
import { wsStatus } from '../composables/useWs'

const router = useRouter()
const overview = ref<Overview | null>(null)
const devices = ref<Device[]>([])
const now = ref(new Date())
let clockTimer: ReturnType<typeof setInterval> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

// 设备抽屉（统一穿透入口）
const gv = ref<InstanceType<typeof GraphView> | null>(null)
const drawer = ref({ open: false, deviceId: null as string | null, nodeId: '' })
function openDevice(deviceId: string | null, nodeId: string) {
  drawer.value = { open: true, deviceId, nodeId }
}
function gotoEditor(nodeId: string) {
  drawer.value.open = false
  router.push({ path: '/editor', query: { node: nodeId } })
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
  clockTimer = setInterval(() => (now.value = new Date()), 1000)
  pollTimer = setInterval(load, 30000)
})
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="stage-wrap" v-if="overview">
    <div class="stage">
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
        <div class="stat-chip ws-chip" :class="wsStatus">
          <span class="ws-dot"></span>{{ wsStatus === 'open' ? '实时' : wsStatus === 'connecting' ? '连接中' : '离线' }}
        </div>
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

      <!-- 中：拓扑（GraphView 只读 + 四态渲染 + 点击穿透） -->
      <div class="center">
        <div class="topo-head">
          <b>网络拓扑</b>
          <span class="dim" v-if="overview.topology">{{ overview.topology.name }} v{{ overview.topology.version }} · 点击节点查看设备</span>
        </div>
        <div class="topo-canvas">
          <GraphView ref="gv" @open-device="openDevice" />
        </div>
      </div>

      <!-- 右列 -->
      <div class="col">
        <ChartCard title="实时告警" extra="4s 滚动">
          <AlertFeedCard @open-device="(id) => openDevice(id, '')" />
        </ChartCard>
        <ChartCard title="CPU TOP 10" extra="近 24h">
          <TopNCard @open-device="(id) => openDevice(id, '')" />
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

    <!-- 设备抽屉（穿透入口，fixed 相对视口；必须在 transform 的 .stage 之外）-->
    <DeviceDrawer
      :device-id="drawer.deviceId"
      :node-id="drawer.nodeId"
      :node-label="drawer.nodeId ? (gv?.nodeLabelById(drawer.nodeId) || '') : ''"
      :open="drawer.open"
      @close="drawer.open = false"
      @goto-editor="gotoEditor"
    />
  </div>
  <div v-else class="stage-wrap"><p class="loading">加载数据中…</p></div>
</template>

<style scoped>
/* 流式布局：宽度跟随视口，内容超高时整页滚动（不再 scale，避免 canvas 被 GPU 缩放模糊 + 两侧留白） */
.stage-wrap {
  width: 100vw; height: 100vh; overflow-y: auto; overflow-x: hidden;
}
.stage {
  width: 100%; min-height: 100%;
  display: flex; flex-direction: column;
  background: radial-gradient(1400px 700px at 70% -10%, #14264a 0%, var(--bg) 55%);
}
.loading { padding: 40px; color: var(--text-dim); }
</style>
