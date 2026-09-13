<script setup lang="ts">
// 系统管理 · 审计日志：查询（用户/动作/目标）+ 详情 + CSV 导出
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../../api'
import type { AuditItem } from '../../types'

const items = ref<AuditItem[]>([])
const total = ref(0)
const loading = ref(false)
const q = reactive({ username: '', action: '', target_type: '', target_id: '' })
const page = ref(1)
const pageSize = 20

const detail = ref<AuditItem | null>(null)
const detailVisible = ref(false)

async function load() {
  loading.value = true
  try {
    const params: Record<string, string> = { page: String(page.value), page_size: String(pageSize) }
    if (q.username.trim()) params.username = q.username.trim()
    if (q.action.trim()) params.action = q.action.trim()
    if (q.target_type.trim()) params.target_type = q.target_type.trim()
    if (q.target_id.trim()) params.target_id = q.target_id.trim()
    const r = await api.audit(params)
    items.value = r.items
    total.value = r.total
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '加载审计失败') }
  finally { loading.value = false }
}
function search() { page.value = 1; load() }
function reset() { Object.assign(q, { username: '', action: '', target_type: '', target_id: '' }); search() }
async function exportCsv() {
  try {
    const params: Record<string, string> = {}
    if (q.username.trim()) params.username = q.username.trim()
    if (q.action.trim()) params.action = q.action.trim()
    if (q.target_type.trim()) params.target_type = q.target_type.trim()
    if (q.target_id.trim()) params.target_id = q.target_id.trim()
    await api.downloadAuditExport(params)
    ElMessage.success('已导出 CSV')
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '导出失败') }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="hd">
          <span>审计日志<span class="dim">（登录 / 用户 / 设备 / 拓扑 / 告警 / 配置 操作留痕，倒序）</span></span>
          <el-button size="small" type="primary" @click="exportCsv">导出 CSV</el-button>
        </div>
      </template>

      <el-form inline class="filter" @submit.prevent="search">
        <el-form-item label="用户"><el-input v-model="q.username" placeholder="username" clearable @keyup.enter="search" /></el-form-item>
        <el-form-item label="动作"><el-input v-model="q.action" placeholder="如 login" clearable @keyup.enter="search" /></el-form-item>
        <el-form-item label="目标类型"><el-input v-model="q.target_type" placeholder="如 user" clearable @keyup.enter="search" /></el-form-item>
        <el-form-item label="目标 ID"><el-input v-model="q.target_id" placeholder="如 op1" clearable @keyup.enter="search" /></el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="items" v-loading="loading" size="small" @row-click="(r: AuditItem) => { detail = r; detailVisible = true }">
        <el-table-column prop="id" label="#" width="70" />
        <el-table-column prop="username" label="用户" width="120">
          <template #default="{ row }"><b>{{ row.username }}</b></template>
        </el-table-column>
        <el-table-column prop="action" label="动作" width="180">
          <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.action }}</el-tag></template>
        </el-table-column>
        <el-table-column label="目标" width="180">
          <template #default="{ row }"><span class="dim">{{ row.target_type ? `${row.target_type} / ` : '' }}{{ row.target_id ?? '-' }}</span></template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="130">
          <template #default="{ row }"><span class="dim">{{ row.ip ?? '-' }}</span></template>
        </el-table-column>
        <el-table-column label="时间" width="180">
          <template #default="{ row }"><span class="dim">{{ row.created_at.replace('T', ' ').slice(0, 19) }}</span></template>
        </el-table-column>
        <el-table-column label="详情" min-width="220">
          <template #default="{ row }"><span class="dim mono">{{ row.detail && Object.keys(row.detail).length ? JSON.stringify(row.detail) : '-' }}</span></template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="pg"
        background layout="total, prev, pager, next"
        :total="total" :page-size="pageSize" :current-page="page"
        @current-change="(p: number) => { page = p; load() }"
      />
    </el-card>

    <el-drawer v-model="detailVisible" append-to-body title="审计详情" size="460px">
      <template v-if="detail">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="ID">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="用户">{{ detail.username }}</el-descriptions-item>
          <el-descriptions-item label="动作">{{ detail.action }}</el-descriptions-item>
          <el-descriptions-item label="目标类型">{{ detail.target_type ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="目标 ID">{{ detail.target_id ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="IP">{{ detail.ip ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="时间">{{ detail.created_at.replace('T', ' ').slice(0, 19) }} UTC</el-descriptions-item>
          <el-descriptions-item label="详情">
            <pre class="mono">{{ JSON.stringify(detail.detail, null, 2) }}</pre>
          </el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.hd { display: flex; align-items: center; justify-content: space-between; }
.dim { color: #909399; font-size: 12px; margin-left: 8px; }
.filter { margin-bottom: 4px; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; }
.pg { margin-top: 12px; justify-content: flex-end; }
:deep(.el-table__row) { cursor: pointer; }
</style>
