<script setup lang="ts">
// M9 3D 机房（真三维）：room-core（Three.js 场景管理器）+ 本壳
// 数据：/api/rooms/{id}/scene（M7）；实时：WS feed_update → updateDeviceStatuses 增量改色
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../../api'
import { RoomCore } from '../../components/twin/room-core'
import { useFeed } from '../../composables/useWs'
import type { RoomScene } from '../../types'

const rooms = ref<import('../../types').Room[]>([])
const roomId = ref<number | null>(null)
const scene = ref<RoomScene | null>(null)
const loading = ref(false)
const coreReady = ref(false)

const boxRef = ref<HTMLElement>()
let core: RoomCore | null = null
let offFeed: (() => void) | null = null

// 机柜抽屉
const drawer = ref(false)
const drawerCab = ref<{ name: string; row: number; col: number; u_height: number; status: string; devices: any[] } | null>(null)
const highlightDevice = ref<string | null>(null)

// hover 浮层
const hover = ref<{ show: boolean; x: number; y: number; name: string; status: string; extra: string }>({
  show: false, x: 0, y: 0, name: '', status: '', extra: '',
})

// 统计
const stats = computed(() => {
  const cabs = scene.value?.cabinets || []
  const devs = cabs.flatMap((c) => c.devices)
  const by = (s: string) => devs.filter((d) => d.status === s).length
  return {
    cabs: cabs.length,
    devs: devs.length,
    normal: by('normal'), warn: by('warn'), alert: by('alert'),
    unmanaged: devs.length - by('normal') - by('warn') - by('alert'),
  }
})

async function loadRooms() {
  try {
    rooms.value = await api.rooms()
    if (!roomId.value && rooms.value.length) roomId.value = rooms.value[0].id
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '加载机房失败')
  }
}

async function loadScene() {
  if (!roomId.value) return
  loading.value = true
  try {
    scene.value = await api.roomScene(roomId.value)
    core?.setScene(scene.value)
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '加载场景失败')
  } finally {
    loading.value = false
  }
}

function openCabinet(cab) {
  drawerCab.value = cab
  highlightDevice.value = null
  drawer.value = true
}
function openDevice(d) {
  // 点设备 → 打开所属机柜抽屉并高亮该设备
  const cab = scene.value?.cabinets.find((c) => c.id === d.cabinetId)
  if (cab) {
    highlightDevice.value = d.deviceId
    openCabinet(cab)
  }
  core?.focusDevice(d.deviceId)
}

onMounted(async () => {
  core = new RoomCore(boxRef.value!, {
    onPickCabinet: openCabinet,
    onPickDevice: openDevice,
    onHover: (h) => {
      if (!h) { hover.value.show = false; return }
      hover.value = {
        show: true, x: 14, y: 14,
        name: h.name || ('机柜 ' + h.id),
        status: h.status || '',
        extra: h.kind === 'cabinet' ? `第 ${h.row} 行 · 第 ${h.col} 列 · ${h.devices?.length || 0} 台设备` : `U${h.u_start ?? '—'} · ${h.ip || '无 IP'}`,
      }
    },
  })
  coreReady.value = true
  await loadRooms()
  await loadScene()
  // WS 实时：设备状态变更 → 增量改色（不重建场景）
  offFeed = useFeed((m) => {
    if (m.type === 'feed_update' && m.statuses) core?.updateDeviceStatuses(m.statuses)
  })
})
onUnmounted(() => { offFeed?.(); core?.dispose() })

const statusText: Record<string, string> = { normal: '正常', warn: '警告', alert: '严重', unmanaged: '未纳管' }
const statusClass: Record<string, string> = { normal: 's-normal', warn: 's-warn', alert: 's-alert', unmanaged: 's-unm' }
</script>

<template>
  <div class="rv">
    <!-- 顶栏：机房选择 + 统计 -->
    <div class="rv-bar">
      <el-select v-model="roomId" size="small" class="rv-room" @change="loadScene" :loading="loading">
        <el-option v-for="r in rooms" :key="r.id" :value="r.id" :label="`${r.name}（${r.rows}×${r.cols}）`" />
      </el-select>
      <span class="rv-stat">机柜 <b>{{ stats.cabs }}</b></span>
      <span class="rv-stat">设备 <b>{{ stats.devs }}</b></span>
      <span class="rv-stat s-normal">正常 {{ stats.normal }}</span>
      <span class="rv-stat s-warn">警告 {{ stats.warn }}</span>
      <span class="rv-stat s-alert">严重 {{ stats.alert }}</span>
      <span v-if="stats.unmanaged" class="rv-stat s-unm">未纳管 {{ stats.unmanaged }}</span>
      <span class="rv-hint">左键旋转 · 滚轮缩放 · 右键平移 · 点击机柜/设备查看</span>
    </div>

    <!-- 3D 画布 -->
    <div ref="boxRef" class="rv-canvas" v-loading="loading">
      <div v-if="hover.show" class="rv-tip" :style="{ left: hover.x + 'px', top: hover.y + 'px' }">
        <div class="rv-tip-name">{{ hover.name }} <span :class="statusClass[hover.status] || ''">{{ hover.status ? statusText[hover.status] : '' }}</span></div>
        <div class="rv-tip-extra">{{ hover.extra }}</div>
      </div>
      <div v-if="!loading && stats.cabs === 0" class="rv-empty">该机房暂无机柜（到「机房与区域」页创建）</div>
    </div>

    <!-- 机柜抽屉 -->
    <el-drawer v-model="drawer" size="380px" :title="drawerCab ? `机柜 ${drawerCab.name}` : '机柜'">
      <template v-if="drawerCab">
        <el-descriptions :column="2" border size="small" class="rv-desc">
          <el-descriptions-item label="位置">第 {{ drawerCab.row }} 行 · 第 {{ drawerCab.col }} 列</el-descriptions-item>
          <el-descriptions-item label="U 位总数">{{ drawerCab.u_height }}</el-descriptions-item>
          <el-descriptions-item label="已用设备">{{ drawerCab.devices.length }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag size="small" :type="drawerCab.status === 'normal' ? 'success' : 'danger'">{{ statusText[drawerCab.status] || drawerCab.status }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>
        <div class="rv-devs">
          <div v-for="d in drawerCab.devices" :key="d.id"
               class="rv-dev" :class="{ hl: highlightDevice === d.id, 'has-alert': d.status === 'alert' }"
               @click="openDevice(d)">
            <span class="rv-dev-u" v-if="d.u_start != null">U{{ d.u_start }}</span>
            <span class="rv-dev-u" v-else>—</span>
            <span class="rv-dev-name">{{ d.name }}</span>
            <span :class="'rv-dev-s ' + (statusClass[d.status] || 's-unm')">{{ statusText[d.status] || d.status }}</span>
          </div>
          <div v-if="!drawerCab.devices.length" class="rv-dim">该柜暂无设备</div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.rv { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.rv-bar {
  height: 52px; flex-shrink: 0; background: #fff; border-bottom: 1px solid #e8eaef;
  display: flex; align-items: center; gap: 14px; padding: 0 16px;
}
.rv-room { width: 200px; }
.rv-stat { font-size: 12.5px; color: #606266; white-space: nowrap; }
.rv-stat b { color: #303133; }
.rv-stat.s-normal b, .rv-stat.s-normal { color: #22c55e; }
.rv-stat.s-warn b, .rv-stat.s-warn { color: #faad14; }
.rv-stat.s-alert b, .rv-stat.s-alert { color: #ff4d4f; }
.rv-stat.s-unm b, .rv-stat.s-unm { color: #909399; }
.rv-hint { margin-left: auto; font-size: 11.5px; color: #b0b6bf; }
.rv-canvas { flex: 1; min-height: 0; position: relative; background: #0a1220; }
.rv-tip {
  position: absolute; z-index: 10; pointer-events: none; min-width: 150px;
  background: rgba(10, 20, 40, 0.95); border: 1px solid rgba(90,130,200,0.4); border-radius: 8px;
  padding: 8px 10px; box-shadow: 0 4px 16px rgba(0,0,0,.4);
}
.rv-tip-name { font-size: 13px; font-weight: 600; color: #e6edf7; }
.rv-tip-extra { font-size: 11px; color: #7d93b2; margin-top: 4px; }
.rv-empty {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #7d93b2; font-size: 13px;
}
.s-normal { color: #22c55e; } .s-warn { color: #faad14; }
.s-alert { color: #ff4d4f; } .s-unm { color: #909399; }
.rv-desc { margin-bottom: 14px; }
.rv-devs { display: flex; flex-direction: column; gap: 6px; }
.rv-dev {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px;
  border: 1px solid #ebeef5; border-radius: 8px; cursor: pointer; font-size: 13px;
  transition: border-color .15s, background .15s;
}
.rv-dev:hover { border-color: #2f7bff; background: #f5f9ff; }
.rv-dev.hl { border-color: #2f7bff; background: #ecf5ff; }
.rv-dev.has-alert { border-color: rgba(255,77,79,.5); }
.rv-dev-u {
  width: 38px; flex-shrink: 0; font-family: ui-monospace, monospace; font-size: 11px;
  color: #909399; background: #f5f7fa; border-radius: 4px; text-align: center; padding: 2px 0;
}
.rv-dev-name { flex: 1; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rv-dev-s { font-size: 12px; }
.rv-dim { color: #909399; font-size: 12.5px; text-align: center; padding: 12px 0; }
</style>
