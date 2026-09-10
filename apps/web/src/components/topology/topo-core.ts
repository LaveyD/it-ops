// @ts-nocheck
/*
 * topo-core —— GraphVis 引擎（黑盒 UMD，全局 VisGraph）的封装核心。
 * 移植自 /data/project/dct/graph-vis-v1/demo-site/topology/topology.js（最小改动）：
 *   - 保留 3D 图标绘制（官方 PNG + 手绘立方体回退）、分组、序列化、撤销/重做
 *   - 去除 DOM id 耦合：面板/工具栏交互全部通过 opts 回调交给 Vue 壳
 *   - 新增四态渲染（normal / warn / alert 呼吸灯 / unmanaged）供大屏只读用
 * 引擎要求：index.html 已加载 /topology/lib/graphvis.min.js（window.VisGraph）。
 */

export const ICON_URL = '/topology/icons/'

// 设备组件定义（官方 3D 图标，来自 graphvis.cn/topo3d）
// c = 主题色 "r,g,b"（fallback 立方体用），icon = 官方等距 3D 图标，glyph = fallback 正面小图标
export const DEVICES = [
  { key: 'router', name: '路由器', c: '46,108,220', glyph: 'router', icon: 'a-ziyuan52.png' },
  { key: 'core', name: '核心交换机', c: '38,166,154', glyph: 'switch', icon: 'a-ziyuan53.png' },
  { key: 'atm', name: 'ATM路由器', c: '116,120,224', glyph: 'router', icon: 'a-ziyuan54.png' },
  { key: 'switch', name: '交换机', c: '52,152,219', glyph: 'switch', icon: 'a-ziyuan55.png' },
  { key: 'aggr', name: '汇聚交换机', c: '41,128,185', glyph: 'switch', icon: 'a-ziyuan57.png' },
  { key: 'db', name: '数据库', c: '155,89,182', glyph: 'db', icon: 'a-ziyuan58.png' },
  { key: 'pool', name: '资源池', c: '224,148,66', glyph: 'pool', icon: 'a-ziyuan59.png' },
  { key: 'server', name: '服务器', c: '52,160,120', glyph: 'server', icon: 'a-ziyuan60.png' },
  { key: 'mgmt', name: '综合管理系统', c: '230,90,120', glyph: 'mgmt', icon: 'a-ziyuan61.png' },
  { key: 'gateway', name: '智能家庭网关', c: '224,110,60', glyph: 'gateway', icon: 'a-ziyuan63.png' },
  { key: 'idc', name: 'IDC资源', c: '90,120,200', glyph: 'idc', icon: 'a-ziyuan64.png' },
  { key: 'room', name: '计算机房', c: '90,120,200', glyph: 'idc', icon: 'a-ziyuan66.png' },
  { key: 'firewall', name: '防火墙', c: '214,80,80', glyph: 'firewall', icon: 'a-ziyuan67.png' },
  { key: 'collect', name: '采集设备', c: '90,140,200', glyph: 'collect', icon: 'a-ziyuan68.png' },
  { key: 'biz', name: '业务设备', c: '80,150,170', glyph: 'biz', icon: 'a-ziyuan69.png' },
  { key: 'optic', name: '光切换设备', c: '120,130,210', glyph: 'optic', icon: 'a-ziyuan70.png' },
  { key: '1u', name: '1U服务器', c: '70,160,150', glyph: 'server', icon: 'a-ziyuan76.png' },
  { key: '2u', name: '2U服务器', c: '60,150,160', glyph: 'server', icon: 'a-ziyuan77.png' },
  { key: 'app', name: '应用系统', c: '80,150,170', glyph: 'biz', icon: 'a-ziyuan84.png' },
  { key: 'plat', name: '管理平台', c: '230,90,120', glyph: 'mgmt', icon: 'a-ziyuan85.png' },
  { key: 'cloud', name: '云服务', c: '70,160,180', glyph: 'pool', icon: 'a-ziyuan95.png' },
  { key: 'sec', name: '网络安全', c: '214,120,80', glyph: 'firewall', icon: 'a-ziyuan96.png' },
  { key: 'home', name: '家庭', c: '224,148,66', glyph: 'pool', icon: 'a-ziyuan91.png' },
  { key: 'corp', name: '公司', c: '120,140,210', glyph: 'idc', icon: 'a-ziyuan92.png' },
  { key: 'factory', name: '工厂', c: '200,120,90', glyph: 'mgmt', icon: 'a-ziyuan93.png' },
  { key: 'apt', name: '公寓', c: '150,120,200', glyph: 'idc', icon: 'a-ziyuan94.png' },
]
export const DEVICE_MAP = {}
DEVICES.forEach((d) => { DEVICE_MAP[d.key] = d })

// 状态配色（与大屏暗色主题一致）
export const STATUS_RGB = { warn: '250,173,20', alert: '255,77,79', unmanaged: '125,147,178' }

// ===== 图标预加载（官方 PNG；缺失回退手绘立方体）=====
export const iconCache = {}
export function loadIcons(onEach) {
  DEVICES.forEach((d) => {
    if (!d.icon || iconCache[d.icon]) return
    const img = new Image()
    img.onload = () => { iconCache[d.icon] = img; if (onEach) onEach(d.icon) }
    img.onerror = () => { /* 缺失则回退手绘 */ }
    img.src = ICON_URL + d.icon
  })
}

// ===== 颜色工具 =====
export function shade(rgb, f) {
  return rgb.split(',').map((v) => Math.max(0, Math.min(255, Math.round(v * f)))).join(',')
}
export function toHex(rgb) {
  return '#' + rgb.split(',').map((v) => {
    v = Math.max(0, Math.min(255, parseInt(v, 10)))
    return ('0' + v.toString(16)).slice(-2)
  }).join('')
}
export function hexToRgb(hex) {
  hex = (hex || '#4a7bd0').replace('#', '')
  return [0, 2, 4].map((i) => parseInt(hex.substr(i, 2), 16)).join(',')
}

// 手绘小图标（官方 PNG 缺失时画在立方体顶面）
function drawGlyph(ctx, type, R) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = Math.max(1.4, R * 0.09)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const s = R * 0.5
  switch (type) {
    case 'router':
      ctx.strokeRect(-s, -s * 0.5, s * 2, s)
      ctx.beginPath(); ctx.moveTo(-s * 0.5, 0); ctx.lineTo(s * 0.3, 0); ctx.lineTo(s * 0.05, -s * 0.22); ctx.moveTo(s * 0.3, 0); ctx.lineTo(s * 0.05, s * 0.22); ctx.stroke()
      break
    case 'switch':
      ctx.strokeRect(-s, -s * 0.5, s * 2, s)
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.5, i * s * 0.25); ctx.lineTo(s * 0.5, i * s * 0.25); ctx.stroke() }
      break
    case 'db':
      ctx.beginPath(); ctx.ellipse(0, -s * 0.45, s * 0.7, s * 0.3, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-s * 0.7, -s * 0.45); ctx.lineTo(-s * 0.7, s * 0.45); ctx.moveTo(s * 0.7, -s * 0.45); ctx.lineTo(s * 0.7, s * 0.45); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(0, s * 0.45, s * 0.7, s * 0.3, 0, 0, Math.PI); ctx.stroke()
      break
    case 'server':
      for (let r = -1; r <= 1; r++) { ctx.strokeRect(-s * 0.8, r * s * 0.42 - s * 0.16, s * 1.6, s * 0.32); ctx.beginPath(); ctx.arc(s * 0.5, r * s * 0.42, s * 0.06, 0, Math.PI * 2); ctx.fill() }
      break
    case 'firewall':
      ctx.strokeRect(-s, -s * 0.55, s * 2, s * 1.1)
      ctx.beginPath(); ctx.moveTo(-s, -s * 0.18); ctx.lineTo(s, -s * 0.18); ctx.moveTo(-s, s * 0.18); ctx.lineTo(s, s * 0.18); ctx.stroke()
      break
    case 'pool':
      ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2); ctx.fill()
      break
    case 'mgmt':
    case 'idc':
      ctx.strokeRect(-s, -s * 0.6, s * 2, s * 1.2)
      ctx.beginPath(); ctx.moveTo(-s * 0.4, s * 0.15); ctx.lineTo(-s * 0.1, -s * 0.15); ctx.lineTo(s * 0.2, s * 0.05); ctx.lineTo(s * 0.5, -s * 0.25); ctx.stroke()
      break
    case 'gateway':
      ctx.strokeRect(-s * 0.7, -s * 0.5, s * 1.4, s)
      ctx.beginPath(); ctx.arc(0, s * 0.1, s * 0.3, Math.PI, 0); ctx.stroke()
      break
    case 'collect':
      ctx.strokeRect(-s * 0.7, -s * 0.5, s * 1.4, s)
      ctx.beginPath(); ctx.moveTo(0, s * 0.3); ctx.lineTo(0, -s * 0.2); ctx.moveTo(-s * 0.2, 0); ctx.lineTo(0, -s * 0.25); ctx.lineTo(s * 0.2, 0); ctx.stroke()
      break
    case 'biz':
    case 'optic':
      ctx.strokeRect(-s * 0.8, -s * 0.5, s * 1.6, s)
      ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.stroke()
      break
    default:
      ctx.strokeRect(-s * 0.7, -s * 0.5, s * 1.4, s)
  }
  ctx.restore()
}

// ===== 手绘立方体（官方图标缺失时的回退）=====
function drawCube(ctx, R, base, glyph) {
  const hw = R * 1.05, hh = R * 0.6, d = R * 0.95
  ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.lineTo(0, 2 * hh); ctx.lineTo(0, 2 * hh + d); ctx.lineTo(-hw, d); ctx.closePath()
  ctx.fillStyle = 'rgba(' + shade(base, 0.62) + ',1)'; ctx.fill()
  ctx.beginPath(); ctx.moveTo(0, 2 * hh); ctx.lineTo(hw, 0); ctx.lineTo(hw, d); ctx.lineTo(0, 2 * hh + d); ctx.closePath()
  ctx.fillStyle = 'rgba(' + shade(base, 0.82) + ',1)'; ctx.fill()
  ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(hw, 0); ctx.lineTo(0, 2 * hh); ctx.lineTo(-hw, 0); ctx.closePath()
  ctx.fillStyle = 'rgba(' + shade(base, 1.08) + ',1)'; ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1
  ctx.stroke()
  drawGlyph(ctx, glyph, R)
}

// 四态判定：deviceId → devices 映射。
// normal: 设备 status=normal；warn: 黄光晕+⚠；alert: 红光晕+呼吸灯+⚠；unmanaged: 半透明+「未纳管」
export function nodeState(node, devices) {
  const did = node.properties && node.properties.deviceId
  const dev = did ? devices[did] : null
  if (!dev) return 'unmanaged'
  if (dev.status === 'alert') return 'alert'
  if (dev.status === 'warn') return 'warn'
  return 'normal'
}

// 覆盖默认节点绘制：优先官方 3D 图标 + 四态效果，未加载图标时回退手绘立方体
function makeDrawNode(graph, device, dark) {
  return function (ctx) {
    const R = this.radius || 30
    const base = this.fillColor || device.c
    const isSel = !!this.selected || (graph && graph.currentNode === this)
    const state = nodeState(this, graph._devices || {})

    // 四态光晕（alert 为呼吸灯，opacity 随时间变化）
    if (state === 'warn' || state === 'alert') {
      const col = STATUS_RGB[state]
      const t = performance.now() / 1000
      const pulse = state === 'alert' ? (0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3.2))) : 0.5
      ctx.save()
      ctx.globalAlpha = pulse
      ctx.shadowColor = 'rgba(' + col + ',1)'
      ctx.shadowBlur = R * 0.9
      ctx.fillStyle = 'rgba(' + col + ',' + (0.28 * pulse + 0.1) + ')'
      ctx.beginPath(); ctx.arc(0, R * 0.2, R * 1.3, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
    if (isSel) {
      ctx.save()
      ctx.strokeStyle = 'rgba(47,123,255,0.9)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath(); ctx.arc(0, R * 0.2, R * 1.55, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }

    // unmanaged 降透明度
    if (state === 'unmanaged') ctx.globalAlpha = 0.65

    const img = device.icon ? iconCache[device.icon] : null
    let imgBottom
    if (img && img.complete && img.naturalWidth) {
      const iw = R * 1.9
      const ih = iw * (img.naturalHeight / img.naturalWidth)
      const left = -iw / 2
      const top = -ih / 2 - R * 0.05
      ctx.save()
      ctx.globalAlpha = (state === 'unmanaged' ? 0.6 : 1) * 0.22
      ctx.fillStyle = '#1b2740'
      ctx.beginPath(); ctx.ellipse(0, top + ih - 1, iw * 0.34, ih * 0.11, 0, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
      ctx.drawImage(img, left, top, iw, ih)
      imgBottom = top + ih
    } else {
      drawCube(ctx, R, base, device.glyph)
      imgBottom = 2 * R * 0.6 + R * 0.95
    }

    // 标签
    ctx.save()
    ctx.font = '12px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const ly = imgBottom + 5
    let label = this.label || ''
    if (state === 'warn' || state === 'alert') label += ' ⚠'
    if (state === 'unmanaged') label += ' · 未纳管'
    const w = ctx.measureText(label).width
    ctx.globalAlpha = 1
    ctx.fillStyle = dark ? 'rgba(13,26,48,0.82)' : 'rgba(255,255,255,0.85)'
    ctx.fillRect(-w / 2 - 4, ly - 2, w + 8, 17)
    ctx.fillStyle = dark ? '#cfe0f5' : '#3a4150'
    if (state === 'unmanaged') ctx.fillStyle = dark ? '#8ea3bf' : '#8a97a8'
    ctx.fillText(label, 0, ly)
    ctx.restore()
  }
}

// ===== 分组默认样式 + 补丁（引擎 Group 无 dash/round 支持）=====
export const GROUP_DEFAULTS = {
  label: '', shape: 'rect', padding: 40, alpha: 0.8,
  borderWidth: 1, borderColor: '40,120,220', dash: [],
  font: 'normal 14px Arial', textAlign: 'center', fontColor: '255,255,255',
  fillColor: '180,210,255', headerColor: '60,106,208',
  headerHeight: 36, textOffsetX: 6, selectedBorderColor: '47,123,255', selectedBorderWidth: 2,
}
function roundRectPath(ctx, x, y, w, h, r) {
  if (w <= 0 || h <= 0) { ctx.rect(x, y, w, h); return }
  if (r > w / 2) r = w / 2
  if (r > h / 2) r = h / 2
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
function attachGroupPaint(gr) {
  if (gr._paintPatched) return
  const origPaint = gr.paint, origText = gr.paintText
  gr._paintPatched = true
  gr.paint = function (ctx) {
    const r = gr.shape === 'round' ? 10 : 0
    if (r > 0) {
      if (gr.visible && !gr.fixed) gr.ajustSize()
      ctx.save()
      ctx.beginPath(); roundRectPath(ctx, gr.x, gr.y, gr.width, gr.height, r); ctx.closePath()
      ctx.fillStyle = 'rgba(' + gr.fillColor + ',' + gr.alpha + ')'
      ctx.fill()
      if (!gr.selected && !gr.showSelected && gr.borderWidth > 0) {
        ctx.lineWidth = gr.borderWidth
        ctx.strokeStyle = 'rgba(' + gr.borderColor + ',' + gr.alpha + ')'
        ctx.setLineDash(gr.dash || [])
        ctx.stroke(); ctx.setLineDash([])
      }
      if ((gr.selected || gr.showSelected) && gr.selectedBorderWidth > 0) {
        ctx.lineWidth = gr.selectedBorderWidth
        ctx.strokeStyle = 'rgba(' + gr.selectedBorderColor + ',' + gr.alpha + ')'
        ctx.stroke()
      }
      if (gr.showHeader) {
        ctx.beginPath(); roundRectPath(ctx, gr.x, gr.y, gr.width, gr.headerHeight, r); ctx.closePath()
        ctx.fillStyle = 'rgba(' + gr.headerColor + ',' + gr.headerAlpha + ')'
        ctx.fill()
        const bw = (gr.selected || gr.showSelected) ? gr.selectedBorderWidth : gr.borderWidth
        if (bw > 0) {
          ctx.lineWidth = bw
          ctx.strokeStyle = 'rgba(' + (gr.selected ? gr.selectedBorderColor : gr.headerColor) + ',' + gr.alpha + ')'
          ctx.setLineDash(gr.dash || [])
          ctx.stroke(); ctx.setLineDash([])
        }
      }
      ctx.restore()
      if (gr.showHeader) origText.call(gr, ctx)
    } else {
      const hadDash = !!(gr.dash && gr.dash.length)
      if (hadDash) ctx.setLineDash(gr.dash)
      origPaint.call(gr, ctx)
      if (hadDash) ctx.setLineDash([])
    }
  }
}
export function applyGroupStyle(graph, gr, st) {
  if (st.label != null && String(st.label).length) gr.label = st.label
  if (st.padding != null) gr.padding = st.padding
  if (st.alpha != null) gr.alpha = st.alpha
  if (st.headerAlpha != null) gr.headerAlpha = st.headerAlpha
  if (st.borderWidth != null) gr.borderWidth = st.borderWidth
  if (st.borderColor != null) gr.borderColor = st.borderColor
  if (st.font != null) gr.font = st.font
  if (st.textAlign != null) gr.textAlign = st.textAlign
  if (st.fontColor != null) gr.fontColor = st.fontColor
  if (st.fillColor != null) gr.fillColor = st.fillColor
  if (st.headerColor != null) gr.headerColor = st.headerColor
  if (st.headerHeight != null) gr.headerHeight = st.headerHeight
  if (st.textOffsetX != null) gr.textOffsetX = st.textOffsetX
  if (st.selectedBorderColor != null) gr.selectedBorderColor = st.selectedBorderColor
  if (st.selectedBorderWidth != null) gr.selectedBorderWidth = st.selectedBorderWidth
  gr.dash = (st.dash != null) ? st.dash : []
  gr.shape = st.shape || 'rect'
  if (gr.ajustSize) gr.ajustSize()
  attachGroupPaint(gr)
  if (graph.refresh) graph.refresh()
}
export function getGroups(graph) {
  return ((graph && graph.scene) ? graph.scene.displayElements.groups : null) || []
}
export function groupOfNode(n) { return n.parentContainer || null }
export function currentGroup(graph) {
  const ce = graph.scene && graph.scene.currentElement
  return (ce && ce.elementType === 'group') ? ce : null
}
export function bindGroupEvents(graph, onGroupDblClick) {
  getGroups(graph).forEach((gr) => {
    if (gr._dblBound) return
    gr._dblBound = true
    gr.addEventListener('dbclick', () => { if (onGroupDblClick) onGroupDblClick(gr) })
  })
}
export function groupSeq(graph) {
  const gs = getGroups(graph)
  let m = 1
  gs.forEach((gr) => { const mm = /^分组\s*(\d+)$/.exec(gr.label); if (mm && +mm[1] >= m) m = +mm[1] + 1 })
  return '分组 ' + m
}

// 引擎 getGraphData() 返回活对象引用（Node↔Edge 循环），直接 JSON.stringify 会抛错，手动拍平
export function serializeGraph(graph) {
  const nodes = (graph.nodes || []).map((n) => ({
    id: n.id, label: n.label, type: n.type,
    color: n.color || n.fillColor, fillColor: n.fillColor,
    x: n.x, y: n.y, size: n.size, radius: n.radius, alpha: n.alpha,
    properties: n.properties || {},
  }))
  const links = (graph.links || []).map((l) => ({
    id: l.id,
    source: (l.source && typeof l.source === 'object') ? l.source.id : l.source,
    target: (l.target && typeof l.target === 'object') ? l.target.id : l.target,
    label: l.label, type: l.type, color: l.color,
    lineWidth: l.lineWidth, lineDash: l.lineDash, showArrow: l.showArrow,
  }))
  const groups = getGroups(graph).map((gr) => ({
    label: gr.label, shape: gr.shape || 'rect',
    padding: gr.padding, alpha: gr.alpha, headerAlpha: gr.headerAlpha,
    borderWidth: gr.borderWidth, borderColor: gr.borderColor,
    dash: gr.dash || [], font: gr.font, textAlign: gr.textAlign,
    fontColor: gr.fontColor, fillColor: gr.fillColor, headerColor: gr.headerColor,
    headerHeight: gr.headerHeight, textOffsetX: gr.textOffsetX,
    selectedBorderColor: gr.selectedBorderColor, selectedBorderWidth: gr.selectedBorderWidth,
    memberIds: (gr.childs || []).map((n) => n.id),
  }))
  return { nodes, links, groups }
}

// 按节点包围盒自适应缩放居中
export function fitToView(graph) {
  try {
    const nodes = graph.nodes || []
    if (!nodes.length) { if (graph.moveCenter) graph.moveCenter(); return }
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
    nodes.forEach((n) => {
      const r = (n.radius || 30)
      minX = Math.min(minX, n.x - r); maxX = Math.max(maxX, n.x + r)
      minY = Math.min(minY, n.y - r); maxY = Math.max(maxY, n.y + r + 26)
    })
    const bw = (maxX - minX) || 1, bh = (maxY - minY) || 1
    const w = graph.stage.width, h = graph.stage.height
    let scale = Math.min(w / bw, h / bh) * 0.92
    scale = Math.max(0.2, Math.min(3, scale))
    if (graph.moveCenter) graph.moveCenter(scale)
    else if (graph.setZoom) { graph.setZoom(scale); if (graph.moveCenter) graph.moveCenter() }
  } catch (e) { if (graph.moveCenter) graph.moveCenter() }
}

export function dataCenter(graph) {
  const nodes = graph.nodes || []
  if (!nodes.length) return { x: 0, y: 0 }
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
  nodes.forEach((n) => {
    const r = (n.radius || 30)
    minX = Math.min(minX, n.x - r); maxX = Math.max(maxX, n.x + r)
    minY = Math.min(minY, n.y - r); maxY = Math.max(maxY, n.y + r)
  })
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

export class TopoEngine {
  /**
   * @param container HTMLElement
   * @param opts {
   *   dark?: boolean,                // 暗色标签底（大屏）
   *   readOnly?: boolean,            // 只读（大屏 GraphView）
   *   onNodeClick?: (node) => void,
   *   onNodeDblClick?: (node) => void,
   *   onLinkClick?: (link) => void,
   *   onEmptyClick?: () => void,
   *   onNodeMove?: (node) => void,
   *   onSelection?: (count) => void,
   *   onLinkDone?: (link) => void,   // beginAddLine 完成
   * }
   */
  constructor(container, opts = {}) {
    this.container = container
    this.opts = opts
    this.graph = null
    this._devices = {}
    this._raf = null
    this._undo = []
    this._redo = []
    this._linkMode = false
    this._animating = false
  }

  init(canvas) {
    const G = window.VisGraph
    if (!G) throw new Error('VisGraph 引擎未加载（/topology/lib/graphvis.min.js）')
    const readOnly = !!this.opts.readOnly
    const cfg = {
      node: {
        label: { show: false }, shape: 'circle', color: '50,120,220', size: 60,
        selected: { showShadow: true, shadowBlur: 20, shadowColor: '47,123,255', borderWidth: 0 },
      },
      link: {
        label: { show: false }, lineType: 'direct', arrowType: 'thired',
        color: this.opts.dark ? '90,115,150' : '154,163,173', lineWidth: 2, lineDash: [0], showArrow: false,
      },
      highLightNeiber: false,
    }
    cfg.node.onClick = (event, node) => {
      if (this._linkMode) return
      if (readOnly) { if (this.opts.onNodeClick) this.opts.onNodeClick(node); return }
      this.selectNode(node, event)
    }
    cfg.node.ondblClick = (event, node) => {
      if (readOnly) return
      if (this.opts.onNodeDblClick) this.opts.onNodeDblClick(node)
      else this.startLinkFrom(node)
    }
    cfg.link.onClick = (event, link) => {
      if (this._linkMode || readOnly) return
      this.currentLink = link
      if (this.opts.onLinkClick) this.opts.onLinkClick(link)
      if (this.graph.refresh) this.graph.refresh()
    }
    cfg.noElementClick = () => {
      if (this._linkMode) this.cancelLinkMode()
      if (readOnly) { if (this.opts.onEmptyClick) this.opts.onEmptyClick(); return }
      this.deselectAll()
      if (this.opts.onEmptyClick) this.opts.onEmptyClick()
    }
    // 大屏：hover 交给 Vue 壳的 mousemove 拾取，这里不处理
    this.graph = new G(this.container, cfg)
    window.__topo = this // 调试用（同 demo 的 window.__gv）
    if (this.graph.setZoomRange) { try { this.graph.setZoomRange(0.2, 3) } catch (e) { /* ignore */ } }
    // 预加载官方 3D 图标：每加载完一张重绘一次，节点从手绘立方体切换到 3D 图标
    loadIcons(() => { if (this.graph && this.graph.refresh) this.graph.refresh() })
    this._setDrag(readOnly)
    if (canvas) this.renderCanvas(canvas)
    this._hookSelection()
    this._startAnim()
  }

  _setDrag(readOnly) {
    const g = this.graph
    try {
      if (g.scene) {
        g.scene.dragable = !readOnly          // 禁止空白拖动（只读）
      }
      ;(g.nodes || []).forEach((n) => { n.dragable = !readOnly })
      ;(g.links || []).forEach((l) => { try { l.dragable = !readOnly } catch (e) { /* ignore */ } })
    } catch (e) { /* ignore */ }
  }

  // 呼吸灯动画：alert 节点存在时保持 rAF 循环重绘
  _startAnim() {
    if (this._raf) return
    const tick = () => {
      const g = this.graph
      if (!g) { this._raf = null; return }
      const need = (g.nodes || []).some((n) => nodeState(n, this._devices) === 'alert')
      if (need && g.refresh) g.refresh()
      this._raf = requestAnimationFrame(tick)
    }
    this._raf = requestAnimationFrame(tick)
  }

  dispose() {
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = null
    const g = this.graph
    if (g && g.destory) { try { g.destory() } catch (e) { /* ignore */ } }
    this.graph = null
  }

  // 整图重绘（数据源/设备状态变化）
  renderCanvas(canvas) {
    const g = this.graph
    if (!g || !canvas) return
    if (g.clearAll) { try { g.clearAll() } catch (e) { /* ignore */ } }
    else {
      if (g.deleteLinks) { try { g.deleteLinks((g.links || []).slice()) } catch (e) { /* ignore */ } }
      if (g.deleteNodes) { try { g.deleteNodes((g.nodes || []).slice()) } catch (e) { /* ignore */ } }
    }
    g.drawData({ nodes: canvas.nodes || [], links: canvas.links || [] })
    this.decorate()
    ;(canvas.groups || []).forEach((gd) => this._addGroup(gd))
    this._setDrag(!!this.opts.readOnly)
    this._hookSelection()
  }

  // drawData 之后给节点实例绑定 3D 绘制（引擎会重建节点对象，数据上的函数会被丢弃）
  decorate() {
    const g = this.graph
    const dark = !!this.opts.dark
    ;(g.nodes || []).forEach((n) => {
      n.fillColor = n.fillColor || n.color
      n.properties = n.properties || {}
      n.drawNode = makeDrawNode(g, DEVICE_MAP[n.type] || DEVICES[0], dark)
    })
    if (g.refresh) g.refresh()
  }

  // 刷新设备状态映射（不重画全图，仅下一帧自然重绘）
  setDevices(devices) { this._devices = devices || {} }

  _addGroup(gd) {
    const g = this.graph
    const members = (gd.memberIds || []).map((id) => { try { return g.findNode(id) } catch (e) { return null } }).filter(Boolean)
    if (!members.length) return
    const gr = g.addNodesInGroup({ label: gd.label, color: gd.fillColor, borderColor: gd.borderColor }, members)
    applyGroupStyle(g, gr, gd)
    bindGroupEvents(g, this.opts.onGroupDblClick || null)
  }

  _hookSelection() {
    const g = this.graph
    try {
      const sc = g && g.scene
      if (!sc || sc._selHooked) return
      const _as = sc.addToSelected, _cs = sc.cancleAllSelected, _rf = sc.removeFromSelected
      const bump = () => { if (this.opts.onSelection) this.opts.onSelection((sc.selectedElements || []).length) }
      sc.addToSelected = function (e) { _as.call(sc, e); bump() }
      sc.removeFromSelected = function (e) { _rf.call(sc, e); bump() }
      sc.cancleAllSelected = function () { _cs.call(sc); bump() }
      sc._selHooked = true
    } catch (e) { /* ignore */ }
  }

  // ===== 选择 =====
  selectNode(node) {
    this.currentNode = node
    this.currentLink = null
    if (this.graph.refresh) this.graph.refresh()
  }
  deselectAll() {
    this.currentNode = null
    this.currentLink = null
    if (this.graph.currentNode) { try { this.graph.currentNode = null } catch (e) { /* ignore */ } }
    if (this.graph.currentLink) { try { this.graph.currentLink = null } catch (e) { /* ignore */ } }
    if (this.graph.refresh) this.graph.refresh()
  }
  // 供编辑器定位/高亮某节点（如从抽屉「去编辑器关联」跳转）
  focusNode(id) {
    try {
      const n = this.graph.findNode(id)
      if (n) { this.selectNode(n); if (this.graph.moveCenter) this.graph.moveCenter() }
    } catch (e) { /* ignore */ }
  }

  // ===== 编辑操作（编辑器用）=====
  addNode(props) {
    const g = this.graph
    const d = DEVICE_MAP[props.type] || DEVICES[0]
    const id = props.id || ('n' + Date.now() + Math.floor(Math.random() * 1000))
    const c = dataCenter(g)
    const x = props.x != null ? props.x : c.x + (Math.random() * 120 - 60)
    const y = props.y != null ? props.y : c.y + (Math.random() * 120 - 60)
    g.addNode({ id, label: props.label || d.name, type: props.type, color: props.color || d.c, x, y, size: props.size || 60, properties: props.properties || {} })
    const nd = this.findNodeSafe(id) || g.nodes[g.nodes.length - 1]
    if (nd) { nd.fillColor = nd.color; nd.drawNode = makeDrawNode(g, DEVICE_MAP[props.type] || DEVICES[0], !!this.opts.dark); nd.dragable = true }
    if (g.refresh) g.refresh()
    this.snapshot()
    return nd
  }
  findNodeSafe(id) { try { return this.graph.findNode(id) } catch (e) { return null } }
  deleteNode(node) {
    const g = this.graph
    const gr = groupOfNode(node)
    if (gr) { try { gr.remove(node) } catch (e) { /* ignore */ } }
    g.deleteNode(node)
    if (g.refresh) g.refresh()
    this.snapshot()
  }
  updateNode(node, patch) {
    Object.assign(node, patch)
    if (patch.color != null) node.fillColor = patch.color
    if (patch.size != null) node.radius = patch.size / 2
    node.properties = node.properties || {}
    if (this.graph.refresh) this.graph.refresh()
    this.snapshot()
  }
  startLinkFrom(node) {
    this.cancelLinkMode()
    this._linkMode = true
    document.body.style.cursor = 'crosshair'
    this.graph.beginAddLine((link) => {
      this._linkMode = false
      document.body.style.cursor = ''
      this.snapshot()
      if (this.opts.onLinkDone) this.opts.onLinkDone(link)
    })
  }
  cancelLinkMode() {
    this._linkMode = false
    document.body.style.cursor = ''
  }
  updateLink(link, patch) { Object.assign(link, patch); if (this.graph.refresh) this.graph.refresh(); this.snapshot() }
  deleteLink(link) { this.graph.deleteLink(link); if (this.graph.refresh) this.graph.refresh(); this.snapshot() }

  // 多选 → 分组
  groupFromSelection() {
    const g = this.graph
    const sels = (g.scene && g.scene.selectedElements) || []
    let nodes = sels.filter((e) => e.elementType === 'node')
    if (!nodes.length) return { ok: false, msg: '请先点击选中节点（Ctrl+点击可多选）' }
    const inGrp = nodes.filter((n) => groupOfNode(n))
    if (inGrp.length) {
      const other = nodes.filter((n) => !groupOfNode(n))
      if (!other.length) return { ok: false, msg: '所选节点已全部在分组内' }
      nodes = other
    }
    const gr = g.addNodesInGroup({ label: groupSeq(g), color: GROUP_DEFAULTS.fillColor, borderColor: GROUP_DEFAULTS.borderColor }, nodes)
    applyGroupStyle(g, gr, GROUP_DEFAULTS)
    bindGroupEvents(g, this.opts.onGroupDblClick || null)
    this.snapshot()
    return { ok: true, msg: '已创建分组：' + gr.label + '（' + nodes.length + ' 个节点）' }
  }
  ungroupCurrent() {
    const g = this.graph
    let gr = currentGroup(g)
    if (!gr && this.currentNode && groupOfNode(this.currentNode)) gr = groupOfNode(this.currentNode)
    if (!gr) return { ok: false, msg: '请先点击分组空白处选中分组' }
    try { gr.removeAll() } catch (e) { /* ignore */ }
    try { g.scene.remove(gr) } catch (e) { /* ignore */ }
    if (g.refresh) g.refresh()
    this.snapshot()
    return { ok: true, msg: '已解散分组' }
  }

  // ===== 撤销 / 重做 =====
  serialize() { return serializeGraph(this.graph) }
  snapshot() {
    try {
      const data = serializeGraph(this.graph)
      if (data && data.nodes) {
        this._undo.push(JSON.stringify(data))
        if (this._undo.length > 40) this._undo.shift()
        this._redo = []
      }
    } catch (e) { /* ignore */ }
  }
  restore(str) {
    const g = this.graph
    const data = JSON.parse(str)
    if (g.clearAll) { try { g.clearAll() } catch (e) { /* ignore */ } }
    else {
      if (g.deleteLinks) { try { g.deleteLinks((g.links || []).slice()) } catch (e) { /* ignore */ } }
      if (g.deleteNodes) { try { g.deleteNodes((g.nodes || []).slice()) } catch (e) { /* ignore */ } }
    }
    g.drawData({ nodes: data.nodes, links: data.links })
    this.decorate()
    ;(data.groups || []).forEach((gd) => this._addGroup(gd))
    this._setDrag(!!this.opts.readOnly)
    this._hookSelection()
    this.deselectAll()
    fitToView(g)
  }
  undo() {
    if (this._undo.length < 2) return false
    this._redo.push(this._undo.pop())
    this.restore(this._undo[this._undo.length - 1])
    return true
  }
  redo() {
    if (!this._redo.length) return false
    this._undo.push(this._redo.pop())
    this.restore(this._redo[this._redo.length - 1])
    return true
  }
  get canUndo() { return this._undo.length >= 2 }
  get canRedo() { return this._redo.length > 0 }

  toPng() {
    const g = this.graph
    let url = ''
    if (g.toDataURL) { try { url = g.toDataURL('image/png') } catch (e) { url = '' } }
    if (!url && g.stage && g.stage.canvas) url = g.stage.canvas.toDataURL('image/png')
    return url
  }
  zoomInfo() {
    const g = this.graph
    try {
      const z = (g.scene && (g.scene.scaleX || g.scene.scaleY)) || (g.zoom) || 1
      return Math.round(z * 100) + '%'
    } catch (e) { return '100%' }
  }
}
