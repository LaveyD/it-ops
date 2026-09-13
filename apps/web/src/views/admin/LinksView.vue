<script setup lang="ts">
// M8 链路视图：从 active 拓扑派生的只读链路台账（后端展开 canvas.links）。
// 状态 = 两端设备最差；?node= 深链高亮含该节点的所有链路并可跳拓扑定位。
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../../api'
import type { TopoLinkRow } from '../../types'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const topo = ref<{ topology_id: number; name: string; version: number } | null>(null)
const links = ref<TopoLinkRow[]>([])
const q = ref('')
const statusFilter = ref('')

const STATUS_LABEL: Record<string, string> = { normal: '正常', warn: '警告', alert: '严重', unmanaged: '未纳管' }
const STATUS_TAG: Record<string, string> = { normal: 'success', warn: 'warning', alert: 'danger', unmanaged: 'info' }

// ?node= 深链：高亮含该节点的链路
const focusNode = ref<string>((route.query.node as string) || '')
watch(() => route.query.node, (v) => { focusNode.value = (v as string) || '' })

const filtered = computed(() => {
  const kw = q.value.trim().toLowerCase()
  return links.value.filter((l) => {
    if (statusFilter.value && l.status !== statusFilter.value) return false
    if (focusNode.value) {
      if (l.source.node_id !== focusNode.value && l.target.node_id !== focusNode.value) return false
    }
    if (!kw) return true
    const hay = [l.source.label, l.target.label, l.label,
      l.source.device?.name, l.target.device?.name, l.source.device?.ip, l.target.device?.ip]
      .filter(Boolean).join(' ').toLowerCase()
    return hay.includes(kw)
  })
})

async function load() {
  loading.value = true
  try {
    const r = await api.topologyLinks()
    topo.value = { topology_id: r.topology_id, name: r.name, version: r.version }
    links.value = r.links
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '加载链路失败')
  } finally {
    loading.value = false
  }
}

function gotoTopology(nodeId: string) {
  router.push({ path: '/admin/network/topology', query: { node: nodeId, mode: 'edit' } })
}

onMounted(load)
</script>

<template>
  <div class="lv">
    <div class="lv-bar">
      <span v-if="topo" class="lv-cur">生效拓扑 v{{ topo.version }} · {{ topo.name }} · 共 {{ links.length }} 条链路</span>
      <span v-else class="lv-cur">加载失败或暂无拓扑</span>
      <el-input v-model="q" placeholder="搜索节点 / 设备 / IP" size="small" clearable class="lv-search" />
      <el-select v-model="statusFilter" placeholder="链路状态" size="small" clearable class="lv-search">
        <el-option value="normal" label="正常" />
        <el-option value="warn" label="警告" />
        <el-option value="alert" label="严重" />
        <el-option value="unmanaged" label="含未纳管" />
      </el-select>
      <el-button size="small" @click="load">刷新</el-button>
    </div>

    <el-alert v-if="focusNode" type="warning" :closable="false" class="lv-focus">
      已按节点 {{ focusNode }} 过滤（链路视图为只读台账，定位到拓扑编辑器：点下方「定位」）
      <a @click="router.push('/admin/network/topology')">清除</a>
    </el-alert>

    <el-table :data="filtered" v-loading="loading" size="small" stripe>
      <el-table-column label="源节点" min-width="170">
        <template #default="{ row }">
          <div class="lv-end" :class="{ focus: focusNode && row.source.node_id === focusNode }">
            <b>{{ row.source.label }}</b>
            <span class="lv-dim mono">{{ row.source.node_id }}</span>
          </div>
          <div class="lv-dev">
            <template v-if="row.source.device">
              <el-tag :type="STATUS_TAG[row.source.device_status]" size="small">{{ row.source.device.name }}</el-tag>
            </template>
            <el-tag v-else type="info" size="small">未纳管</el-tag>
            <span v-if="row.source.device?.ip" class="lv-dim mono">{{ row.source.device.ip }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="链路" width="120" align="center">
        <template #default="{ row }">
          <span v-if="row.label" class="lv-linklabel">{{ row.label }}</span>
          <span v-else class="lv-dim">—</span>
        </template>
      </el-table-column>
      <el-table-column label="目标节点" min-width="170">
        <template #default="{ row }">
          <div class="lv-end" :class="{ focus: focusNode && row.target.node_id === focusNode }">
            <b>{{ row.target.label }}</b>
            <span class="lv-dim mono">{{ row.target.node_id }}</span>
          </div>
          <div class="lv-dev">
            <template v-if="row.target.device">
              <el-tag :type="STATUS_TAG[row.target.device_status]" size="small">{{ row.target.device.name }}</el-tag>
            </template>
            <el-tag v-else type="info" size="small">未纳管</el-tag>
            <span v-if="row.target.device?.ip" class="lv-dim mono">{{ row.target.device.ip }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="链路状态" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG[row.status]" size="small">{{ STATUS_LABEL[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" align="center">
        <template #default="{ row }">
          <a class="lv-act" @click="gotoTopology(row.source.node_id)">源定位</a>
          <a class="lv-act" @click="gotoTopology(row.target.node_id)">目标定位</a>
        </template>
      </el-table-column>
    </el-table>
    <p class="lv-note">链路台账由生效拓扑的连线派生（只读）；状态取两端设备最差值，未关联设备不参与比较。新增/修改链路请在「网络拓扑」编辑模式操作。</p>
  </div>
</template>

<style scoped>
.lv { height: 100%; display: flex; flex-direction: column; padding: 14px; gap: 10px; background: #f5f7fa; }
.lv-bar { display: flex; align-items: center; gap: 10px; }
.lv-cur { font-size: 13px; color: #606266; }
.lv-search { width: 210px; }
.lv-search:last-of-type { margin-left: auto; }
.lv-focus { margin: 0; }
.lv-focus a { color: #409eff; margin-left: 8px; cursor: pointer; }
.lv-end { display: flex; align-items: center; gap: 6px; }
.lv-end.focus b { color: #e6a23c; }
.lv-dim { color: #909399; font-size: 11.5px; }
.mono { font-family: ui-monospace, monospace; }
.lv-dev { margin-top: 4px; display: flex; align-items: center; gap: 6px; }
.lv-linklabel { font-size: 12.5px; color: #303133; }
.lv-act { font-size: 12.5px; color: #409eff; cursor: pointer; margin: 0 6px; }
.lv-act:hover { text-decoration: underline; }
.lv-note { font-size: 12px; color: #909399; }
:deep(.el-tag) { margin-right: 2px; }
</style>
