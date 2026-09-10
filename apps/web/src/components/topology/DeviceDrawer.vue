<script setup lang="ts">
// @ts-nocheck
import { computed, ref, watch } from 'vue'
import { api } from '../../api'
import { useEChart } from '../../composables/useEChart'
import { CHART, baseOption, axisStyle, STATUS_COLOR } from '../../echarts/theme'
import type { DeviceDetail, MetricSeries } from '../../types'

const props = defineProps<{
  deviceId: string | null   // null = 未纳管空态
  nodeId: string
  nodeLabel: string
  open: boolean
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'goto-editor', nodeId: string): void
}>()

const detail = ref<DeviceDetail | null>(null)
const loading = ref(false)
const tab = ref<'overview' | 'metrics' | 'alerts' | 'actions'>('overview')
const alertList = ref<any[]>([])
const ackMsg = ref('')

const metric = ref('cpu')
const rangeH = ref(6)
const series = ref<MetricSeries[]>([])
const metricsLoading = ref(false)

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
  if (!props.deviceId) return
  loading.value = true
  try {
    detail.value = await api.device(props.deviceId)
    const alerts = await api.alerts({ device_id: props.deviceId, limit: '50' })
    alertList.value = alerts
  } catch (e) { console.error(e) }
  loading.value = false
}

async function loadMetrics() {
  if (!props.deviceId) return
  metricsLoading.value = true
  try {
    const to = new Date().toISOString()
    const from = new Date(Date.now() - rangeH.value * 3600e3).toISOString()
    const [cpu, mem] = await Promise.all([
      api.deviceMetrics(props.deviceId, metric.value, from, to),
      api.deviceMetrics(props.deviceId, 'memory', from, to),
    ])
    series.value = [cpu, mem]
  } catch (e) { console.error(e) }
  metricsLoading.value = false
}

async function ack(id: number) {
  try {
    await api.ackAlert(id)
    ackMsg.value = '已确认'
    setTimeout(() => { ackMsg.value = '' }, 2000)
    load()
  } catch (e) { console.error(e) }
}

useEChart((c) => {
  if (tab.value !== 'metrics') return
  const pts = (s?: MetricSeries) => (s ? s.points : [])
  const base = baseOption()
  c.setOption({
    ...base,
    grid: { left: 8, right: 12, top: 24, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { color: CHART.text, fontSize: 11 }, itemWidth: 14 },
    xAxis: { type: 'category', boundaryGap: false, data: pts(series.value[0]).map((p) => new Date(p[0]).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })), ...axisStyle },
    yAxis: { type: 'value', ...axisStyle },
    series: [
      { name: 'CPU', type: 'line', smooth: true, showSymbol: false, lineStyle: { color: CHART.accent, width: 2 }, itemStyle: { color: CHART.accent }, data: pts(series.value[0]).map((p) => p[1]) },
      { name: '内存', type: 'line', smooth: true, showSymbol: false, lineStyle: { color: CHART.ok, width: 2 }, itemStyle: { color: CHART.ok }, data: pts(series.value[1]).map((p) => p[1]) },
    ],
  }, true)
}, [series, tab, metric, rangeH])

watch(() => props.open, (v) => {
  if (v) { tab.value = 'overview'; ackMsg.value = ''; load(); if (props.deviceId) loadMetrics() }
})
watch(() => props.deviceId, () => { if (props.open) { load(); if (props.deviceId) loadMetrics() } })
</script>

<template>
  <div v-if="open" class="mask" @click.self="emit('close')">
    <aside class="drawer">
      <!-- 未纳管空态 -->
      <template v-if="!deviceId">
        <header class="dh">
          <div class="dh-name">{{ nodeLabel || '未关联节点' }}
            <span class="dot s-unmanaged"></span>
          </div>
          <button class="x" @click="emit('close')">✕</button>
        </header>
        <div class="body empty">
          <p class="empty-t">该节点未关联设备</p>
          <p class="empty-d">拓扑节点「{{ nodeLabel }}」还没有绑定运维设备，无法查看状态与指标。</p>
          <button class="btn primary" @click="emit('goto-editor', nodeId)">去编辑器关联</button>
        </div>
      </template>

      <!-- 已纳管设备 -->
      <template v-else>
        <header class="dh">
          <div class="dh-name">{{ detail?.name || deviceId }}
            <span v-if="detail" class="dot" :class="'s-' + detail.status"></span>
          </div>
          <button class="x" @click="emit('close')">✕</button>
        </header>
        <div v-if="detail" class="meta">
          <div class="meta-row">状态 <b :class="'s-' + detail.status">{{ statusText[detail.status] }}</b></div>
          <div class="meta-row">类型 {{ detail.type }}<span v-if="detail.ip"> · IP {{ detail.ip }}</span></div>
          <div class="meta-row">机房 {{ detail.location || '—' }}<span v-if="detail.owner"> · 责任人 {{ detail.owner }}</span></div>
          <div v-if="detail.referenced_by?.length" class="meta-row ref">
            被引用：<span v-for="r in detail.referenced_by" :key="r.topology_id + r.node_id" class="ref-chip">{{ r.topology_name }} · {{ r.node_label }}</span>
          </div>
        </div>

        <nav class="tabs">
          <button v-for="t in ['overview', 'metrics', 'alerts', 'actions']" :key="t"
                  :class="{ active: tab === t }" @click="tab = t">
            {{ { overview: '概览', metrics: '指标', alerts: '告警', actions: '操作' }[t] }}
          </button>
        </nav>

        <div class="body">
          <!-- 概览 -->
          <div v-if="tab === 'overview'" class="panel">
            <p v-if="loading" class="dim">加载中…</p>
            <template v-else>
              <div class="kv" v-for="(v, k) in detail.latest_metrics" :key="k">
                <span class="k">{{ k }}</span><span class="v">{{ v }}%</span>
              </div>
              <p class="dim note">最新指标（collector 实时采集）</p>
            </template>
          </div>

          <!-- 指标 -->
          <div v-else-if="tab === 'metrics'" class="panel">
            <div class="range">
              <select v-model="metric" @change="loadMetrics">
                <option value="cpu">CPU</option><option value="memory">内存</option>
                <option value="net_in">入流量</option><option value="net_out">出流量</option>
              </select>
              <select v-model.number="rangeH" @change="loadMetrics">
                <option :value="1">近 1h</option><option :value="6">近 6h</option><option :value="24">近 24h</option>
              </select>
            </div>
            <div class="chart" ref="chart"></div>
            <p v-if="metricsLoading" class="dim">加载中…</p>
          </div>

          <!-- 告警 -->
          <div v-else-if="tab === 'alerts'" class="panel">
            <p v-if="!alertList.length" class="dim">暂无告警</p>
            <div v-for="a in alertList" :key="a.id" class="al" :class="a.level">
              <span class="lv" :class="a.level">{{ { info: '提示', warn: '警告', crit: '严重' }[a.level] }}</span>
              <div class="al-info">
                <div class="al-title">{{ a.title }}</div>
                <div class="al-sub">{{ timeAgo(a.created_at) }}<span v-if="a.acked" class="ok"> · 已确认</span></div>
              </div>
              <button v-if="!a.acked" class="ack" @click="ack(a.id)">确认</button>
            </div>
            <p v-if="ackMsg" class="ok-msg">{{ ackMsg }}</p>
          </div>

          <!-- 操作（本期占位）-->
          <div v-else class="panel">
            <button class="op" disabled title="待接入 operator">重启设备</button>
            <button class="op" disabled title="待接入 operator">隔离端口</button>
            <p class="dim note">操作能力待 M4/M5 接入 operator 后启用</p>
          </div>
        </div>

        <footer class="foot">
          <router-link class="full" :to="'/devices/' + deviceId">完整设备页 →</router-link>
        </footer>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.mask { position: fixed; inset: 0; z-index: 100; background: rgba(4, 10, 22, 0.55); display: flex; justify-content: flex-end; }
.drawer {
  width: 400px; max-width: 92vw; height: 100%; display: flex; flex-direction: column;
  background: var(--bg-2); border-left: 1px solid var(--border); box-shadow: -8px 0 30px rgba(0,0,0,.5);
}
.dh { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border); }
.dh-name { font-size: 16px; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px; }
.x { border: none; background: none; color: var(--text-dim); font-size: 16px; cursor: pointer; }
.x:hover { color: var(--text); }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot.s-normal { background: var(--ok); } .dot.s-warn { background: var(--warn); }
.dot.s-alert { background: var(--crit); } .dot.s-unmanaged { background: var(--text-dim); }
.meta { padding: 10px 16px; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text-dim); }
.meta-row { margin: 3px 0; } .meta-row b { margin-left: 4px; }
.meta-row .s-normal { color: var(--ok); } .meta-row .s-warn { color: var(--warn); } .meta-row .s-alert { color: var(--crit); }
.ref-chip { display: inline-block; margin: 2px 4px 0 0; padding: 1px 7px; border-radius: 5px; background: rgba(47,123,255,.12); color: var(--accent); font-size: 11px; }
.tabs { display: flex; gap: 2px; padding: 8px 12px 0; }
.tabs button { flex: 1; padding: 7px 0; border: none; background: none; color: var(--text-dim); cursor: pointer; border-bottom: 2px solid transparent; font-size: 13px; }
.tabs button.active { color: var(--text); border-bottom-color: var(--accent); }
.body { flex: 1; overflow-y: auto; padding: 14px 16px; }
.body.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; }
.empty-t { font-size: 15px; font-weight: 600; color: var(--text); }
.empty-d { font-size: 12px; color: var(--text-dim); line-height: 1.7; max-width: 280px; }
.btn { padding: 8px 18px; border-radius: 8px; border: 1px solid var(--border); background: none; color: var(--text); cursor: pointer; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.kv { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed var(--border); font-size: 13px; }
.kv .k { color: var(--text-dim); } .kv .v { color: var(--text); font-weight: 600; }
.note { margin-top: 10px; } .dim { color: var(--text-dim); font-size: 12px; }
.range { display: flex; gap: 8px; margin-bottom: 8px; }
.range select { flex: 1; padding: 5px 8px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; }
.chart { width: 100%; height: 240px; }
.al { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; background: rgba(20,34,60,.4); margin-bottom: 8px; }
.al.crit { border-left: 3px solid var(--crit); } .al.warn { border-left: 3px solid var(--warn); } .al.info { border-left: 3px solid var(--accent); }
.lv { flex-shrink: 0; font-size: 10px; padding: 2px 6px; border-radius: 5px; }
.lv.info { color: var(--accent); background: rgba(47,123,255,.15); } .lv.warn { color: var(--warn); background: rgba(250,173,20,.15); } .lv.crit { color: var(--crit); background: rgba(255,77,79,.15); }
.al-info { flex: 1; min-width: 0; } .al-title { font-size: 13px; color: var(--text); } .al-sub { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
.ok { color: var(--ok); }
.ack { flex-shrink: 0; padding: 4px 10px; font-size: 11px; border-radius: 6px; border: 1px solid var(--border); background: none; color: var(--text); cursor: pointer; }
.ack:hover { border-color: var(--accent); color: var(--accent); }
.ok-msg { color: var(--ok); font-size: 12px; }
.op { width: 100%; padding: 12px; margin-bottom: 10px; border-radius: 8px; border: 1px solid var(--border); background: rgba(20,34,60,.4); color: var(--text-dim); cursor: not-allowed; }
.foot { padding: 12px 16px; border-top: 1px solid var(--border); }
.full { display: block; text-align: center; padding: 9px; border-radius: 8px; border: 1px solid var(--border); color: var(--accent); text-decoration: none; }
.full:hover { background: rgba(47,123,255,.1); }
</style>
