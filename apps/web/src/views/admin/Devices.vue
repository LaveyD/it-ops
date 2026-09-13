<script setup lang="ts">
// 设备台账：CRUD + 筛选 + 批量改状态 + 拓扑引用 chip
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import { api } from '../../api'
import type { Device, Location } from '../../types'

const router = useRouter()

const STATUS_OPTIONS = [
  { value: 'normal', label: '正常', type: 'success' },
  { value: 'warn', label: '警告', type: 'warning' },
  { value: 'alert', label: '严重', type: 'danger' },
]
const statusLabel = (s: string) => STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s
const statusTagType = (s: string) => (STATUS_OPTIONS.find((o) => o.value === s)?.type as string) ?? 'info'

const TYPE_OPTIONS = ['router', 'switch', 'firewall', 'server', 'loadbalancer', 'idc', 'gateway', 'ap', 'camera']

const devices = ref<Device[]>([])
const locations = ref<Location[]>([])
const loading = ref(false)

// 筛选
const f = reactive({ q: '', status: '', type: '' })

// 批量选择
const selected = ref<Device[]>([])
const batchStatus = ref('')
const batchPickerVisible = ref(false)

// 编辑抽屉
const drawer = ref(false)
const editing = ref<Device | null>(null)
const form = reactive({
  id: '', name: '', type: 'server', ip: '', status: 'normal',
  location_id: null as number | null, owner: '',
})
const formErrors = ref<Record<string, string>>({})

async function load() {
  loading.value = true
  try {
    const q: Record<string, string> = {}
    if (f.q) q.q = f.q
    if (f.status) q.status = f.status
    if (f.type) q.type = f.type
    devices.value = await api.devices(q)
    locations.value = await api.locations()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  Object.assign(form, { id: '', name: '', type: 'server', ip: '', status: 'normal', location_id: null, owner: '' })
  formErrors.value = {}
  drawer.value = true
}

function openEdit(d: Device) {
  editing.value = d
  Object.assign(form, {
    id: d.id, name: d.name, type: d.type, ip: d.ip ?? '', status: d.status,
    location_id: d.location_id, owner: d.owner ?? '',
  })
  formErrors.value = {}
  drawer.value = true
}

async function save() {
  // 前端校验
  const errs: Record<string, string> = {}
  if (!editing.value && !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(form.id)) errs.id = '2-64 位字母/数字，可含 _ -，字母数字开头'
  if (!form.name.trim()) errs.name = '必填'
  if (form.ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(form.ip)) errs.ip = 'IPv4 格式'
  formErrors.value = errs
  if (Object.keys(errs).length) return
  try {
    const body: Record<string, unknown> = {
      name: form.name, type: form.type, ip: form.ip || null, status: form.status,
      location_id: form.location_id, owner: form.owner || null,
    }
    if (editing.value) {
      await api.updateDevice(editing.value.id, body)
      ElMessage.success('已保存')
    } else {
      body.id = form.id
      await api.createDevice(body)
      ElMessage.success('已创建')
    }
    drawer.value = false
    load()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  }
}

async function remove(d: Device) {
  try {
    await ElMessageBox.confirm(`删除设备「${d.name}」？拓扑关联将自动解绑。`, '确认删除', { type: 'warning' })
  } catch { return }
  try {
    await api.deleteDevice(d.id)
    ElMessage.success('已删除')
    load()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  }
}

async function doBatchStatus() {
  if (!batchStatus.value) return
  const ids = selected.value.map((d) => d.id)
  try {
    const r = await api.batchDeviceStatus(ids, batchStatus.value)
    ElMessage.success(`已更新 ${r.updated} 台${r.missing.length ? `（跳过不存在 ${r.missing.length}）` : ''}`)
    batchPickerVisible.value = false
    selected.value = []
    load()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '批量操作失败')
  }
}

const selectedCount = computed(() => selected.value.length)

onMounted(load)
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <div class="toolbar">
        <el-input v-model="f.q" placeholder="搜索名称" clearable style="width: 200px" @change="load" />
        <el-select v-model="f.status" placeholder="状态" clearable style="width: 120px" @change="load">
          <el-option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-select v-model="f.type" placeholder="类型" clearable filterable style="width: 140px" @change="load">
          <el-option v-for="t in TYPE_OPTIONS" :key="t" :value="t" :label="t" />
        </el-select>
        <div class="spacer" />
        <template v-if="selectedCount">
          <span class="sel-hint">已选 {{ selectedCount }} 台</span>
          <el-dropdown @command="(c: string) => { batchStatus = c; doBatchStatus() }">
            <el-button>批量改状态<el-icon class="el-icon--right"><arrow-down /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="o in STATUS_OPTIONS" :key="o.value" :command="o.value">{{ o.label }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
        <el-button type="primary" @click="openCreate">新增设备</el-button>
      </div>

      <el-table :data="devices" v-loading="loading" @selection-change="(v: Device[]) => (selected = v)" row-key="id" style="width: 100%">
        <el-table-column type="selection" width="42" />
        <el-table-column prop="name" label="名称" min-width="150">
          <template #default="{ row }">
            <b>{{ row.name }}</b>
            <div class="mono dim">{{ row.id }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="110">
          <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.type }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="130">
          <template #default="{ row }"><span class="mono">{{ row.ip ?? '-' }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="位置" width="120">
          <template #default="{ row }">{{ row.location ?? '-' }}</template>
        </el-table-column>
        <el-table-column prop="owner" label="负责人" width="100">
          <template #default="{ row }">{{ row.owner ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="拓扑引用" min-width="160">
          <template #default="{ row }">
            <router-link
              v-for="r in row.referenced_by" :key="r.topology_id + '-' + r.node_id"
              class="chip" :to="`/admin/network/topology?node=${encodeURIComponent(r.node_id)}`"
              :title="'在编辑器中查看节点 ' + r.node_label"
            >{{ r.topology_name }}·{{ r.node_label }}</router-link>
            <span v-if="!row.referenced_by.length" class="dim">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/devices/${row.id}`)">详情</el-button>
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-drawer v-model="drawer" :title="editing ? '编辑设备' : '新增设备'" size="420px">
      <el-form label-width="90px">
        <el-form-item label="设备 ID" :error="formErrors.id">
          <el-input v-model="form.id" :disabled="!!editing" placeholder="如 srv-new-01" />
        </el-form-item>
        <el-form-item label="名称" :error="formErrors.name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" filterable allow-create style="width: 100%">
            <el-option v-for="t in TYPE_OPTIONS" :key="t" :value="t" :label="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="IP 地址" :error="formErrors.ip">
          <el-input v-model="form.ip" placeholder="选填" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio-button v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="所属位置">
          <el-select v-model="form.location_id" clearable filterable style="width: 100%">
            <el-option v-for="l in locations" :key="l.id" :value="l.id" :label="l.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-input v-model="form.owner" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="drawer = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 10px; margin-bottom: 14px; align-items: center; }
.spacer { flex: 1; }
.sel-hint { font-size: 13px; color: #606266; }
.mono { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
.dim { color: #909399; }
.chip {
  display: inline-block; margin: 1px 4px 1px 0; padding: 1px 8px; font-size: 12px;
  background: #ecf5ff; color: #409eff; border-radius: 10px; text-decoration: none;
}
.chip:hover { background: #d9ecff; }
</style>
