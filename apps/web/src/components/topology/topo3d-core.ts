// @ts-nocheck
// 3D 拓扑场景管理器（Three.js）：active 拓扑 → 三维网络纵深视图
//  - 坐标映射：节点 x → X、y → Z（网络分层 → 前后纵深），状态 → Y 轴抬升 + 颜色
//  - 节点：状态色圆盘 + 类型色圆环 + 落地光柱 + 文字标签（sprite）
//  - 连线：两端状态最差者着色
//  - 交互：OrbitControls（旋转/缩放/平移）、hover 高亮、点击拾取、focusNode 镜头飞行
//  - 实时：setDeviceStatus 增量改色改高度（WS feed_update 驱动），alert 呼吸
// 参照 twin/room-core.ts 的架构（相机/拾取/dispose 同款写法）。
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export const STATUS_3D_COLOR: Record<string, number> = {
  normal: 0x22c55e,
  warn: 0xfaad14,
  alert: 0xff4d4f,
  unmanaged: 0x5a6b85,
}
// 状态 → 抬升高度（严重设备"跳出来"，纵深里一眼看到异常）
const LIFT: Record<string, number> = { normal: 0, warn: 2.6, alert: 5.2, unmanaged: 0 }
const PX = 0.26                       // 数据 px → 世界单位（节点坐标 x:0~1000, y:0~850）
const DISC_Y = 0.9                    // 圆盘基准高度（贴地之上）
const RANK: Record<string, number> = { unmanaged: 0, normal: 1, warn: 2, alert: 3 }
// 流光短圆柱复用向量（避免每帧 new）
const _UP = new THREE.Vector3(0, 1, 0)
const _flowDir = new THREE.Vector3()

function hexFromCss(str: string | undefined): number {
  if (!str) return 0x3a6ea5
  const m = String(str).match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  return m ? (parseInt(m[1]) << 16) | (parseInt(m[2]) << 8) | parseInt(m[3]) : 0x3a6ea5
}

function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 96
  const ctx = canvas.getContext('2d')!
  ctx.font = 'bold 44px "PingFang SC","Microsoft YaHei",sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 8
  ctx.fillStyle = '#e8f0ff'
  ctx.fillText(text, 256, 48)
  const tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = 4
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  spr.scale.set(22, 4.2, 1)
  return spr
}

// 分区地台标签（TDDC 风格：区名用分区边框色）
function makeZoneLabel(text: string, colorCss: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.font = 'bold 72px "PingFang SC","Microsoft YaHei",sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.85)'
  ctx.shadowBlur = 12
  const m = String(colorCss || '255,255,255').match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  ctx.fillStyle = m ? `rgb(${m[1]},${m[2]},${m[3]})` : '#ffffff'
  ctx.fillText(text, 512, 64)
  const tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = 4
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  spr.scale.set(34, 4.2, 1)
  return spr
}

// 连线速率标签（如 10G / 1G）
function makeSpeedSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.font = 'bold 40px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 6
  ctx.fillStyle = '#8fb8e8'
  ctx.fillText(text, 128, 32)
  const tex = new THREE.CanvasTexture(canvas)
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false }))
  spr.scale.set(7.5, 1.9, 1)
  return spr
}

interface NodeRec {
  id: string
  label: string
  type: string
  deviceId: string | null
  status: string
  x: number            // 世界坐标（数据坐标 * PX）
  y: number
  disc: THREE.Mesh
  ring: THREE.Mesh
  stem: THREE.Mesh
  label: THREE.Sprite
  targetLift: number   // 状态变化时向目标高度平滑过渡
}

interface LinkRec {
  line: THREE.Line
  arrow: THREE.Mesh
  bar: THREE.Mesh      // 流光：一小段发光短圆柱，沿 a→b 滑过
  barPhase: number
  speed: THREE.Sprite | null
  source: string
  target: string
  faulty: boolean
}

interface ZoneRec {
  label: string
  labelSpr: THREE.Sprite
  plate: THREE.Mesh
  box: THREE.LineSegments
}

export class Topo3DCore {
  private container: HTMLElement
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private controls: OrbitControls
  private raf = 0
  private nodes = new Map<string, NodeRec>()
  private links: LinkRec[] = []
  private linkById = new Map<string, LinkRec>()
  private zones: ZoneRec[] = []
  private zoneLabelGroup = new THREE.Group()
  private pickables: THREE.Object3D[] = []
  private raycaster = new THREE.Raycaster()
  private hover: NodeRec | null = null
  private hidden = new Set<string>()
  private focusAnim: { from: THREE.Vector3, to: THREE.Vector3, t0: number } | null = null
  private elapsed = 0
  private onResizeObs: ResizeObserver

  onNodeClick: ((id: string) => void) | null = null
  onNodeHover: ((id: string | null) => void) | null = null
  // 大屏模式：节点名称 sprite 默认隐藏（hover 浮层展示名称）
  private hideLabels = false

  constructor(container: HTMLElement, opts?: { hideLabels?: boolean }) {
    this.container = container
    this.hideLabels = !!opts?.hideLabels
    const w = container.clientWidth || 800
    const h = container.clientHeight || 500

    this.scene.background = new THREE.Color(0x0a1220)
    this.scene.fog = new THREE.Fog(0x0a1220, 260, 560)

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 2000)
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI * 0.49
    this.controls.minDistance = 60
    this.controls.maxDistance = 600

    // 地面网格 + 环境光
    const grid = new THREE.GridHelper(700, 35, 0x1d3a5f, 0x12233c)
    this.scene.add(grid)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const dir = new THREE.DirectionalLight(0xbdd4ff, 0.7)
    dir.position.set(120, 200, 80)
    this.scene.add(dir)

    this.renderer.domElement.addEventListener('click', this.onClick)
    this.renderer.domElement.addEventListener('mousemove', this.onMove)
    this.renderer.domElement.addEventListener('dblclick', this.onDblClick)
    this.onResizeObs = new ResizeObserver(() => this.resize())
    this.onResizeObs.observe(container)

    this.renderer.setAnimationLoop(() => this.tick())
  }

  // ===== 数据装载 =====
  setTopology(canvas: { nodes: any[]; links: any[]; groups?: any[] }, devices: Record<string, { status: string }> | null) {
    this.clear()
    const list = canvas.nodes || []
    for (const n of list) {
      const deviceId = n.properties && n.properties.deviceId
      const dev = devices && deviceId ? devices[deviceId] : null
      const status = dev ? dev.status : 'unmanaged'
      const rec = this.buildNode(n, deviceId, status)
      this.nodes.set(n.id, rec)
    }
    for (const l of canvas.links || []) {
      if (!this.nodes.has(l.source) || !this.nodes.has(l.target)) continue
      this.buildLink(l)
    }
    // 分区彩色地台（canvas.groups：label/memberIds/fillColor/borderColor）
    this.scene.add(this.zoneLabelGroup)
    for (const g of canvas.groups || []) {
      if (!g.memberIds || !g.memberIds.length) continue
      this.buildZone(g)
    }
    this.applyHidden()
    this.fitCamera()
  }

  private buildZone(g: any) {
    const members = (g.memberIds as string[]).map((id) => this.nodes.get(id)).filter(Boolean) as NodeRec[]
    if (!members.length) return
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const r of members) {
      minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x)
      minZ = Math.min(minZ, r.y); maxZ = Math.max(maxZ, r.y)
    }
    const pad = 16
    minX -= pad; maxX += pad; minZ -= pad; maxZ += pad
    const w = maxX - minX, d = maxZ - minZ
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
    const border = hexFromCss(g.borderColor || g.fillColor)

    // 彩色地台（薄板）
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.3, d),
      new THREE.MeshBasicMaterial({ color: hexFromCss(g.fillColor), transparent: true, opacity: 0.13, depthWrite: false }),
    )
    plate.position.set(cx, 0.15, cz)
    this.scene.add(plate)

    // 边框（四角立起来的线框）
    const bh = 1.6
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w, bh, d)),
      new THREE.LineBasicMaterial({ color: border, transparent: true, opacity: 0.55 }),
    )
    box.position.set(cx, 0.3 + bh / 2, cz)
    this.scene.add(box)

    // 悬浮区名（前缘上方）
    const labelSpr = makeZoneLabel(g.label, g.borderColor || g.fillColor)
    labelSpr.position.set(cx, 3.4, maxZ)
    this.zoneLabelGroup.add(labelSpr)

    this.zones.push({ label: g.label, labelSpr, plate, box })
  }

  private buildNode(n: any, deviceId: string | null, status: string): NodeRec {
    const wx = (n.x ?? 0) * PX
    const wz = (n.y ?? 0) * PX
    const r = (n.size ?? 56) * 0.085
    const lift = LIFT[status]
    const y = DISC_Y + lift
    // 节点主色 = 类型色（TDDC 风格）；状态由抬升高度 + 光柱/圆环色表达
    const typeColor = hexFromCss(n.color || n.fillColor)

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 1.4, 40),
      new THREE.MeshStandardMaterial({ color: typeColor, emissive: typeColor, emissiveIntensity: 0.3, roughness: 0.4 }),
    )
    disc.position.set(wx, y, wz)
    disc.userData.nodeId = n.id
    this.scene.add(disc)

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r + 1.1, 0.45, 10, 48),
      new THREE.MeshStandardMaterial({ color: STATUS_3D_COLOR[status], emissive: STATUS_3D_COLOR[status], emissiveIntensity: 0.4, roughness: 0.5, metalness: 0.2 }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(wx, y - 0.2, wz)
    this.scene.add(ring)

    // 落地光柱（几何高度固定 1，实际高度用 scale.y 跟随节点，便于状态切换平滑过渡）
    const stemH = y - 0.1
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 1, 8),
      new THREE.MeshBasicMaterial({ color: STATUS_3D_COLOR[status], transparent: true, opacity: 0.4 }),
    )
    stem.scale.y = Math.max(0.01, stemH)
    stem.position.set(wx, 0.1 + stemH / 2, wz)
    this.scene.add(stem)

    const label = makeLabelSprite(n.label)
    label.position.set(wx, y + 5.5, wz)
    this.scene.add(label)

    this.pickables.push(disc)
    return {
      id: n.id, label: n.label, type: n.type || '', deviceId, status,
      x: wx, y: wz, disc, ring, stem, label, targetLift: lift,
    }
  }

  private buildLink(l: any) {
    const a = this.nodes.get(l.source)!
    const b = this.nodes.get(l.target)!
    const faulty = !!(l.properties && l.properties.status === 'faulty')
    const speedText = (l.properties && l.properties.speed) || ''
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a.x, DISC_Y + LIFT[a.status], a.y),
      new THREE.Vector3(b.x, DISC_Y + LIFT[b.status], b.y),
    ])
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      transparent: true,
      opacity: faulty ? 0.85 : 0.5,
      color: faulty ? 0xff4d4f : new THREE.Color(STATUS_3D_COLOR[this.worseStatus(a.status, b.status)]),
    }))
    line.userData = { a: a.id, b: b.id }
    this.scene.add(line)

    // 箭头锥体（指向 target 端）
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 2.6, 12),
      new THREE.MeshBasicMaterial({ color: faulty ? 0xff4d4f : new THREE.Color(STATUS_3D_COLOR[this.worseStatus(a.status, b.status)]) }),
    )
    this.scene.add(arrow)

    // 流光：一小段发光短圆柱，沿 a→b 滑过（彗星式，比原线略粗；faulty 线不画）。
    // 几何为单位长度(1)圆柱，长度/朝向/位置在 tick 里按线段实时计算。
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 1, 10),
      new THREE.MeshBasicMaterial({
        color: faulty ? 0xff4d4f : new THREE.Color(STATUS_3D_COLOR[this.worseStatus(a.status, b.status)]).lerp(new THREE.Color(0xffffff), 0.55),
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    bar.visible = !faulty
    this.scene.add(bar)

    // 速率标签（连线中点上方）
    let speed: THREE.Sprite | null = null
    if (speedText) {
      speed = makeSpeedSprite(speedText)
      this.scene.add(speed)
    }

    const rec: LinkRec = { line, arrow, bar, barPhase: Math.random(), speed, source: l.source, target: l.target, faulty }
    this.positionLink(rec)
    this.links.push(rec)
    this.linkById.set(l.id, rec)
  }

  private positionLink(rec: LinkRec) {
    const a = this.nodes.get(rec.source)!
    const b = this.nodes.get(rec.target)!
    const ay = DISC_Y + LIFT[a.status], by = DISC_Y + LIFT[b.status]
    const pa = new THREE.Vector3(a.x, ay, a.y)
    const pb = new THREE.Vector3(b.x, by, b.y)
    const pos = rec.line.geometry.attributes.position as THREE.BufferAttribute
    pos.setXYZ(0, pa.x, pa.y, pa.z)
    pos.setXYZ(1, pb.x, pb.y, pb.z)
    pos.needsUpdate = true
    rec.line.geometry.computeBoundingSphere()
    // 箭头放在 target 端往前 1 个单位处，指向 a→b 方向
    const dir = pb.clone().sub(pa).normalize()
    const arrowPos = pb.clone().sub(dir.clone().multiplyScalar(2.2))
    rec.arrow.position.copy(arrowPos)
    rec.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    if (rec.speed) {
      const mid = pa.clone().add(pb).multiplyScalar(0.5)
      rec.speed.position.set(mid.x, mid.y + 1.6, mid.z)
    }
  }

  private worseStatus(a: string, b: string): string {
    return RANK[a] >= RANK[b] ? a : b
  }

  private updateLinkColors() {
    for (const rec of this.links) {
      const a = this.nodes.get(rec.source)
      const b = this.nodes.get(rec.target)
      if (!a || !b) continue
      const c = rec.faulty ? 0xff4d4f : STATUS_3D_COLOR[this.worseStatus(a.status, b.status)]
      ;(rec.line.material as THREE.LineBasicMaterial).color.set(c)
      ;(rec.line.material as THREE.LineBasicMaterial).opacity = rec.faulty ? 0.85 : 0.55
      ;(rec.arrow.material as THREE.MeshBasicMaterial).color.set(c)
      if (!rec.faulty) (rec.bar.material as THREE.MeshBasicMaterial).color.set(new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.55))
    }
  }

  private applyNodeStatus(rec: NodeRec) {
    // 圆盘保持类型色不变；状态色体现在圆环 + 光柱 + 抬升高度
    const color = STATUS_3D_COLOR[rec.status]
    ;(rec.ring.material as THREE.MeshStandardMaterial).color.set(color)
    ;(rec.ring.material as THREE.MeshStandardMaterial).emissive.set(color)
    ;(rec.stem.material as THREE.MeshBasicMaterial).color.set(color)
    rec.targetLift = LIFT[rec.status]
  }

  setDeviceStatus(deviceId: string, status: string) {
    for (const rec of this.nodes.values()) {
      if (rec.deviceId === deviceId) {
        rec.status = status
        this.applyNodeStatus(rec)
      }
    }
    this.updateLinkColors()
    this.updateLinkPositions()
  }

  private updateLinkPositions() {
    for (const rec of this.links) {
      if (!this.nodes.get(rec.source) || !this.nodes.get(rec.target)) continue
      this.positionLink(rec)
    }
  }

  setHiddenTypes(types: string[]) {
    this.hidden = new Set(types || [])
    this.applyHidden()
  }

  private applyHidden() {
    for (const rec of this.nodes.values()) {
      const vis = !this.hidden.has(rec.type)
      rec.disc.visible = vis
      rec.ring.visible = vis
      rec.stem.visible = vis
      rec.label.visible = vis && !this.hideLabels
    }
    for (const rec of this.links) {
      const a = this.nodes.get(rec.source)
      const b = this.nodes.get(rec.target)
      const vis = !!(a && b && a.disc.visible && b.disc.visible)
      rec.line.visible = vis
      rec.arrow.visible = vis
      rec.bar.visible = vis && !rec.faulty
      if (rec.speed) rec.speed.visible = vis
    }
  }

  nodeVisible(id: string) {
    const rec = this.nodes.get(id)
    return !!(rec && rec.disc.visible)
  }

  // ===== 相机 =====
  private fitCamera() {
    const recs = Array.from(this.nodes.values())
    if (!recs.length) return
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const r of recs) {
      minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x)
      minZ = Math.min(minZ, r.y); maxZ = Math.max(maxZ, r.y)
    }
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const radius = Math.max(maxX - minX, maxZ - minZ) / 2 + 30
    const dist = radius / Math.tan((this.camera.fov * Math.PI) / 360)
    // 默认视角：正前方（无水平旋转）+ 俯角约 50°（与 TDDC 参考视角一致）
    this.camera.position.set(cx, dist * 0.78, cz + dist * 0.64)
    this.controls.target.set(cx, 2, cz)
    this.controls.update()
  }

  focusNode(id: string) {
    const rec = this.nodes.get(id)
    if (!rec) return
    const to = new THREE.Vector3(rec.x, DISC_Y + rec.targetLift, rec.y)
    // 保持当前观察方向与距离，只平移视点
    const offset = this.camera.position.clone().sub(this.controls.target)
    this.focusAnim = { from: this.controls.target.clone(), to, t0: performance.now() }
    this.focusOffset = offset
  }
  private focusOffset = new THREE.Vector3()

  // ===== 交互 =====
  private pick(e: MouseEvent): NodeRec | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const v = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(v, this.camera)
    const hits = this.raycaster.intersectObjects(this.pickables.filter((o) => o.visible), false)
    if (!hits.length) return null
    const id = hits[0].object.userData.nodeId
    return this.nodes.get(id) || null
  }

  private onClick = (e: MouseEvent) => {
    // 拖拽旋转结束也会触发 click —— 位移小才算点击
    if (e.detail === 0) return
    const rec = this.pick(e)
    if (rec) this.onNodeClick?.(rec.id)
  }

  private onDblClick = (e: MouseEvent) => {
    const rec = this.pick(e)
    if (rec) this.focusNode(rec.id)
  }

  private onMove = (e: MouseEvent) => {
    const rec = this.pick(e)
    if (rec !== this.hover) {
      if (this.hover) (this.hover.disc.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35
      this.hover = rec
      if (rec) (rec.disc.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9
      this.renderer.domElement.style.cursor = rec ? 'pointer' : ''
      this.onNodeHover?.(rec ? rec.id : null)
    }
  }

  // ===== 动画循环 =====
  private tick() {
    const dt = Math.min(0.05, (this.elapsed ? 0.016 : 0.016))
    this.elapsed += dt
    // 高度平滑过渡（圆盘/圆环/标签上移，光柱拉伸）
    for (const rec of this.nodes.values()) {
      const ty = DISC_Y + rec.targetLift
      const dy = ty - rec.disc.position.y
      if (Math.abs(dy) > 0.01) {
        rec.disc.position.y += dy * 0.12
        rec.ring.position.y += dy * 0.12
        rec.label.position.y += dy * 0.12
      }
      const stemH = Math.max(0.01, rec.disc.position.y - 0.1)
      rec.stem.scale.y = stemH
      rec.stem.position.y = 0.1 + stemH / 2
    }
    // alert 呼吸（圆盘 + 光柱）
    for (const rec of this.nodes.values()) {
      if (rec.status !== 'alert') continue
      const s = 1 + Math.sin(this.elapsed * 4.5) * 0.08
      rec.disc.scale.set(s, 1, s)
      ;(rec.stem.material as THREE.MeshBasicMaterial).opacity = 0.35 + (Math.sin(this.elapsed * 4.5) + 1) * 0.15
    }
    // 连线流光：一小段发光短圆柱沿 a→b 滑过（彗星式，相位错开）
    for (const rec of this.links) {
      if (!rec.bar.visible) continue
      const a = this.nodes.get(rec.source)
      const b = this.nodes.get(rec.target)
      if (!a || !b) continue
      const ax = a.x, az = a.y, ay = DISC_Y + a.targetLift
      const bx = b.x, bz = b.y, by = DISC_Y + b.targetLift
      const dx = bx - ax, dy = by - ay, dz = bz - az
      const len = Math.hypot(dx, dy, dz)
      if (!len) continue
      const frac = 0.3
      const h = (this.elapsed * 0.18 + rec.barPhase) % 1
      const t0 = Math.max(0, h - frac)
      // 短圆柱中心 + 朝向 + 长度（单位圆柱沿 Y，长 1，scale.y=段长）
      const cx = ax + dx * (h + t0) / 2
      const cy = ay + dy * (h + t0) / 2 + 0.3
      const cz = az + dz * (h + t0) / 2
      rec.bar.position.set(cx, cy, cz)
      rec.bar.quaternion.setFromUnitVectors(_UP, _flowDir.set(dx / len, dy / len, dz / len))
      rec.bar.scale.set(1, len * (h - t0), 1)
    }
    // 镜头飞行
    if (this.focusAnim) {
      const t = Math.min(1, (performance.now() - this.focusAnim.t0) / 650)
      const k = t * t * (3 - 2 * t) // smoothstep
      this.controls.target.lerpVectors(this.focusAnim.from, this.focusAnim.to, k)
      this.camera.position.copy(this.controls.target).add(this.focusOffset)
      if (t >= 1) this.focusAnim = null
    }
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (!w || !h) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private clear() {
    for (const rec of this.nodes.values()) {
      this.scene.remove(rec.disc, rec.ring, rec.stem, rec.label)
      rec.disc.geometry.dispose(); (rec.disc.material as THREE.Material).dispose()
      rec.ring.geometry.dispose(); (rec.ring.material as THREE.Material).dispose()
      rec.stem.geometry.dispose(); (rec.stem.material as THREE.Material).dispose()
      rec.label.material.map?.dispose(); rec.label.material.dispose()
    }
    for (const rec of this.links) {
      this.scene.remove(rec.line, rec.arrow, rec.bar)
      rec.line.geometry.dispose(); (rec.line.material as THREE.Material).dispose()
      rec.arrow.geometry.dispose(); (rec.arrow.material as THREE.Material).dispose()
      rec.bar.geometry.dispose(); (rec.bar.material as THREE.Material).dispose()
      if (rec.speed) {
        this.scene.remove(rec.speed)
        rec.speed.material.map?.dispose(); rec.speed.material.dispose()
      }
    }
    for (const z of this.zones) {
      this.scene.remove(z.plate, z.box)
      z.plate.geometry.dispose(); (z.plate.material as THREE.Material).dispose()
      z.box.geometry.dispose(); (z.box.material as THREE.Material).dispose()
      z.labelSpr.material.map?.dispose(); z.labelSpr.material.dispose()
    }
    this.scene.remove(this.zoneLabelGroup)
    this.zones = []
    this.nodes.clear()
    this.links = []
    this.linkById.clear()
    this.pickables = []
    this.hover = null
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.onResizeObs.disconnect()
    this.renderer.domElement.removeEventListener('click', this.onClick)
    this.renderer.domElement.removeEventListener('mousemove', this.onMove)
    this.renderer.domElement.removeEventListener('dblclick', this.onDblClick)
    this.clear()
    this.controls.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
