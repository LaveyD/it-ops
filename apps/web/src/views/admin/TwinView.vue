<script setup lang="ts">
// M9 3D 总览（网络孪生）：GraphView 大画布 + 类型图层开关 + 聚焦 + 演示模式
// 复用 GraphView（WS 实时着色 + hover 浮层）+ DeviceDrawer；不动 GraphVis 引擎
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../../api'
import GraphView from '../../components/topology/GraphView.vue'
import DeviceDrawer from '../../components/topology/DeviceDrawer.vue'

const router = useRouter()

// 图层按"大类"聚合（27 类引擎类型直接列太乱）
const LAYER_GROUPS = [
  { key: 'router', label: '路由器', types: ['router', 'atm'] },
  { key: 'switch', label: '交换机', types: ['core', 'switch', 'aggr', '1u', '2u'] },
  { key: 'firewall', label: '安全设备', types: ['firewall', 'sec'] },
  { key: 'server', label: '服务器', types: ['server', '1u', '2u'] },
  { key: 'data', label: '数据/资源', types: ['db', 'pool', 'cloud', 'idc'] },
  { key: 'app', label: '业务/管理', types: ['app', 'plat', 'mgmt', 'biz', 'gateway'] },
  { key: 'site', label: '站点/园区', types: ['home', 'corp', 'factory', 'apt', 'room'] },
  { key: 'other', label: '其他', types: ['collect', 'optic'] },
]

const gvRef = ref<InstanceType<typeof GraphView>>()
const filter = reactive({ hiddenTypes: [] as string[] })
const activeTypes = ref<Set<string>>(new Set())
const typeCount = reactive<Record<string, number>>({})

// 演示模式：画布固定铺满（盖住 AdminLayout 侧栏/顶栏），隐藏面板，纯大屏观感
const demo = ref(false)

function toggleGroup(g) {
  const hidden = new Set(filter.hiddenTypes)
  const allIn = g.types.every((t) => hidden.has(t))
  for (const t of g.types) { if (allIn) hidden.delete(t); else hidden.add(t) }
  filter.hiddenTypes = [...hidden]
}

onMounted(async () => {
  // 统计 active 拓扑各类型节点数（图层面板展示）
  try {
    const a = await api.topologyActive()
    for (const n of a.canvas.nodes || []) {
      if (n.type) typeCount[n.type] = (typeCount[n.type] || 0) + 1
    }
    activeTypes.value = new Set(Object.keys(typeCount))
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '加载拓扑失败')
  }
})

const groupVisible = (g) => !g.types.every((t) => filter.hiddenTypes.includes(t))

const drawer = ref({ deviceId: null as string | null, nodeId: '', open: false })
function openDevice(deviceId: string | null, nodeId: string) {
  if (demo.value) return // 演示模式不弹抽屉
  drawer.value = { deviceId, nodeId, open: true }
}

const totalNodes = computed(() => Object.values(typeCount).reduce((a, b) => a + b, 0))
</script>

<template>
  <div class="tw">
    <!-- 左侧图层面板（演示模式隐藏） -->
    <aside v-if="!demo" class="tw-panel">
      <div class="tw-panel-head">
        类型图层 <span class="dim">（{{ totalNodes }} 节点）</span>
      </div>
      <div class="tw-layers">
        <label v-for="g in LAYER_GROUPS" :key="g.key" class="tw-layer" :class="{ off: !groupVisible(g) }">
          <input type="checkbox" :checked="groupVisible(g)" @change="toggleGroup(g)" />
          <span class="tw-ly-label">{{ g.label }}</span>
          <span class="tw-ly-count">
            {{ g.types.reduce((s, t) => s + (typeCount[t] || 0), 0) }}
          </span>
        </label>
      </div>
      <div class="tw-tips">
        <p>· 勾选控制节点类型显隐</p>
        <p>· 单击节点 → 设备详情</p>
        <p>· 双击节点 → 相机聚焦</p>
        <p>· 滚轮缩放 / 拖拽平移</p>
      </div>
      <button class="tw-demo-btn" @click="demo = true">▶ 演示模式</button>
    </aside>

    <!-- 画布：演示模式 fixed 铺满全屏（盖住 AdminLayout 侧栏/顶栏） -->
    <div class="tw-canvas" :class="{ full: demo }" @click.self="demo = false">
      <GraphView ref="gvRef" :filter="{ hiddenTypes: filter.hiddenTypes }" @open-device="openDevice" />
      <!-- 演示模式顶标（半透明，汇报场景） -->
      <div v-if="demo" class="tw-demo-tag">IT 运维网络孪生 · 实时</div>
      <div v-if="demo" class="tw-demo-quit">点击空白处退出演示</div>
    </div>

    <!-- 设备抽屉（复用大屏组件） -->
    <DeviceDrawer
      :device-id="drawer.deviceId"
      :node-id="drawer.nodeId"
      :node-label="drawer.nodeId ? (gvRef?.nodeLabelById(drawer.nodeId) || '') : ''"
      :open="drawer.open"
      @close="drawer.open = false"
      @goto-editor="(nodeId) => { drawer.open = false; router.push({ path: '/admin/network/topology', query: { node: nodeId } }) }"
    />
  </div>
</template>

<style scoped>
.tw { display: flex; height: 100%; min-height: 0; }
.tw-panel {
  width: 232px; flex-shrink: 0; background: #fff; border-right: 1px solid #e4e7ed;
  display: flex; flex-direction: column; padding: 12px 14px; gap: 10px;
}
.tw-panel-head { font-weight: 600; font-size: 13px; color: #303133; }
.dim { color: #909399; font-weight: 400; font-size: 12px; }
.tw-layers { display: flex; flex-direction: column; gap: 2px; }
.tw-layer {
  display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px;
  font-size: 13px; color: #303133; cursor: pointer; user-select: none;
}
.tw-layer:hover { background: #f0f7ff; }
.tw-layer.off { color: #b0b6bf; }
.tw-layer input { accent-color: #2f7bff; }
.tw-ly-label { flex: 1; }
.tw-ly-count { font-size: 11px; color: #909399; background: #f0f2f5; padding: 1px 7px; border-radius: 8px; }
.tw-layer.off .tw-ly-count { background: #f5f5f5; color: #c8cdd3; }
.tw-tips { font-size: 11.5px; color: #909399; line-height: 1.8; margin-top: auto; }
.tw-tips p { margin: 0; }
.tw-demo-btn {
  width: 100%; padding: 9px 0; border: none; border-radius: 8px; cursor: pointer;
  background: linear-gradient(135deg, #2f7bff, #1a56db); color: #fff; font-size: 13px; font-weight: 600;
}
.tw-demo-btn:hover { filter: brightness(1.08); }
.tw-canvas { flex: 1; min-width: 0; position: relative; background: #0a1220; }
.tw-canvas.full {
  position: fixed; inset: 0; z-index: 50;
  /* 演示模式点击空白退出（节点/抽屉区域点击不冒泡到这里时不退出） */
}
.tw-demo-tag {
  position: absolute; top: 16px; left: 24px; z-index: 30;
  font-size: 15px; letter-spacing: 2px; color: rgba(150, 190, 255, 0.85);
  pointer-events: none;
}
.tw-demo-quit {
  position: absolute; bottom: 14px; right: 20px; z-index: 30;
  font-size: 12px; color: rgba(150, 190, 255, 0.45); pointer-events: none;
}
</style>
