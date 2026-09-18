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

// 扁平节点样式（TDDC 风）：类型色描边圆 + 内部 glyph + 状态角标。
// 类型色独立于 cube 模式的节点 base 色（后者按种子数据 color 存）。
export const FLAT_TYPE_COLOR = {
  router: '#36b37e', firewall: '#f56c6c', switch: '#409eff', server: '#a78bfa',
  loadbalancer: '#2dd4bf', storage: '#f59e0b', app: '#7dd3fc', mgmt: '#e879a9',
  gateway: '#fb923c', idc: '#818cf8', room: '#818cf8', collect: '#94a3b8',
  sec: '#fb7185', cloud: '#67e8f9', home: '#fbbf24', corp: '#a78bfa',
  factory: '#f97316', apt: '#c084fc', atm: '#818cf8', aggr: '#38bdf8',
  core: '#2dd4bf', db: '#a78bfa', pool: '#fbbf24', plat: '#e879a9',
  biz: '#7dd3fc', optic: '#60a5fa', '1u': '#a78bfa', '2u': '#a78bfa',
}
export const FLAT_STATUS_DOT = { warn: '#faad14', alert: '#ff4d4f', unmanaged: '#8b98ab' }
const FLAT_GLYPH = {
  // 类型 → 复用 drawGlyph 的 case key
  router: 'router', firewall: 'firewall', switch: 'switch', server: 'server',
  loadbalancer: 'switch', storage: 'db', app: 'biz', mgmt: 'mgmt', gateway: 'gateway',
  idc: 'idc', room: 'idc', collect: 'collect', sec: 'firewall', cloud: 'pool',
  home: 'pool', corp: 'idc', factory: 'mgmt', apt: 'idc', atm: 'router',
  aggr: 'switch', core: 'switch', db: 'db', pool: 'pool', plat: 'mgmt',
  biz: 'biz', optic: 'biz', '1u': 'server', '2u': 'server',
}
// 把 'rgba(r,g,b,a)' 换成指定 alpha（流光渐隐尾用）
function withAlpha(c, a) {
  const m = /rgba?\(([^)]+)\)/.exec(c || '')
  if (m) { const p = m[1].split(','); return `rgba(${p[0]},${p[1]},${p[2]},${a})` }
  return c
}
// 连线流光：一段比原线略粗、带渐隐尾的柔光柱，沿 s→e 滑过（ comet 彗星式）。
// 独立函数 + 显式坐标，避免内联短变量被 rollup 混淆后坐标 NaN（静默不画）。
function drawFlowBar(ctx, s, e, color, offset) {
  const sx = s.x, sy = s.y, ex = e.x, ey = e.y
  const ddx = ex - sx, ddy = ey - sy
  if (!isFinite(ddx) || !isFinite(ddy) || (!ddx && !ddy)) return
  const len = Math.hypot(ddx, ddy)
  if (!len) return
  const frac = 0.3 // 光柱覆盖整条线 30% 长度
  const head = (performance.now() / 2200 + (offset || 0)) % 1
  const hx = sx + ddx * head, hy = sy + ddy * head
  const tx = sx + ddx * Math.max(0, head - frac), ty = sy + ddy * Math.max(0, head - frac)
  if (!isFinite(hx) || !isFinite(hy) || !isFinite(tx) || !isFinite(ty)) return
  const grad = ctx.createLinearGradient(hx, hy, tx, ty)
  grad.addColorStop(0, color)
  grad.addColorStop(0.6, withAlpha(color, 0.35))
  grad.addColorStop(1, withAlpha(color, 0))
  ctx.save()
  ctx.strokeStyle = grad
  ctx.lineWidth = 4.5 // 比原线略粗
  ctx.lineCap = 'round'
  ctx.shadowColor = color
  ctx.shadowBlur = 6
  ctx.beginPath()
  ctx.moveTo(hx, hy)
  ctx.lineTo(tx, ty)
  ctx.stroke()
  ctx.restore()
}
// 连线箭头 + 速率标签：引擎原生 showArrow/text 实测不渲染，改 paint 覆盖自绘。
// 端点取 getStartPosition/getEndPosition（数据坐标），箭头指向 target。
function linkArrowPaint(orig) {
  return function (ctx, needHideText) {
    orig.call(this, ctx, needHideText)
    try {
      const hasArrow = !!this._arrowColor
      const label = this._arrowLabel
      if (!hasArrow && !label && !this._flowColor) return
      const s = this.getStartPosition()
      const e = this.getEndPosition()
      if (!s || !e) return
      if (hasArrow) {
        const dx = e.x - s.x, dy = e.y - s.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len, uy = dy / len
        const a = 12, w = 6
        const px = -uy, py = ux
        ctx.save()
        ctx.fillStyle = this._arrowColor
        ctx.beginPath()
        ctx.moveTo(e.x, e.y)
        ctx.lineTo(e.x - ux * a + px * w, e.y - uy * a + py * w)
        ctx.lineTo(e.x - ux * a - px * w, e.y - uy * a - py * w)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
      // 流光：柔光柱沿源→目标滑过（faulty 红线为静态虚线，不画流光）
      if (this._flowColor) {
        drawFlowBar(ctx, s, e, this._flowColor, this._flowOffset)
      }
      if (label) {
        const mx = (s.x + e.x) / 2, my = (s.y + e.y) / 2
        ctx.save()
        ctx.font = '10px "Microsoft YaHei", Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const tw = ctx.measureText(label).width
        ctx.fillStyle = this._arrowLabelBg || 'rgba(13,26,48,0.82)'
        ctx.fillRect(mx - tw / 2 - 3, my - 8, tw + 6, 14)
        ctx.fillStyle = this._arrowLabelColor || 'rgba(170,195,225,0.95)'
        ctx.fillText(label, mx, my)
        ctx.restore()
      }
    } catch (err) { /* ignore */ }
  }
}
// 覆盖默认节点绘制：flat 模式画扁平圆，cube 模式走官方 3D 图标/手绘立方体
function makeFlatDrawNode(graph, device, dark) {
  return function (ctx) {
    const R = this.radius || 30
    const base = device.c || '120,140,180'
    const isSel = !!this.selected || (graph && graph.currentNode === this)
    const state = nodeState(this, graph._devices || {})
    const typeColor = FLAT_TYPE_COLOR[this.type] || '#' + toHex(base)

    // 告警/警告光晕（与 cube 模式同节奏）
    if (state === 'warn' || state === 'alert') {
      const col = STATUS_RGB[state]
      const t = performance.now() / 1000
      const pulse = state === 'alert' ? (0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3.2))) : 0.5
      ctx.save()
      ctx.globalAlpha = pulse
      ctx.shadowColor = 'rgba(' + col + ',1)'
      ctx.shadowBlur = R * 0.9
      ctx.fillStyle = 'rgba(' + col + ',' + (0.28 * pulse + 0.1) + ')'
      ctx.beginPath(); ctx.arc(0, 0, R * 1.25, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
    if (isSel) {
      ctx.save()
      ctx.strokeStyle = 'rgba(47,123,255,0.9)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath(); ctx.arc(0, 0, R * 1.45, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }

    // 主体圆：白底（深底）+ 类型色描边
    ctx.save()
    if (state === 'unmanaged') ctx.globalAlpha = 0.72
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2)
    ctx.fillStyle = dark ? 'rgba(23,36,58,0.92)' : '#ffffff'
    ctx.fill()
    ctx.lineWidth = Math.max(2, R * 0.11)
    ctx.strokeStyle = typeColor
    ctx.stroke()
    // 内部 glyph（类型色）
    ctx.globalAlpha = state === 'unmanaged' ? 0.55 : 0.95
    ctx.strokeStyle = typeColor
    ctx.fillStyle = typeColor
    drawGlyph(ctx, FLAT_GLYPH[this.type] || 'biz', R * 0.72)
    ctx.restore()

    // 状态角标（右上）
    if (state === 'warn' || state === 'alert' || state === 'unmanaged') {
      const cx = R * 0.72, cy = -R * 0.72, r = R * 0.22
      const col = FLAT_STATUS_DOT[state]
      if (state === 'alert') {
        const t = performance.now() / 1000
        const pulse = 0.5 + 0.5 * Math.sin(t * 3.2)
        ctx.save()
        ctx.globalAlpha = pulse
        ctx.shadowColor = col
        ctx.shadowBlur = r * 3
        ctx.fillStyle = col
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      } else {
        ctx.save()
        ctx.fillStyle = col
        ctx.strokeStyle = dark ? 'rgba(13,26,48,0.9)' : '#ffffff'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        ctx.restore()
      }
    }

    // 标签（hideLabels 模式：默认隐藏，hover 浮层展示；选中节点仍显示）
    if (!(graph && graph._hideLabels) || isSel) {
    ctx.save()
    ctx.font = '11px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const ly = R + 6
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
}
function makeDrawNode(graph, device, dark, flat) {
  if (flat) return makeFlatDrawNode(graph, device, dark)
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

    // 标签（hideLabels 模式：默认隐藏，hover 浮层展示；选中节点仍显示）
    if (!(graph && graph._hideLabels) || isSel) {
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
    properties: l.properties || {},
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
    // 节点样式：flat=扁平圆（TDDC 风，新默认）；cube=等距立方体（原样式）。可运行时 setNodeStyle 切换
    if (!this.opts.nodeStyle) this.opts.nodeStyle = 'flat'
    this.graph = null
    this._devices = {}
    this._lastCanvas = null
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
    this.graph._hideLabels = !!this.opts.hideLabels
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
        // 空白处拖动 = 平移视图（只读大屏也允许，方便拖动查看）。
        g.scene.dragable = true
        if (readOnly && g.scene.dragElements && !g.scene._roGuard) {
          // 只读：禁掉“节点/分组被拖拽移动”这条路径。
          // 引擎里空白平移走 mousedragHandler 的另一分支（translateX/translateY），
          // 与 dragElements 无关，所以平移仍可用；而分组动画会异步把成员节点的
          // dragable 复位为 true，光靠逐个 node.dragable=false 挡不住，故直接短路。
          g.scene._roGuard = true
          g.scene.dragElements = function () {}
        }
      }
      ;(g.nodes || []).forEach((n) => { n.dragable = !readOnly })
      ;(g.links || []).forEach((l) => { try { l.dragable = !readOnly } catch (e) { /* ignore */ } })
    } catch (e) { /* ignore */ }
  }

  // 呼吸灯动画：alert 节点存在时保持 rAF 循环重绘；flat 模式连线流光需持续重绘（限频 30fps）
  _startAnim() {
    if (this._raf) return
    const tick = () => {
      const g = this.graph
      if (!g) { this._raf = null; return }
      const needAlert = (g.nodes || []).some((n) => nodeState(n, this._devices) === 'alert')
      // 连线流光：样式无关（flat/cube 都有），只要有正常线就持续重绘（限频 30fps）
      const needFlow = !!(g.links || []).some((l) => l._flowColor)
      if (needAlert && g.refresh) g.refresh()
      else if (needFlow && g.refresh && Date.now() - (this._lastFlow || 0) > 33) { g.refresh(); this._lastFlow = Date.now() }
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
    this._lastCanvas = canvas
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

  // 保存/恢复视图变换（scaleX/scaleY/translateX/translateY）。
  // 整图重绘（clearAll+drawData）会把引擎缩放重置为 1（平移保留），
  // 切换节点样式这类"不应改变视图"的重绘需在重绘后恢复，否则用户看到缩放跳变。
  _saveView() {
    const sc = this.graph && this.graph.scene
    if (!sc) return null
    return { scaleX: sc.scaleX, scaleY: sc.scaleY, translateX: sc.translateX, translateY: sc.translateY }
  }
  _restoreView(v) {
    if (!v) return
    const sc = this.graph && this.graph.scene
    if (!sc) return
    sc.scaleX = v.scaleX
    sc.scaleY = v.scaleY
    sc.translateX = v.translateX
    sc.translateY = v.translateY
    if (this.graph.refresh) this.graph.refresh()
  }

  // 运行时切换节点样式（flat/cube）：存样式后用最近一次 canvas 整图重绘，
  // 重绘前后保持当前缩放/平移不变（避免视图跳变）
  setNodeStyle(style) {
    if (style !== 'flat' && style !== 'cube') return
    if (this.opts.nodeStyle === style) return
    this.opts.nodeStyle = style
    if (this._lastCanvas) {
      const view = this._saveView()
      this.renderCanvas(this._lastCanvas)
      this._restoreView(view)
    }
  }
  getNodeStyle() { return this.opts.nodeStyle }

  // drawData 之后给节点实例绑定 3D 绘制（引擎会重建节点对象，数据上的函数会被丢弃）
  decorate() {
    const g = this.graph
    const dark = !!this.opts.dark
    const flat = this.opts.nodeStyle === 'flat'
    ;(g.nodes || []).forEach((n) => {
      n.fillColor = n.fillColor || n.color
      n.properties = n.properties || {}
      n.drawNode = makeDrawNode(g, DEVICE_MAP[n.type] || DEVICES[0], dark, flat)
    })
    this._decorateLinks(flat)
    if (g.refresh) g.refresh()
  }

  // 连线装饰：箭头 + 速率标签 + faulty 红线。
  // 引擎原生 showArrow/text 实测不渲染 → 覆盖 paint 自绘（arrowColor/label 挂到 link 实例）。
  _decorateLinks(flat) {
    const g = this.graph
    const dark = !!this.opts.dark
    ;(g.links || []).forEach((l) => {
      const lp = l.properties || {}
      const faulty = lp.status === 'faulty'
      // 线色：faulty 红虚线；flat 模式统一中性蓝灰
      if (faulty) {
        l.strokeColor = 'rgba(255,77,79,1)'
        if (!l.lineDash) l.lineDash = [8, 5]
      } else if (flat) {
        l.strokeColor = dark ? 'rgba(110,140,190,0.8)' : 'rgba(100,125,160,0.85)'
      }
      // 流光：样式无关（flat/cube 都画），仅正常线画流动光柱、faulty 红线不画。
      // 流光包一层 paint（先 orig 画原生线再叠流光），与节点样式无关，故 cube 也能用。
      l._flowColor = faulty ? null : (dark ? 'rgba(120,210,255,0.9)' : 'rgba(70,150,235,0.9)')
      if (l._flowColor) l._flowOffset = (l._flowOffset ?? Math.random())
      const orig = l.paint
      // 只包一层，避免 renderCanvas 重绘后重复包裹
      if (!l._arrowWrapped) {
        l.paint = linkArrowPaint(orig)
        l._arrowWrapped = true
      }
      // 箭头 + 速率标签：仅 flat 模式（cube 模式走引擎原生连线，不叠自绘箭头）
      if (flat) {
        l._arrowColor = faulty ? 'rgba(255,90,90,1)' : (dark ? 'rgba(140,170,215,0.95)' : 'rgba(80,105,140,0.95)')
        l._arrowLabel = lp.speed || ''
        l._arrowLabelBg = dark ? 'rgba(13,26,48,0.82)' : 'rgba(255,255,255,0.85)'
        l._arrowLabelColor = faulty ? 'rgba(255,120,120,1)' : (dark ? 'rgba(180,205,235,0.95)' : 'rgba(70,90,120,0.95)')
      } else {
        // cube 模式：清掉自绘箭头/标签，保留流光
        l._arrowColor = null
        l._arrowLabel = ''
      }
    })
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
    if (nd) { nd.fillColor = nd.color; nd.drawNode = makeDrawNode(g, DEVICE_MAP[props.type] || DEVICES[0], !!this.opts.dark, this.opts.nodeStyle === 'flat'); nd.dragable = true }
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
