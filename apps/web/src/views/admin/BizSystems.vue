<script setup lang="ts">
// 业务系统：CRUD + SLA
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../../api'
import type { BizSystem } from '../../types'

const STATUS_OPTIONS = [
  { value: 'normal', label: '正常', type: 'success' },
  { value: 'warn', label: '降级', type: 'warning' },
  { value: 'alert', label: '中断', type: 'danger' },
]
const statusLabel = (s: string) => STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s
const statusTagType = (s: string) => (STATUS_OPTIONS.find((o) => o.value === s)?.type as string) ?? 'info'

const items = ref<BizSystem[]>([])
const visible = ref(false)
const form = reactive({ id: null as number | null, name: '', owner: '', status: 'normal', sla_target: 99.9, sla_actual: 99.95 })

async function load() {
  try { items.value = await api.bizSystems() } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  }
}
function openEdit(b?: BizSystem) {
  Object.assign(form, b
    ? { id: b.id, name: b.name, owner: b.owner ?? '', status: b.status, sla_target: b.sla_target ?? 99.9, sla_actual: b.sla_actual ?? 99.9 }
    : { id: null, name: '', owner: '', status: 'normal', sla_target: 99.9, sla_actual: 99.95 })
  visible.value = true
}
async function save() {
  if (!form.name.trim()) { ElMessage.warning('名称必填'); return }
  try {
    const body = { name: form.name, owner: form.owner || null, status: form.status,
      sla_target: form.sla_target, sla_actual: form.sla_actual }
    if (form.id == null) await api.createBiz(body)
    else await api.updateBiz(form.id, body)
    ElMessage.success('已保存')
    visible.value = false
    load()
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '保存失败') }
}
async function remove(b: BizSystem) {
  try { await ElMessageBox.confirm(`删除业务系统「${b.name}」？`, '确认', { type: 'warning' }) } catch { return }
  try {
    await api.deleteBiz(b.id)
    ElMessage.success('已删除')
    load()
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '删除失败') }
}
const slaMiss = (b: BizSystem) => b.sla_target != null && b.sla_actual != null && b.sla_actual < b.sla_target

onMounted(load)
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="hd"><span>业务系统</span><el-button size="small" type="primary" @click="openEdit()">新增</el-button></div>
      </template>
      <el-table :data="items" size="small">
        <el-table-column prop="name" label="系统" min-width="160" />
        <el-table-column prop="owner" label="责任部门" width="140">
          <template #default="{ row }">{{ row.owner ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }"><el-tag size="small" :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="SLA 目标" width="100">
          <template #default="{ row }">{{ row.sla_target != null ? row.sla_target + '%' : '-' }}</template>
        </el-table-column>
        <el-table-column label="SLA 实际" width="120">
          <template #default="{ row }">
            <span :class="{ 'miss': slaMiss(row) }">{{ row.sla_actual != null ? row.sla_actual + '%' : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="visible" :title="form.id == null ? '新增业务系统' : '编辑业务系统'" width="440px">
      <el-form label-width="90px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="责任部门"><el-input v-model="form.owner" /></el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio-button v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="SLA 目标%"><el-input-number v-model="form.sla_target" :min="0" :max="100" :precision="2" :step="0.1" /></el-form-item>
        <el-form-item label="SLA 实际%"><el-input-number v-model="form.sla_actual" :min="0" :max="100" :precision="2" :step="0.1" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.hd { display: flex; align-items: center; justify-content: space-between; }
.miss { color: #f56c6c; font-weight: 600; }
</style>
