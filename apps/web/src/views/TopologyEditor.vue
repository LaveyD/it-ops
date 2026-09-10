<script setup lang="ts">
// @ts-nocheck
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TopoEngine, DEVICES, DEVICE_MAP, hexToRgb, toHex, applyGroupStyle, fitToView } from '../components/topology/topo-core'
import { api } from '../api'
import type { Device, TopologyActive, TopologyVersion } from '../types'

const route = useRoute()
const router = useRouter()

const box = ref<HTMLElement>()
let engine: TopoEngine | null = null

const activeTopo = ref<TopologyActive | null>(null)
const versions = ref<TopologyVersion[]>([])
const devices = ref<Device[]>([])
const devicesLoading = ref(false)

const dirty = ref(false)
const statusMsg = ref('')
const statusWarn = ref(false)
const stat = ref('')
const zoom = ref('100%')

// 节点/连线面板
const tab = ref<'global' | 'node' | 'link'>('global')
const nLabel = ref('')
const nColor = ref('#4a7bd0')
const nSize = ref(60)
const nRemark = ref('')
const lLabel = ref('')
const lColor = ref('#9aa3ad')
const lWidth = ref(2)
const lDash = ref('0')
const lArrow = ref('0')

// 关联设备区块
const devSelect = ref('')
const linkedDev = ref<Device | null>(null)
const devAlertCount = ref(0)

// 分组弹窗
const groupDlg = ref(false)
const gr = ref({ label: '', shape: 'rect', padding: 40, alpha: 0.8, borderWidth: 1, borderColor: '#2878dc', dash: '', font: 'normal 14px Arial', textAlign: 'center', fontColor: '#ffffff', fillColor: '#b4d2ff', headerColor: '#3c6ad0' })
let editingGroup = null

// 版本管理
const saving = ref(false)

function setStatus(msg, warn = false) { statusMsg.value = msg; statusWarn.value = warn }
function updateStat() {
  const g = engine?.graph
  if (!g) return
  const n = (g.nodes || []).length, l = (g.links || []).length
  const sel = g.scene ? (g.scene.selectedElements || []).length : 0
  stat.value = `节点 ${n} · 连线 ${l}` + (sel ? ` · 已选 ${sel}` : '')
}

async function loadAll() {
  try {
    const [a, vs] = await Promise.all([api.topologyActive(), api.topologyVersions()])
    activeTopo.value = a
    versions.value = vs
    await loadDevices()
  } catch (e) { console.error(e) }
}
async function loadDevices() {
  devicesLoading.value = true
  try { devices.value = await api.devices() } catch (e) { console.error(e) }
  devicesLoading.value = false
}
const devOption = (d: Device) => `${d.name}（${d.ip || '无IP'}）`

// 选中节点 → 填面板 + 关联设备
function onNodeClick(node) {
  engine?.selectNode(node)
  tab.value = 'node'
  nLabel.value = node.label
  // 引擎节点实例无 color 字段（serialize 时才还原），回退 fillColor → 组件默认色
  nColor.value = toHex(node.color || node.fillColor || (DEVICE_MAP[node.type] || {}).c || '74,144,217')
  nSize.value = node.size || 60
  nRemark.value = node.properties?.remark || ''
  devSelect.value = (node.properties && node.properties.deviceId) || ''
  linkedDev.value = devices.value.find((d) => d.id === devSelect.value) || null
  updateStat()
}
function onLinkClick(link) {
  engine?.deselectAll()
  const g = engine?.graph
  if (g) g.currentLink = link
  tab.value = 'link'
  lLabel.value = link.label || ''
  lColor.value = toHex(link.color || '154,163,173')
  lWidth.value = link.lineWidth || 2
  lDash.value = (link.lineDash && link.lineDash.length && link.lineDash[0] > 0) ? '6,4' : '0'
  lArrow.value = link.showArrow ? '1' : '0'
}

function saveNode() {
  const n = engine?.currentNode
  if (!n) { setStatus('未选中节点', true); return }
  n.label = nLabel.value || n.label
  n.color = hexToRgb(nColor.value)
  n.fillColor = n.color
  n.size = parseInt(nSize.value, 10) || n.size
  n.radius = n.size / 2
  n.properties = n.properties || {}
  n.properties.remark = nRemark.value
  if (devSelect.value) n.properties.deviceId = devSelect.value
  else delete n.properties.deviceId
  linkedDev.value = devices.value.find((d) => d.id === devSelect.value) || null
  engine?.updateNode(n, {})
  setStatus('节点已保存')
  updateStat()
  dirty.value = true
}
function delNode() {
  const n = engine?.currentNode
  if (!n) { setStatus('未选中节点', true); return }
  engine?.deleteNode(n)
  engine?.deselectAll()
  setStatus('节点已删除')
  dirty.value = true
}
function saveLink() {
  const l = engine?.graph?.currentLink
  if (!l) { setStatus('未选中连线', true); return }
  engine?.updateLink(l, {
    label: lLabel.value, color: hexToRgb(lColor.value),
    lineWidth: parseInt(lWidth.value, 10) || 2,
    lineDash: lDash.value === '0' ? [0] : [6, 4],
    showArrow: lArrow.value === '1',
  })
  setStatus('连线已保存')
  dirty.value = true
}
function delLink() {
  const l = engine?.graph?.currentLink
  if (!l) { setStatus('未选中连线', true); return }
  engine?.deleteLink(l)
  setStatus('连线已删除')
  dirty.value = true
}
function applyGlobal() {
  const g = engine?.graph
  if (!g) return
  const lw = parseInt(lWidth.value, 10) || 2
  const col = hexToRgb(lColor.value)
  ;(g.links || []).forEach((l) => { l.lineWidth = lw; l.color = col })
  g.refresh?.()
  setStatus('全局配置已应用')
  dirty.value = true
}

// 工具栏
function onTool(act) {
  if (act === 'zoomIn') engine?.graph?.zoomIn?.()
  else if (act === 'zoomOut') engine?.graph?.zoomOut?.()
  else if (act === 'fit') { if (engine?.graph?.moveCenter) engine.graph.moveCenter() }
  else if (act === 'undo') { if (engine?.undo()) { setStatus('已撤销'); updateStat() } }
  else if (act === 'redo') { if (engine?.redo()) { setStatus('已重做'); updateStat() } }
  else if (act === 'delSel') {
    if (engine?.currentNode) delNode()
    else if (engine?.graph?.currentLink) delLink()
    else setStatus('未选中', true)
  }
  else if (act === 'savePng') {
    const url = engine?.toPng()
    if (url) { const a = document.createElement('a'); a.href = url; a.download = 'topology-' + Date.now() + '.png'; a.click(); setStatus('已导出 PNG') }
  }
  else if (act === 'group') { const r = engine?.groupFromSelection(); if (r) { setStatus(r.msg, !r.ok); if (r.ok) dirty.value = true; updateStat() } }
  else if (act === 'ungroup') { const r = engine?.ungroupCurrent(); if (r) { setStatus(r.msg, !r.ok); if (r.ok) dirty.value = true; updateStat() } }
  zoom.value = engine?.zoomInfo() || zoom.value
}
function addDevice(key) {
  const nd = engine?.addNode({ type: key, label: DEVICE_MAP[key].name, color: DEVICE_MAP[key].c })
  if (nd) { onNodeClick(nd); setStatus('已添加：' + DEVICE_MAP[key].name); dirty.value = true }
}
function onDblClick(node) { engine?.startLinkFrom(node); setStatus('连线模式：点击目标节点完成连线（Esc 取消）') }
function onLinkDone() { setStatus('连线完成'); dirty.value = true; updateStat() }

// 分组弹窗
function onGroupDblClick(group) {
  editingGroup = group
  gr.value = {
    label: group.label || '', shape: group.shape || 'rect', padding: group.padding != null ? group.padding : 40,
    alpha: group.alpha != null ? group.alpha : 0.8, borderWidth: group.borderWidth != null ? group.borderWidth : 1,
    borderColor: toHex(group.borderColor || '40,120,220'), dash: (group.dash && group.dash.length) ? '[' + group.dash.join(',') + ']' : '',
    font: group.font || 'normal 14px Arial', textAlign: group.textAlign || 'center',
    fontColor: toHex(group.fontColor || '255,255,255'), fillColor: toHex(group.fillColor || '180,210,255'),
    headerColor: toHex(group.headerColor || '60,106,208'),
  }
  groupDlg.value = true
}
function saveGroup() {
  if (!editingGroup) return
  const st = {
    label: gr.value.label || '未命名分组', shape: gr.value.shape,
    padding: parseInt(gr.value.padding, 10) || 0,
    alpha: Math.min(1, Math.max(0.1, parseFloat(gr.value.alpha) || 1)),
    headerAlpha: Math.min(1, Math.max(0.1, parseFloat(gr.value.alpha) || 1)),
    borderWidth: parseInt(gr.value.borderWidth, 10) || 0,
    borderColor: hexToRgb(gr.value.borderColor),
    dash: (gr.value.dash || '').replace(/[\[\]\s]/g, '').split(',').filter(Boolean).map(Number),
    font: gr.value.font || 'normal 14px Arial', textAlign: gr.value.textAlign,
    fontColor: hexToRgb(gr.value.fontColor), fillColor: hexToRgb(gr.value.fillColor),
    headerColor: hexToRgb(gr.value.headerColor),
  }
  applyGroupStyle(engine.graph, editingGroup, st)
  groupDlg.value = false
  editingGroup = null
  setStatus('分组设置已保存')
  dirty.value = true
}

// 保存 / 版本
async function saveTopology() {
  const canvas = engine?.serialize()
  if (!canvas) return
  saving.value = true
  setStatus('保存中…')
  try {
    const name = activeTopo.value?.name || '默认拓扑'
    const v = await api.saveTopology(name, canvas)
    setStatus(`已保存为新版本 v${v.version}${v.is_active ? '（已激活）' : ''}`)
    dirty.value = false
    activeTopo.value.id = v.id
    activeTopo.value.version = v.version
    await loadAll()
  } catch (e) {
    // 422：FastAPI detail 为对象（missing_devices / errors），api client 序列化成 JSON 字符串
    const msg = String(e?.message || e)
    let j = null
    try { j = JSON.parse(msg) } catch { /* 非 JSON */ }
    if (j && j.missing_devices) setStatus('关联设备不存在：' + j.missing_devices.join('、') + '（请在下拉框改选已有设备）', true)
    else if (j && j.errors) setStatus('canvas 校验失败：' + j.errors.join('；'), true)
    else setStatus('保存失败：' + msg, true)
  }
  saving.value = false
}
async function activateVersion(id: number) {
  try {
    await api.activateTopology(id)
    setStatus('已激活该版本')
    await loadAll()
    engine?.renderCanvas(activeTopo.value.canvas)
    setStatus(`已切换到 v${activeTopo.value.version}（${activeTopo.value.name}）`)
  } catch (e) { setStatus('激活失败：' + e, true) }
}

function gotoDevice(id: string) {
  if (linkedDev.value?.id === id) return
  devSelect.value = id
  saveNode()
}

onMounted(async () => {
  await new Promise<void>((res) => {
    if (window.VisGraph) return res()
    let n = 0
    const t = setInterval(() => { if (window.VisGraph || ++n > 100) { clearInterval(t); res() } }, 100)
  })
  engine = new TopoEngine(box.value!, {
    onNodeClick,
    onNodeDblClick: onDblClick,
    onLinkClick,
    onLinkDone,
    onEmptyClick: () => engine?.deselectAll(),
    onSelection: () => updateStat(),
    onGroupDblClick,
  })
  engine.init(null)
  await loadAll()
  engine.renderCanvas(activeTopo.value?.canvas)
  setTimeout(() => {
    if (engine?.graph) fitToView(engine.graph)
    zoom.value = engine?.zoomInfo() || zoom.value
  }, 60)
  // 从抽屉跳转：定位节点并填节点面板（便于直接「关联设备」）
  const nid = route.query.node
  if (nid) setTimeout(() => {
    const n = engine?.findNodeSafe ? engine.findNodeSafe(String(nid)) : null
    if (n) { onNodeClick(n); if (engine?.graph?.moveCenter) engine.graph.moveCenter() }
    else engine?.focusNode(String(nid))
  }, 150)
  // 快捷键
  window.addEventListener('keydown', onKey)
  // 画布 drop
  bindDrop()
})
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { engine?.cancelLinkMode(); groupDlg.value = false }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); onTool('undo') }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); onTool('redo') }
}
function bindDrop() {
  const p = box.value
  if (!p) return
  p.addEventListener('dragover', (e) => e.preventDefault())
  p.addEventListener('drop', (e) => {
    e.preventDefault()
    const key = e.dataTransfer.getData('device')
    if (key) addDevice(key)
  })
}
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); engine?.dispose() })
</script>

<template>
  <div class="ed">
    <header class="topbar">
      <div class="logo">IT 运维<span>拓扑编辑器</span></div>
      <div class="nav">
        <router-link to="/">总览</router-link>
        <router-link to="/editor" class="active">拓扑编辑</router-link>
      </div>
      <div class="topbar-right">
        <span v-if="dirty" class="dirty">● 未保存</span>
        <span class="save-status" :class="{ warn: statusWarn }">{{ statusMsg }}</span>
      </div>
    </header>

    <div class="main">
      <!-- 左：组件面板 -->
      <aside class="palette">
        <div class="palette-head">立体网络组件</div>
        <div class="icon-grid">
          <div v-for="d in DEVICES" :key="d.key" class="icon-item" draggable="true"
               :title="d.name" @dragstart="$event.dataTransfer.setData('device', d.key)"
               @click="addDevice(d.key)">
            <img class="icon-img" :src="'/topology/icons/' + d.icon" :alt="d.name" draggable="false">
            <span class="nm">{{ d.name }}</span>
          </div>
        </div>
      </aside>

      <!-- 中：画布 -->
      <section class="canvas-wrap">
        <div class="toolbar">
          <button title="放大" @click="onTool('zoomIn')">＋</button>
          <button title="缩小" @click="onTool('zoomOut')">－</button>
          <button title="自适应" @click="onTool('fit')">⛶</button>
          <span class="sep"></span>
          <button title="撤销" @click="onTool('undo')">↶</button>
          <button title="重做" @click="onTool('redo')">↷</button>
          <span class="sep"></span>
          <button title="删除选中" @click="onTool('delSel')">🗑</button>
          <button title="下载 PNG" @click="onTool('savePng')">⬇</button>
          <span class="sep"></span>
          <button title="将选中节点设为分组（先 Ctrl+点击多选）" @click="onTool('group')">⧉</button>
          <button title="解散分组" @click="onTool('ungroup')">⨯</button>
          <span class="sep"></span>
          <button class="primary" title="保存为新版本" :disabled="saving" @click="saveTopology">💾 保存</button>
          <span class="zoom-label">{{ zoom }}</span>
          <span class="stat">{{ stat }}</span>
        </div>
        <div ref="box" class="graph-panel"></div>
      </section>

      <!-- 右：设置面板 -->
      <aside class="settings">
        <div class="tabs-r">
          <span class="tab-r" :class="{ active: tab === 'global' }" @click="tab = 'global'">全局</span>
          <span class="tab-r" :class="{ active: tab === 'node' }" @click="tab = 'node'">节点</span>
          <span class="tab-r" :class="{ active: tab === 'link' }" @click="tab = 'link'">连线</span>
        </div>

        <!-- 版本管理 -->
        <div class="sec ver">
          <label>版本（点击切换/激活）</label>
          <select :value="activeTopo?.id" @change="activateVersion(Number($event.target.value))">
            <option v-for="v in versions" :key="v.id" :value="v.id">
              v{{ v.version }} · {{ v.name }}{{ v.is_active ? '（生效）' : '' }}
            </option>
          </select>
        </div>

        <!-- 全局设置 -->
        <div class="tab-body" v-show="tab === 'global'">
          <p class="hint">连线全局样式（应用到所有连线）</p>
          <label>连线宽度</label><input type="number" v-model.number="lWidth" min="1" max="10">
          <label>连线颜色</label><input type="color" v-model="lColor">
          <button class="primary" @click="applyGlobal">应用全局</button>
        </div>

        <!-- 节点设置 -->
        <div class="tab-body" v-show="tab === 'node'">
          <p class="hint">先点击画布中的节点，再编辑</p>
          <label>名称</label><input v-model="nLabel" placeholder="节点名称">
          <label>填充颜色</label><input type="color" v-model="nColor">
          <label>节点大小</label><input type="number" v-model.number="nSize" min="40" max="120">
          <label>备注</label><textarea v-model="nRemark" rows="2" placeholder="备注信息"></textarea>

          <div class="dev-block">
            <div class="dev-head">关联设备 <button class="mini" @click="loadDevices" title="刷新设备列表">⟳</button></div>
            <select v-model="devSelect" :disabled="devicesLoading">
              <option value="">— 未关联（显示为「未纳管」）—</option>
              <option v-for="d in devices" :key="d.id" :value="d.id">{{ devOption(d) }}</option>
            </select>
            <div v-if="linkedDev" class="dev-card">
              <div class="dc-row"><b :class="'s-' + linkedDev.status">{{ linkedDev.name }}</b>
                <span class="dot" :class="'s-' + linkedDev.status"></span></div>
              <div class="dc-row dim">状态 {{ { normal: '正常', warn: '警告', alert: '严重' }[linkedDev.status] }} · {{ linkedDev.ip || '无IP' }}</div>
              <div class="dc-row dim">机房 {{ linkedDev.location || '—' }} · 责任人 {{ linkedDev.owner || '—' }}</div>
              <a class="dc-link" :href="'/devices/' + linkedDev.id" target="_blank">查看设备详情 →</a>
            </div>
          </div>

          <button class="primary" @click="saveNode">保存节点</button>
          <button class="danger" @click="delNode">删除节点</button>
        </div>

        <!-- 连线设置 -->
        <div class="tab-body" v-show="tab === 'link'">
          <p class="hint">先点击画布中的连线，再编辑</p>
          <label>标签</label><input v-model="lLabel" placeholder="连线标签">
          <label>颜色</label><input type="color" v-model="lColor">
          <label>宽度</label><input type="number" v-model.number="lWidth" min="1" max="10">
          <label>虚线</label>
          <select v-model="lDash"><option value="0">实线</option><option value="6,4">虚线</option></select>
          <label>箭头</label>
          <select v-model="lArrow"><option value="0">无</option><option value="1">有</option></select>
          <button class="primary" @click="saveLink">保存连线</button>
          <button class="danger" @click="delLink">删除连线</button>
        </div>
      </aside>
    </div>

    <!-- 分组设置弹窗 -->
    <div v-if="groupDlg" class="dlg-mask" @mousedown.self="groupDlg = false">
      <div class="dlg">
        <div class="dlg-h">分组设置</div>
        <label>名称</label><input v-model="gr.label" maxlength="10">
        <label>形状</label><select v-model="gr.shape"><option value="rect">直角</option><option value="round">圆角</option></select>
        <label>内边距</label><input type="number" v-model.number="gr.padding" min="0" max="120">
        <label>透明度</label><input type="number" v-model.number="gr.alpha" min="0.1" max="1" step="0.1">
        <label>边框宽度</label><input type="number" v-model.number="gr.borderWidth" min="0" max="10">
        <label>边框颜色</label><input type="color" v-model="gr.borderColor">
        <label>边框虚线</label><input v-model="gr.dash" placeholder="[6,4]">
        <label>填充颜色</label><input type="color" v-model="gr.fillColor">
        <label>头部颜色</label><input type="color" v-model="gr.headerColor">
        <label>字体颜色</label><input type="color" v-model="gr.fontColor">
        <div class="dlg-f">
          <button @click="groupDlg = false">取消</button>
          <button class="primary" @click="saveGroup">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ed { height: 100vh; display: flex; flex-direction: column; background: var(--bg); color: var(--text); }
.topbar { height: 52px; flex-shrink: 0; display: flex; align-items: center; padding: 0 18px; background: var(--bg-2); border-bottom: 1px solid var(--border); }
.logo { font-size: 17px; font-weight: 600; color: var(--accent); }
.logo span { font-size: 12px; color: var(--text-dim); margin-left: 6px; font-weight: 400; }
.nav { margin-left: 40px; display: flex; gap: 4px; }
.nav a { padding: 0 16px; color: var(--text-dim); text-decoration: none; font-size: 14px; }
.nav a.active { color: var(--accent); font-weight: 500; }
.topbar-right { margin-left: auto; display: flex; align-items: center; gap: 14px; }
.dirty { color: var(--warn); font-size: 12px; }
.save-status { color: var(--ok); font-size: 13px; }
.save-status.warn { color: var(--crit); }

.main { flex: 1; display: flex; min-height: 0; }
.palette { width: 220px; flex-shrink: 0; background: var(--bg-2); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
.palette-head { padding: 12px 16px; font-weight: 600; font-size: 13.5px; color: var(--text); border-bottom: 1px solid var(--border); }
.icon-grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 10px; align-content: start; }
.icon-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 2px 6px; border: 1px solid transparent; border-radius: 6px; cursor: grab; user-select: none; }
.icon-item:hover { background: rgba(47,123,255,.12); border-color: var(--border); }
.icon-item .icon-img { width: 50px; height: 38px; object-fit: contain; pointer-events: none; }
.icon-item .nm { font-size: 11px; color: var(--text-dim); text-align: center; line-height: 1.2; }

.canvas-wrap { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.toolbar { height: 42px; flex-shrink: 0; display: flex; align-items: center; gap: 2px; padding: 0 10px; background: var(--bg-2); border-bottom: 1px solid var(--border); }
.toolbar button { width: 32px; height: 32px; border: 1px solid transparent; background: none; border-radius: 5px; font-size: 15px; cursor: pointer; color: var(--text); }
.toolbar button:hover { background: rgba(47,123,255,.15); border-color: var(--border); }
.toolbar button.primary { width: auto; padding: 0 14px; background: var(--accent); color: #fff; border-color: var(--accent); font-size: 13px; }
.toolbar button.primary:disabled { opacity: .6; cursor: not-allowed; }
.sep { width: 1px; height: 20px; background: var(--border); margin: 0 7px; }
.zoom-label { font-size: 12.5px; color: var(--text-dim); margin-left: 4px; min-width: 44px; }
.stat { font-size: 12px; color: var(--text-dim); margin-left: 14px; }
.graph-panel { flex: 1; position: relative; background: #0d1a30; }

.settings { width: 280px; flex-shrink: 0; background: var(--bg-2); border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow-y: auto; }
.tabs-r { display: flex; border-bottom: 1px solid var(--border); }
.tab-r { flex: 1; text-align: center; padding: 10px 0; font-size: 13px; color: var(--text-dim); cursor: pointer; border-bottom: 2px solid transparent; }
.tab-r.active { color: var(--accent); border-bottom-color: var(--accent); }
.ver { padding: 10px 12px; border-bottom: 1px solid var(--border); }
.label, label { display: block; font-size: 12px; color: var(--text-dim); margin: 8px 0 3px; }
.tab-body { padding: 6px 14px 14px; }
.hint { font-size: 11px; color: var(--text-dim); opacity: .8; }
input, select, textarea { width: 100%; padding: 6px 8px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-size: 13px; box-sizing: border-box; }
input[type=color] { padding: 2px; height: 30px; }
button.primary { width: 100%; margin-top: 12px; padding: 8px; border: none; border-radius: 7px; background: var(--accent); color: #fff; cursor: pointer; font-size: 13px; }
button.danger { width: 100%; margin-top: 8px; padding: 8px; border: 1px solid var(--crit); border-radius: 7px; background: none; color: var(--crit); cursor: pointer; font-size: 13px; }

.dev-block { margin-top: 14px; padding: 10px; border: 1px dashed var(--border); border-radius: 8px; }
.dev-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--text-dim); margin-bottom: 6px; }
.mini { border: 1px solid var(--border); background: none; color: var(--text-dim); border-radius: 4px; cursor: pointer; padding: 1px 6px; }
.dev-card { margin-top: 8px; padding: 8px; border-radius: 7px; background: var(--bg); }
.dc-row { font-size: 12px; color: var(--text); margin: 3px 0; display: flex; align-items: center; gap: 6px; }
.dc-row b { font-weight: 600; }
.dc-row .s-normal { color: var(--ok); } .dc-row .s-warn { color: var(--warn); } .dc-row .s-alert { color: var(--crit); }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.s-normal { background: var(--ok); } .dot.s-warn { background: var(--warn); } .dot.s-alert { background: var(--crit); }
.dc-link { font-size: 11px; color: var(--accent); text-decoration: none; }

.dlg-mask { position: fixed; inset: 0; z-index: 200; background: rgba(4,10,22,.6); display: flex; align-items: center; justify-content: center; }
.dlg { width: 340px; max-height: 86vh; overflow-y: auto; background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.dlg-h { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.dlg-f { display: flex; gap: 8px; margin-top: 14px; }
.dlg-f button { flex: 1; padding: 8px; border-radius: 7px; border: 1px solid var(--border); background: none; color: var(--text); cursor: pointer; }
.dlg-f button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
</style>
