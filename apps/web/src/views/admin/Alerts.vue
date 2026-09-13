<script setup lang="ts">
// 告警中心：筛选 + 单条/批量确认 + 7 天趋势（浅色）
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../../api'
import type { Alert, AlertDailyCount, Device } from '../../types'
import { useEChart } from '../../composables/useEChart'

const LEVELS = [
  { value: 'crit', label: '严重', color: '#f56c6c' },
  { value: 'warn', label: '警告', color: '#e6a23c' },
  { value: 'info', label: '提示', color: '#409eff' },
]
const levelLabel = (l: string) => LEVELS.find((x) => x.value === l)?.label ?? l
const levelColor = (l: string) => LEVELS.find((x) => x.value === l)?.color ?? '#909399'

const alerts = ref<Alert[]>([])
const devices = ref<Device[]>([])
const stats = ref<AlertDailyCount[]>([])
const loading = ref(false)
const f = reactive({ level: '', device_id: '', unacked: false, limit: 100 })

async function load() {
  loading.value = true
  try {
    const q: Record<string, string> = { limit: String(f.limit) }
    if (f.level) q.level = f.level
    if (f.device_id) q.device_id = f.device_id
    if (f.unacked) q.unacked = '1'
    alerts.value = await api.alerts(q)
    stats.value = await api.alertStats(7)
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

// 7 天趋势（浅色 option，不走暗色 theme）
useEChart((c) => {
  c.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, textStyle: { color: '#606266', fontSize: 11 }, itemWidth: 10 },
    grid: { left: 34, right: 12, top: 16, bottom: 28 },
    xAxis: { type: 'category', data: stats.value.map((d) => d.date.slice(5)),
      axisLabel: { color: '#909399', fontSize: 10 }, axisLine: { lineStyle: { color: '#dcdfe6' } } },
    yAxis: { type: 'value', minInterval: 1,
      axisLabel: { color: '#909399', fontSize: 10 }, splitLine: { lineStyle: { color: '#ebeef5' } } },
    series: [
      { name: '严重', type: 'bar', stack: 'a', barWidth: 18, data: stats.value.map((d) => d.crit), itemStyle: { color: levelColor('crit') } },
      { name: '警告', type: 'bar', stack: 'a', data: stats.value.map((d) => d.warn), itemStyle: { color: levelColor('warn') } },
      { name: '提示', type: 'bar', stack: 'a', data: stats.value.map((d) => d.info), itemStyle: { color: levelColor('info') } },
    ],
  }, true)
}, stats)

const selected = ref<Alert[]>([])
const selectedUnacked = computed(() => selected.value.filter((a) => !a.acked))
const unackedCount = computed(() => alerts.value.filter((a) => !a.acked).length)

async function ack(a: Alert) {
  try {
    await api.ackAlert(a.id)
    a.acked = true
    ElMessage.success('已确认')
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '确认失败') }
}
async function ackSelected() {
  const ids = selectedUnacked.value.map((a) => a.id)
  if (!ids.length) { ElMessage.info('所选均为已确认'); return }
  try {
    const r = await api.ackAlerts(ids)
    ElMessage.success(`已确认 ${r.acked} 条`)
    selected.value = []
    load()
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '批量确认失败') }
}

const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return m + ' 分钟前'
  if (m < 60 * 24) return Math.floor(m / 60) + ' 小时前'
  return Math.floor(m / 1440) + ' 天前'
}

onMounted(async () => {
  load()
  try { devices.value = await api.devices() } catch { /* 筛选器可降级 */ }
})
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="trend">
      <template #header><span class="hd">近 7 天告警趋势</span></template>
      <div class="chart" ref="chart"></div>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="hd">
          <span>告警列表<span v-if="unackedCount" class="unacked">（未确认 {{ unackedCount }}）</span></span>
          <el-button v-if="selectedUnacked.length" size="small" type="primary" @click="ackSelected">
            确认所选（{{ selectedUnacked.length }}）
          </el-button>
        </div>
      </template>

      <div class="toolbar">
        <el-select v-model="f.level" placeholder="等级" clearable style="width: 110px" @change="load">
          <el-option v-for="l in LEVELS" :key="l.value" :value="l.value" :label="l.label" />
        </el-select>
        <el-select v-model="f.device_id" placeholder="设备" clearable filterable style="width: 180px" @change="load">
          <el-option v-for="d in devices" :key="d.id" :value="d.id" :label="d.name" />
        </el-select>
        <el-checkbox v-model="f.unacked" @change="load">只看未确认</el-checkbox>
        <div class="spacer" />
        <el-button size="small" @click="load">刷新</el-button>
      </div>

      <el-table :data="alerts" v-loading="loading" size="small" @selection-change="(v: Alert[]) => (selected = v)" row-key="id">
        <el-table-column type="selection" width="42" :selectable="(row: Alert) => !row.acked" />
        <el-table-column label="等级" width="80">
          <template #default="{ row }">
            <el-tag size="small" :color="levelColor(row.level)" effect="dark" style="border: none">{{ levelLabel(row.level) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="device_name" label="设备" width="150">
          <template #default="{ row }">{{ row.device_name ?? '-' }}</template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="160" />
        <el-table-column prop="detail" label="详情" min-width="180">
          <template #default="{ row }"><span class="dim">{{ row.detail ?? '-' }}</span></template>
        </el-table-column>
        <el-table-column label="时间" width="110">
          <template #default="{ row }">{{ timeAgo(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.acked" size="small" type="info">已确认</el-tag>
            <el-tag v-else size="small" type="danger">未确认</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-button v-if="!row.acked" link type="primary" @click="ack(row)">确认</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.trend { margin-bottom: 16px; }
.chart { height: 220px; }
.hd { display: flex; align-items: center; justify-content: space-between; }
.unacked { color: #f56c6c; font-size: 13px; margin-left: 6px; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; align-items: center; }
.spacer { flex: 1; }
.dim { color: #909399; }
</style>
