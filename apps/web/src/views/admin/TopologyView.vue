<script setup lang="ts">
// M8 网络拓扑管理页：编辑/只读双模式 + 版本管理面板 + 过滤器 + 删除保护
import { onMounted, reactive, ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../../api'
import { useAuthStore } from '../../store/auth'
import TopologyEditor from '../TopologyEditor.vue'
import GraphView from '../../components/topology/GraphView.vue'
import DeviceDrawer from '../../components/topology/DeviceDrawer.vue'
import type { TopologyActive, TopologyVersion } from '../../types'

const auth = useAuthStore()
const route = useRoute()
const canWrite = computed(() => auth.role === 'admin' || auth.role === 'operator')

// 模式：?mode= 深链可指定（如链路页「定位」带 mode=edit）；默认按角色
const mode = ref<'edit' | 'view'>(
  route.query.mode === 'view' ? 'view' : (canWrite.value ? 'edit' : 'view'))

// 版本管理
const versions = ref<TopologyVersion[]>([])
const active = ref<TopologyActive | null>(null)
const versionsLoading = ref(false)
const renamingId = ref<number | null>(null)
const renameVal = ref('')

// 过滤器（只读模式用）
const filter = reactive({ q: '', status: '', onlyAbnormal: false })

// 设备抽屉（只读模式点节点）
const drawer = ref({ deviceId: null as string | null, nodeId: '', open: false })
const gvRef = ref<InstanceType<typeof GraphView>>()

const editorRef = ref<InstanceType<typeof TopologyEditor>>()

const STATUS_OPTIONS = [
  { value: 'normal', label: '正常' },
  { value: 'warn', label: '警告' },
  { value: 'alert', label: '严重' },
  { value: 'unmanaged', label: '未纳管' },
]

async function loadVersions() {
  versionsLoading.value = true
  try {
    const [vs, a] = await Promise.all([api.topologyVersions(), api.topologyActive()])
    versions.value = vs
    active.value = a
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '加载版本失败')
  } finally {
    versionsLoading.value = false
  }
}

function onEditorSaved() { loadVersions() }
function onEditorActivated() { loadVersions() }

// 版本操作
function startRename(v: TopologyVersion) {
  if (v.is_active) { ElMessage.warning('生效版本建议先激活其他版本再改（改名不影响生效）'); }
  renamingId.value = v.id
  renameVal.value = v.name
}
async function saveRename() {
  const id = renamingId.value
  renamingId.value = null
  if (!id) return
  if (!renameVal.value.trim()) { ElMessage.warning('名称不能为空'); return }
  try {
    await api.renameTopology(id, renameVal.value.trim())
    ElMessage.success('已改名')
    await loadVersions()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '改名失败')
  }
}
async function activateVersion(id: number) {
  try {
    await api.activateTopology(id)
    ElMessage.success('已激活该版本')
    await loadVersions()
    // 编辑模式：同步编辑器画布
    if (mode.value === 'edit' && editorRef.value) {
      editorRef.value.loadAll?.()
      editorRef.value.renderCanvas(active.value?.canvas as unknown as Record<string, unknown>)
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '激活失败')
  }
}
async function deleteVersion(v: TopologyVersion) {
  if (v.is_active) {
    ElMessage.warning('生效版本不可删除，请先激活其他版本')
    return
  }
  try {
    await ElMessageBox.confirm(`删除版本 v${v.version}「${v.name}」？该版本不可恢复。`, '确认删除',
      { type: 'warning' })
  } catch { return }
  try {
    await api.deleteTopology(v.id)
    ElMessage.success('已删除')
    await loadVersions()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  }
}
// 版本查看：外部指定 canvas（非生效版本快照）；null = 看生效版本
const viewCanvas = ref<{ nodes: unknown[]; links: unknown[]; groups?: unknown[] } | null>(null)
const viewingId = ref<number | null>(null)

async function viewVersion(v: TopologyVersion) {
  mode.value = 'view'
  if (v.is_active) { viewCanvas.value = null; viewingId.value = null; return }
  try {
    const d = await api.getVersion(v.id)
    viewCanvas.value = d.canvas
    viewingId.value = v.id
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '查看失败')
  }
}
function backToActive() { viewCanvas.value = null; viewingId.value = null }

function openDevice(deviceId: string | null, nodeId: string) {
  drawer.value = { deviceId, nodeId, open: true }
}

onMounted(async () => {
  await auth.ensureMe?.()
  await loadVersions()
})
</script>

<template>
  <div class="tv">
    <!-- 顶栏：模式 + 过滤器 + 当前版本 -->
    <div class="tv-bar">
      <el-radio-group v-model="mode" size="small" :disabled="!canWrite">
        <el-radio-button value="edit">编辑</el-radio-button>
        <el-radio-button value="view">只读</el-radio-button>
      </el-radio-group>

      <!-- 过滤器（仅只读模式） -->
      <template v-if="mode === 'view'">
        <el-input v-model="filter.q" placeholder="搜索名称 / 设备 / IP" size="small" clearable class="tv-filter" />
        <el-select v-model="filter.status" placeholder="状态" size="small" clearable class="tv-filter">
          <el-option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-switch v-model="filter.onlyAbnormal" size="small" active-text="只看异常" inline-prompt />
      </template>

      <span v-if="viewingId && mode === 'view'" class="tv-cur view-banner">
        正在查看 v{{ versions.find(v => v.id === viewingId)?.version }}（非生效快照）
        <a @click="backToActive">返回生效版本</a>
      </span>
      <span v-else-if="active" class="tv-cur">
        生效：v{{ active.version }} · {{ active.name }}
      </span>
    </div>

    <div class="tv-body">
      <!-- 左：版本管理面板 -->
      <aside class="tv-versions" v-loading="versionsLoading">
        <div class="tv-versions-head">版本管理（{{ versions.length }}）</div>
        <div class="tv-vlist">
          <div v-for="v in versions" :key="v.id" class="tv-vitem" :class="{ active: v.is_active }">
            <div class="tv-vrow">
              <span class="tv-vnum">v{{ v.version }}</span>
              <el-tag v-if="v.is_active" size="small" type="success">生效</el-tag>
              <span class="tv-vname" v-if="renamingId !== v.id">{{ v.name }}</span>
              <template v-else>
                <el-input v-model="renameVal" size="small" @keyup.enter="saveRename" @blur="saveRename" />
              </template>
            </div>
            <div class="tv-vrow sub">
              <span class="tv-vtime">{{ new Date(v.updated_at).toLocaleString('zh-CN', { hour12: false }) }}</span>
              <span class="tv-acts">
                <a v-if="renamingId === v.id" @click="saveRename">保存</a>
                <a v-else @click="startRename(v)">改名</a>
                <a @click="viewVersion(v)">查看</a>
                <a v-if="!v.is_active && active" @click="activateVersion(v.id)">激活</a>
                <a class="danger" @click="deleteVersion(v)">删除</a>
              </span>
            </div>
          </div>
        </div>
      </aside>

      <!-- 右：画布（编辑/只读） -->
      <section class="tv-canvas">
        <TopologyEditor v-if="mode === 'edit'" ref="editorRef" embedded @saved="onEditorSaved" @activated="onEditorActivated" />
        <GraphView v-else ref="gvRef"
          :filter="{ q: filter.q, status: filter.status, onlyAbnormal: filter.onlyAbnormal }"
          :external-canvas="viewCanvas"
          @open-device="openDevice" />
      </section>
    </div>

    <!-- 只读模式点节点 → 设备抽屉 -->
    <DeviceDrawer
      v-if="mode === 'view'"
      :device-id="drawer.deviceId"
      :node-id="drawer.nodeId"
      :node-label="drawer.nodeId ? (gvRef?.nodeLabelById(drawer.nodeId) || '') : ''"
      :open="drawer.open"
      @close="drawer.open = false"
    />
  </div>
</template>

<style scoped>
.tv { height: 100%; display: flex; flex-direction: column; min-height: 0; }
.tv-bar {
  flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 10px 14px;
  background: #fff; border-bottom: 1px solid #e4e7ed;
}
.tv-filter { width: 200px; }
.tv-cur { margin-left: auto; font-size: 13px; color: #606266; }
.tv-cur.view-banner { color: #e6a23c; }
.tv-cur.view-banner a { color: #409eff; margin-left: 8px; cursor: pointer; }
.tv-body { flex: 1; display: flex; min-height: 0; }

.tv-versions {
  width: 260px; flex-shrink: 0; border-right: 1px solid #e4e7ed;
  display: flex; flex-direction: column; background: #fff;
}
.tv-versions-head { padding: 10px 14px; font-weight: 600; font-size: 13px; border-bottom: 1px solid #ebeef5; }
.tv-vlist { flex: 1; overflow-y: auto; }
.tv-vitem { padding: 8px 12px; border-bottom: 1px solid #f0f2f5; }
.tv-vitem.active { background: #f0f9ff; }
.tv-vrow { display: flex; align-items: center; gap: 8px; }
.tv-vrow.sub { margin-top: 6px; justify-content: space-between; }
.tv-vnum { font-weight: 700; color: #303133; font-family: ui-monospace, monospace; }
.tv-vname { font-size: 12.5px; color: #606266; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tv-vtime { font-size: 11px; color: #909399; }
.tv-acts { display: flex; gap: 8px; }
.tv-acts a { font-size: 12px; color: #409eff; cursor: pointer; }
.tv-acts a.danger { color: #f56c6c; }
.tv-acts a:hover { text-decoration: underline; }

.tv-canvas { flex: 1; min-width: 0; position: relative; background: #0d1a30; }
</style>
