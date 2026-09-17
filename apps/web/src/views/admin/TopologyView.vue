<script setup lang="ts">
// 网络拓扑管理页：编辑/只读双模式 + 过滤器（单一生效拓扑，无版本管理）
import { onMounted, reactive, ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../store/auth'
import TopologyEditor from '../TopologyEditor.vue'
import GraphView from '../../components/topology/GraphView.vue'
import DeviceDrawer from '../../components/topology/DeviceDrawer.vue'

const auth = useAuthStore()
const route = useRoute()
const canWrite = computed(() => auth.role === 'admin' || auth.role === 'operator')

// 模式：?mode= 深链可指定（如链路页「定位」带 mode=edit）；默认按角色
const mode = ref<'edit' | 'view'>(
  route.query.mode === 'view' ? 'view' : (canWrite.value ? 'edit' : 'view'))

// 过滤器（只读模式用）
const filter = reactive({ q: '', status: '', onlyAbnormal: false })

// 设备抽屉（只读模式点节点）
const drawer = ref({ deviceId: null as string | null, nodeId: '', open: false })
const gvRef = ref<InstanceType<typeof GraphView>>()

const STATUS_OPTIONS = [
  { value: 'normal', label: '正常' },
  { value: 'warn', label: '警告' },
  { value: 'alert', label: '严重' },
  { value: 'unmanaged', label: '未纳管' },
]

function openDevice(deviceId: string | null, nodeId: string) {
  drawer.value = { deviceId, nodeId, open: true }
}

onMounted(async () => {
  await auth.ensureMe?.()
})
</script>

<template>
  <div class="tv">
    <!-- 顶栏：模式 + 过滤器 -->
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
    </div>

    <div class="tv-body">
      <!-- 画布（编辑/只读） -->
      <section class="tv-canvas">
        <TopologyEditor v-if="mode === 'edit'" embedded />
        <GraphView v-else ref="gvRef"
          :filter="{ q: filter.q, status: filter.status, onlyAbnormal: filter.onlyAbnormal }"
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
.tv-body { flex: 1; display: flex; min-height: 0; }

.tv-canvas { flex: 1; min-width: 0; position: relative; background: #0d1a30; }
</style>
