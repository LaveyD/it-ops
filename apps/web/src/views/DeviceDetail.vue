<script setup lang="ts">
// 设备详情页 /devices/:id — 元信息 + 指标 2×2 大图（WS 增量）+ 告警列表（可确认）+ 拓扑关联 + 运维动作
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../store/auth'
import MetricPanel from '../components/MetricPanel.vue'
import { useFeed } from '../composables/useWs'
import { wsStatus } from '../composables/useWs'
import type { DeviceDetail as Detail, Alert } from '../types'

const route = useRoute()
const auth = useAuthStore()
const isViewer = computed(() => auth.role === 'viewer')
const id = computed(() => route.params.id as string)
const device = ref<Detail | null>(null)
const alerts = ref<Alert[]>([])
const rangeH = ref(6)
const metricTick = ref(0)   // 该设备有新指标 → 所有面板重拉
const actionMsg = ref('')
const ackedFlash = ref<number | null>(null)

const METRICS = ['cpu', 'memory', 'net_in', 'net_out'] as const
const statusText: Record<string, string> = { normal: '正常', warn: '警告', alert: '严重' }
const timeAgo = (iso: string) => {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return m + ' 分钟前'
  const h = Math.floor(m / 60)
  if (h < 24) return h + ' 小时前'
  return Math.floor(h / 24) + ' 天前'
}

async function load() {
  try {
    device.value = await api.device(id.value)
  } catch (e) { console.error(e) }
  try {
    alerts.value = await api.alerts({ device_id: id.value, limit: '50' })
  } catch (e) { console.error(e) }
}

async function ack(a: Alert) {
  try {
    await api.ackAlert(a.id)
    a.acked = true
    ackedFlash.value = a.id
    setTimeout(() => { if (ackedFlash.value === a.id) ackedFlash.value = null }, 1500)
  } catch (e) { console.error(e) }
}

async function doAction(action: string) {
  actionMsg.value = ''
  try {
    await api.deviceAction(id.value, action)
    actionMsg.value = '操作已执行'
  } catch (e: any) {
    actionMsg.value = e?.message || '操作失败'
  }
  // 动作结果会以 [action] 告警入库，刷新列表
  setTimeout(() => { load(); actionMsg.value = '' }, 1200)
}

// WS：该设备有新指标（TOP10 出现）→ 重拉曲线；重连 → 全量补拉
let offFeed: (() => void) | null = null
onMounted(() => {
  auth.ensureMe()
  load()
  offFeed = useFeed((m) => {
    if (m.type === '__resync') { load(); return }
    if (m.type === 'feed_update' && m.top?.items?.some((i: any) => i.device_id === id.value)) metricTick.value++
  })
})
onUnmounted(() => offFeed?.())
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="logo">IT 运维<span>大屏</span></div>
      <div class="nav">
        <router-link to="/dashboard">总览</router-link>
        <router-link to="/topology" v-if="!isViewer">拓扑编辑</router-link>
        <a class="active">设备详情</a>
      </div>
      <div class="stat-chip ws-chip" :class="wsStatus">
        <span class="ws-dot"></span>{{ wsStatus === 'open' ? '实时' : wsStatus === 'connecting' ? '连接中' : '离线' }}
      </div>
      <div class="clock"><router-link to="/" class="back">← 返回总览</router-link></div>
    </header>

    <div v-if="!device" class="loading">加载中…</div>
    <div v-else class="content">
      <!-- 元信息 -->
      <section class="sec">
        <div class="head">
          <h1>{{ device.name }}
            <span class="tag" :class="'s-' + device.status">{{ statusText[device.status] }}</span>
          </h1>
          <div class="meta">
            <span>ID <b>{{ device.id }}</b></span>
            <span>类型 <b>{{ device.type }}</b></span>
            <span v-if="device.ip">IP <b>{{ device.ip }}</b></span>
            <span>机房 <b>{{ device.location || '—' }}</b></span>
            <span v-if="device.owner">责任人 <b>{{ device.owner }}</b></span>
          </div>
          <div v-if="device.referenced_by?.length" class="refs">
            拓扑关联：
            <router-link
              v-for="r in device.referenced_by" :key="r.topology_id + '-' + r.node_id"
              v-show="!isViewer"
              class="ref-chip" :to="`/topology?node=${encodeURIComponent(r.node_id)}`"
              :title="'在编辑器中查看节点 ' + r.node_label">
              {{ r.topology_name }} · {{ r.node_label }} →
            </router-link>
          </div>
        </div>
      </section>

      <!-- 指标大图 2×2 -->
      <section class="sec">
        <div class="sec-head">
          <h2>指标（近 {{ rangeH }}h）</h2>
          <div class="ranges">
            <button v-for="h in [1, 6, 24]" :key="h" :class="{ on: rangeH === h }" @click="rangeH = h">
              近 {{ h }}h
            </button>
          </div>
        </div>
        <div class="grid2">
          <MetricPanel v-for="m in METRICS" :key="m" :device-id="device.id" :metric="m"
                       :range-h="rangeH" :tick="metricTick" />
        </div>
      </section>

      <!-- 最近告警 -->
      <section class="sec">
        <div class="sec-head"><h2>最近告警（{{ alerts.length }}）</h2></div>
        <p v-if="!alerts.length" class="dim">暂无告警</p>
        <div v-for="a in alerts" :key="a.id" class="al" :class="a.level">
          <span class="lv" :class="a.level">{{ { info: '提示', warn: '警告', crit: '严重' }[a.level] }}</span>
          <div class="al-info">
            <div class="al-title">{{ a.title }}</div>
            <div v-if="a.detail" class="al-detail">{{ a.detail }}</div>
            <div class="al-sub">{{ timeAgo(a.created_at) }}<span v-if="a.acked" class="ok"> · 已确认</span></div>
          </div>
          <span v-if="ackedFlash === a.id" class="ok flash">已确认</span>
          <button v-else-if="!a.acked" class="ack" @click="ack(a)">确认</button>
        </div>
      </section>

      <!-- 运维动作 -->
      <section class="sec">
        <div class="sec-head"><h2>运维动作</h2></div>
        <div class="ops">
          <button class="op" @click="doAction('ping')">Ping 探测</button>
          <button class="op" @click="doAction('restart')">重启服务</button>
          <button class="op" @click="doAction('reboot')">重启设备</button>
        </div>
        <p v-if="actionMsg" class="dim note">{{ actionMsg }}</p>
        <p class="dim note">本期 operator 未接入（OPERATOR=none），动作调用将返回 501 提示。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
.content { flex: 1; overflow-y: auto; padding: 18px 24px 40px; max-width: 1500px; width: 100%; margin: 0 auto; }
.loading { padding: 60px; color: var(--text-dim); }
.topbar .back { color: var(--text-dim); }
.topbar .back:hover { color: var(--text); }
.topbar .nav .active { color: var(--text); background: rgba(47,123,255,.12); }

.sec {
  background: var(--card); border: 1px solid var(--border); border-radius: 12px;
  padding: 14px 18px; margin-bottom: 14px;
}
.head h1 { font-size: 20px; font-weight: 700; }
.tag { font-size: 12px; padding: 2px 12px; border-radius: 999px; vertical-align: 3px; margin-left: 8px; }
.tag.s-normal { background: rgba(34, 197, 94, .15); color: var(--ok); }
.tag.s-warn { background: rgba(250, 173, 20, .15); color: var(--warn); }
.tag.s-alert { background: rgba(255, 77, 79, .15); color: var(--crit); }
.meta { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 10px; color: var(--text-dim); font-size: 13px; }
.meta b { color: var(--text); font-weight: 600; }
.refs { margin-top: 10px; font-size: 13px; color: var(--text-dim); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ref-chip {
  padding: 3px 10px; border-radius: 6px; font-size: 12px;
  background: rgba(47,123,255,.12); border: 1px solid rgba(47,123,255,.3); color: var(--accent);
}
.ref-chip:hover { background: rgba(47,123,255,.22); }

.sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.sec-head h2 { font-size: 15px; font-weight: 600; }
.ranges { display: flex; gap: 6px; }
.ranges button {
  padding: 4px 12px; font-size: 12px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--border); background: none; color: var(--text-dim);
}
.ranges button.on { background: rgba(47,123,255,.15); border-color: var(--accent); color: var(--text); }

.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.al {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px; margin-bottom: 8px;
  border-radius: 8px; background: rgba(20,34,60,.4);
}
.al.crit { border-left: 3px solid var(--crit); } .al.warn { border-left: 3px solid var(--warn); } .al.info { border-left: 3px solid var(--accent); }
.lv { flex-shrink: 0; font-size: 10px; padding: 2px 6px; border-radius: 5px; }
.lv.info { color: var(--accent); background: rgba(47,123,255,.15); }
.lv.warn { color: var(--warn); background: rgba(250,173,20,.15); }
.lv.crit { color: var(--crit); background: rgba(255,77,79,.15); }
.al-info { flex: 1; min-width: 0; }
.al-title { font-size: 13px; color: var(--text); }
.al-detail { font-size: 12px; color: var(--text-dim); margin-top: 2px; }
.al-sub { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
.ok { color: var(--ok); }
.ok.flash { color: var(--ok); font-size: 12px; }
.ack { flex-shrink: 0; padding: 4px 12px; font-size: 11px; border-radius: 6px; border: 1px solid var(--border); background: none; color: var(--text); cursor: pointer; }
.ack:hover { border-color: var(--accent); color: var(--accent); }

.ops { display: flex; gap: 10px; flex-wrap: wrap; }
.op {
  padding: 10px 22px; border-radius: 8px; cursor: pointer; font-size: 13px;
  border: 1px solid var(--border); background: rgba(20,34,60,.4); color: var(--text);
}
.op:hover { border-color: var(--accent); color: var(--accent); }
.dim { color: var(--text-dim); font-size: 12px; }
.note { margin-top: 8px; }
</style>
