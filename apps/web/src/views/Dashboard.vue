<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../store/auth'
import type { Device, Overview } from '../types'
import ChartCard from '../components/ChartCard.vue'
import DevicePieCard from '../components/cards/DevicePieCard.vue'
import DevicePoolCard from '../components/cards/DevicePoolCard.vue'
import SecurityEventCard from '../components/cards/SecurityEventCard.vue'
import RoomMonitorCard from '../components/cards/RoomMonitorCard.vue'
import PerfTrendCard from '../components/cards/PerfTrendCard.vue'
import BizListCard from '../components/cards/BizListCard.vue'
import AlertBarsCard from '../components/cards/AlertBarsCard.vue'
import AlertFeedCard from '../components/cards/AlertFeedCard.vue'
import TopNCard from '../components/cards/TopNCard.vue'
import LocationCard from '../components/cards/LocationCard.vue'
import OnDutyCard from '../components/cards/OnDutyCard.vue'
import GraphView from '../components/topology/GraphView.vue'
import Topo3DEmbed from '../components/topology/Topo3DEmbed.vue'
import DeviceDrawer from '../components/topology/DeviceDrawer.vue'
import { wsStatus } from '../composables/useWs'

const router = useRouter()
const auth = useAuthStore()
const isViewer = computed(() => auth.role === 'viewer')
const overview = ref<Overview | null>(null)
const devices = ref<Device[]>([])
const now = ref(new Date())
let clockTimer: ReturnType<typeof setInterval> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

// 拓扑渲染模式：2D（GraphView）/ 3D（Topo3DEmbed），只切换中间渲染区
const topoMode = ref<'2d' | '3d'>('2d')

// 设备抽屉（统一穿透入口）
const gv = ref<InstanceType<typeof GraphView> | null>(null)
const drawer = ref({ open: false, deviceId: null as string | null, nodeId: '', nodeLabel: '' })
function openDevice(deviceId: string | null, nodeId: string, label?: string) {
  // 2D 由 GraphView 已挂载，可用 nodeLabelById 取名；3D 由组件直接传 label
  const nodeLabel = label ?? (nodeId ? (gv.value?.nodeLabelById(nodeId) || '') : '')
  drawer.value = { open: true, deviceId, nodeId, nodeLabel }
}
function gotoEditor(nodeId: string) {
  drawer.value.open = false
  router.push({ path: '/admin/network/topology', query: { node: nodeId } })
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
  auth.ensureMe()
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
          <router-link to="/dashboard" class="active">总览</router-link>
          <router-link to="/admin/network/topology" v-if="!isViewer">拓扑编辑</router-link>
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
        <ChartCard title="终端设备资产池" extra="手机/PC/笔记本">
          <DevicePoolCard />
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

      <!-- 中：拓扑（2D/3D 可切换，只换中间渲染区） -->
      <div class="center">
        <div class="topo-head">
          <b>网络拓扑</b>
          <span class="dim" v-if="overview.topology">{{ overview.topology.name }} v{{ overview.topology.version }} · 点击节点查看设备</span>
          <span class="topo-mode">
            <button :class="{ on: topoMode === '2d' }" @click="topoMode = '2d'">2D</button>
            <button :class="{ on: topoMode === '3d' }" @click="topoMode = '3d'">3D</button>
          </span>
        </div>
        <div class="topo-canvas">
          <GraphView v-if="topoMode === '2d'" ref="gv" hide-labels :fit-top-ratio="0.28" @open-device="openDevice" />
          <Topo3DEmbed v-else hide-labels @open-device="(id, nid, lb) => openDevice(id, nid, lb)" />
        </div>
      </div>

      <!-- 右列 -->
      <div class="col">
        <ChartCard title="实时告警" extra="4s 滚动">
          <AlertFeedCard @open-device="(id) => openDevice(id, '')" />
        </ChartCard>
        <ChartCard title="安防异常事件" extra="实时">
          <SecurityEventCard />
        </ChartCard>
        <ChartCard title="机房环境监测" extra="实时">
          <RoomMonitorCard />
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
      :node-label="drawer.nodeLabel"
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
/* 拓扑 2D/3D 模式切换（在 .topo-head 内） */
.topo-mode { display: inline-flex; gap: 2px; margin-left: 6px; padding: 2px; border: 1px solid var(--border); border-radius: 6px; }
.topo-mode button {
  border: none; background: none; cursor: pointer; padding: 2px 10px;
  border-radius: 5px; font-size: 12px; color: var(--text-dim); line-height: 1.4;
}
.topo-mode button:hover { color: var(--text); }
.topo-mode button.on { background: var(--accent); color: #fff; }
</style>
