<script setup lang="ts">
// 机房与区域：location 注册表 + 机房 CRUD + 机柜 CRUD（三维机房几何数据源）
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../../api'
import type { Cabinet, Location, Room, RoomScene } from '../../types'

const ZONE_OPTIONS = [
  { value: 'headquarters', label: '总部' },
  { value: 'branch', label: '分部' },
  { value: 'machine_room', label: '机房' },
  { value: 'other', label: '其他' },
]
const zoneLabel = (z: string) => ZONE_OPTIONS.find((o) => o.value === z)?.label ?? z

// ===== 位置注册表 =====
const locations = ref<Location[]>([])
const locVisible = ref(false)
const locForm = reactive({ id: null as number | null, name: '', zone_type: 'other', remark: '' })

async function loadLocations() {
  try { locations.value = await api.locations() } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '加载位置失败')
  }
}
function openLoc(loc?: Location) {
  Object.assign(locForm, loc
    ? { id: loc.id, name: loc.name, zone_type: loc.zone_type, remark: loc.remark ?? '' }
    : { id: null, name: '', zone_type: 'other', remark: '' })
  locVisible.value = true
}
async function saveLoc() {
  if (!locForm.name.trim()) { ElMessage.warning('名称必填'); return }
  try {
    const body = { name: locForm.name, zone_type: locForm.zone_type, remark: locForm.remark || null }
    if (locForm.id == null) await api.createLocation(body)
    else await api.updateLocation(locForm.id, body)
    ElMessage.success('已保存')
    locVisible.value = false
    loadLocations()
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '保存失败') }
}
async function removeLoc(loc: Location) {
  try { await ElMessageBox.confirm(`删除位置「${loc.name}」？`, '确认', { type: 'warning' }) } catch { return }
  try {
    await api.deleteLocation(loc.id)
    ElMessage.success('已删除')
    loadLocations()
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '删除失败') }
}

// ===== 机房 =====
const rooms = ref<Room[]>([])
const roomVisible = ref(false)
const roomForm = reactive({ id: null as number | null, name: '', location_id: null as number | null, rows: 1, cols: 1, remark: '' })

async function loadRooms() {
  try { rooms.value = await api.rooms() } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '加载机房失败')
  }
}
function openRoom(room?: Room) {
  Object.assign(roomForm, room
    ? { id: room.id, name: room.name, location_id: room.location_id, rows: room.rows, cols: room.cols, remark: room.remark ?? '' }
    : { id: null, name: '', location_id: null, rows: 1, cols: 1, remark: '' })
  roomVisible.value = true
}
async function saveRoom() {
  if (!roomForm.name.trim()) { ElMessage.warning('名称必填'); return }
  try {
    const body = { name: roomForm.name, location_id: roomForm.location_id, rows: roomForm.rows, cols: roomForm.cols, remark: roomForm.remark || null }
    if (roomForm.id == null) await api.createRoom(body)
    else await api.updateRoom(roomForm.id, body)
    ElMessage.success('已保存')
    roomVisible.value = false
    loadRooms()
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '保存失败') }
}
async function removeRoom(room: Room) {
  try { await ElMessageBox.confirm(`删除机房「${room.name}」？（有机柜时不可删）`, '确认', { type: 'warning' }) } catch { return }
  try {
    await api.deleteRoom(room.id)
    ElMessage.success('已删除')
    if (activeRoom.value?.id === room.id) activeRoom.value = null
    loadRooms()
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '删除失败') }
}

// ===== 机柜（展开机房行）=====
const activeRoom = ref<Room | null>(null)
const cabinets = ref<Cabinet[]>([])
const cabVisible = ref(false)
const cabForm = reactive({ id: null as number | null, name: '', row: 1, col: 1, u_height: 42, status: 'normal' })
// scene 预览（U 位占用）
const scene = ref<RoomScene | null>(null)
const sceneBusy = ref(false)

async function openRoomDetail(room: Room) {
  activeRoom.value = room
  try {
    cabinets.value = await api.roomCabinets(room.id)
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '加载机柜失败'); return }
  try {
    scene.value = await api.roomScene(room.id)
  } catch { scene.value = null }
}
async function refreshScene() {
  if (!activeRoom.value) return
  sceneBusy.value = true
  try { scene.value = await api.roomScene(activeRoom.value.id) } catch { /* 忽略 */ }
  finally { sceneBusy.value = false }
}
const sceneDeviceCount = computed(() => (scene.value?.cabinets ?? []).reduce((n, c) => n + c.devices.length, 0))

function openCab(cab?: Cabinet) {
  if (!activeRoom.value) return
  Object.assign(cabForm, cab
    ? { id: cab.id, name: cab.name, row: cab.row, col: cab.col, u_height: cab.u_height, status: cab.status }
    : { id: null, name: '', row: 1, col: 1, u_height: 42, status: 'normal' })
  cabVisible.value = true
}
async function saveCab() {
  if (!activeRoom.value) return
  if (!cabForm.name.trim()) { ElMessage.warning('名称必填'); return }
  try {
    const body = { name: cabForm.name, row: cabForm.row, col: cabForm.col, u_height: cabForm.u_height, status: cabForm.status }
    if (cabForm.id == null) await api.createCabinet(activeRoom.value.id, body)
    else await api.updateCabinet(cabForm.id, body)
    ElMessage.success('已保存')
    cabVisible.value = false
    openRoomDetail(activeRoom.value)
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '保存失败') }
}
async function removeCab(cab: Cabinet) {
  if (!activeRoom.value) return
  try { await ElMessageBox.confirm(`删除机柜「${cab.name}」？其上设备将解绑。`, '确认', { type: 'warning' }) } catch { return }
  try {
    await api.deleteCabinet(cab.id)
    ElMessage.success('已删除')
    openRoomDetail(activeRoom.value)
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '删除失败') }
}

onMounted(() => { loadLocations(); loadRooms() })
</script>

<template>
  <div class="page">
    <!-- 位置注册表 -->
    <el-card shadow="never" class="block">
      <template #header>
        <div class="hd"><span>位置注册表</span><el-button size="small" @click="openLoc()">新增位置</el-button></div>
      </template>
      <el-table :data="locations" size="small">
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }"><el-tag size="small" effect="plain">{{ zoneLabel(row.zone_type) }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="200">
          <template #default="{ row }"><span class="dim">{{ row.remark ?? '-' }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button link type="primary" @click="openLoc(row)">编辑</el-button>
            <el-button link type="danger" @click="removeLoc(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 机房 -->
    <el-card shadow="never" class="block">
      <template #header>
        <div class="hd"><span>机房（三维机房几何数据源）</span><el-button size="small" @click="openRoom()">新增机房</el-button></div>
      </template>
      <el-table :data="rooms" size="small" @row-click="(r: Room) => openRoomDetail(r)" :class-name="'room-row'">
        <el-table-column prop="name" label="名称" min-width="160">
          <template #default="{ row }"><b>{{ row.name }}</b><span v-if="row.remark" class="dim"> · {{ row.remark }}</span></template>
        </el-table-column>
        <el-table-column label="位置" width="130">
          <template #default="{ row }">{{ locations.find((l) => l.id === row.location_id)?.name ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="规模" width="100">
          <template #default="{ row }">{{ row.rows }} 行 × {{ row.cols }} 列</template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openRoomDetail(row)">机柜</el-button>
            <el-button link type="primary" @click.stop="openRoom(row)">编辑</el-button>
            <el-button link type="danger" @click.stop="removeRoom(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 机柜明细 -->
    <el-card v-if="activeRoom" shadow="never" class="block">
      <template #header>
        <div class="hd">
          <span>机柜 · {{ activeRoom.name }}<span class="dim">（{{ activeRoom.rows }} 行 × {{ activeRoom.cols }} 列，U 位占用 {{ sceneDeviceCount }} 台）</span></span>
          <div>
            <el-button size="small" @click="refreshScene" :loading="sceneBusy">刷新 U 位</el-button>
            <el-button size="small" @click="activeRoom = null">收起</el-button>
            <el-button size="small" type="primary" @click="openCab()">新增机柜</el-button>
          </div>
        </div>
      </template>
      <el-table :data="cabinets" size="small">
        <el-table-column prop="name" label="机柜" width="120" />
        <el-table-column prop="row" label="行" width="70" />
        <el-table-column prop="col" label="列" width="70" />
        <el-table-column prop="u_height" label="U 高" width="80" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'normal' ? 'success' : row.status === 'warn' ? 'warning' : 'danger'">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="U 位设备" min-width="240">
          <template #default="{ row }">
            <template v-if="scene">
              <el-tag v-for="d in scene.cabinets.find((c) => c.id === row.id)?.devices ?? []" :key="d.id"
                size="small" class="u-chip" :type="d.status === 'alert' ? 'danger' : d.status === 'warn' ? 'warning' : 'info'">
                U{{ d.u_start ?? '?' }} {{ d.name }}
              </el-tag>
              <span v-if="!(scene.cabinets.find((c) => c.id === row.id)?.devices?.length)" class="dim">空</span>
            </template>
            <span v-else class="dim">未加载（点右上角「刷新 U 位」）</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button link type="primary" @click="openCab(row)">编辑</el-button>
            <el-button link type="danger" @click="removeCab(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 对话框 -->
    <el-dialog v-model="locVisible" :title="locForm.id == null ? '新增位置' : '编辑位置'" width="420px">
      <el-form label-width="70px">
        <el-form-item label="名称"><el-input v-model="locForm.name" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="locForm.zone_type" style="width: 100%">
            <el-option v-for="o in ZONE_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="locForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="locVisible = false">取消</el-button>
        <el-button type="primary" @click="saveLoc">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="roomVisible" :title="roomForm.id == null ? '新增机房' : '编辑机房'" width="460px">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="roomForm.name" /></el-form-item>
        <el-form-item label="所属位置">
          <el-select v-model="roomForm.location_id" clearable filterable style="width: 100%">
            <el-option v-for="l in locations" :key="l.id" :value="l.id" :label="l.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="行数"><el-input-number v-model="roomForm.rows" :min="1" :max="16" /></el-form-item>
        <el-form-item label="每行机柜"><el-input-number v-model="roomForm.cols" :min="1" :max="64" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="roomForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roomVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRoom">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="cabVisible" :title="cabForm.id == null ? '新增机柜' : '编辑机柜'" width="440px">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="cabForm.name" placeholder="如 A1-13" /></el-form-item>
        <el-form-item label="行"><el-input-number v-model="cabForm.row" :min="1" :max="activeRoom?.rows ?? 16" /></el-form-item>
        <el-form-item label="列"><el-input-number v-model="cabForm.col" :min="1" :max="activeRoom?.cols ?? 64" /></el-form-item>
        <el-form-item label="U 高"><el-input-number v-model="cabForm.u_height" :min="1" :max="60" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="cabForm.status" style="width: 100%">
            <el-option value="normal" label="正常" /><el-option value="warn" label="警告" /><el-option value="alert" label="严重" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cabVisible = false">取消</el-button>
        <el-button type="primary" @click="saveCab">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.block { margin-bottom: 16px; }
.hd { display: flex; align-items: center; justify-content: space-between; }
.dim { color: #909399; font-size: 12px; }
.u-chip { margin: 1px 4px 1px 0; }
:deep(.room-row) { cursor: pointer; }
</style>
