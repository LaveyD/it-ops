// @ts-nocheck
// M9 3D 机房场景管理器（Three.js 原生，命令式黑盒 + Vue 壳策略，与 GraphVis 引擎一致）。
//
// 场景由 room/cabinet/device 数据驱动（/api/rooms/{id}/scene）：
//  - 地面 + 网格
//  - 机柜：InstancedMesh 批量渲染（每行一排），点击拾取实例
//  - 设备：InstancedMesh 简模按 U 位贴在机柜正面，状态着色，alert 呼吸
//  - 交互：OrbitControls 轨道相机、机柜/设备点击拾取、hover 高亮、聚焦
//  - 实时：updateDeviceStatuses() 增量改色（不重建场景）
//
// TDDC（Umi Max + R3F）仅作为交互/观感参考，不拷任何 React 组件。
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// ===== 布局/配色常量 =====
const CAB = { w: 2, h: 3.6, d: 2 }        // 机柜尺寸（米）
const COL_GAP = 2.2                        // 列间距（机柜中心）
const ROW_GAP = 4.2                        // 行间距（机柜中心，含过道）
const DEV_DEPTH = 0.55                     // 设备简模厚度（Z）
const DEV_FACE_OFF = CAB.d / 2 + 0.1       // 设备贴机柜正面的偏移
const UNMANAGED_H = 0.3                    // 无 U 位设备的占位高度
const MAX_INST = 1024                      // InstancedMesh 预分配容量（覆盖 500 机柜目标）

const BG = 0x0a1220
const GROUND = 0x0d1a30
const GRID = 0x1c3a5f
const CAB_BASE = 0x1e3a5f                  // 机柜本体（暗蓝钢）
const CAB_EDGE = 0x2f7bff
const UNM = new THREE.Color(0x5a6b82)
const COLS = {
  normal: new THREE.Color(0x22c55e),
  warn: new THREE.Color(0xfaad14),
  alert: new THREE.Color(0xff4d4f),
}
const STATUS_RANK = { normal: 0, warn: 1, alert: 2 }

export class RoomCore {
  /**
   * @param {HTMLElement} container 画布容器
   * @param {object} opts {
   *   onPickCabinet?: (cabinetData) => void   // 点击机柜
   *   onPickDevice?: (deviceData) => void     // 点击设备
   *   onHover?: (data | null) => void         // hover（机柜或设备）
   * }
   */
  constructor(container, opts = {}) {
    this.container = container
    this.opts = opts
    this.disposed = false
    this.sceneData = null      // 当前 RoomScene
    this.cabIndex = new Map()  // cabinetId -> { row, col, x, z }
    this.devIndex = new Map()  // instanceId -> { deviceId, cabinetId, status }
    this.statusByDevice = new Map() // deviceId -> status（供 WS 增量）
    this.hasAlert = false
    this.hoverId = null         // hover 的对象 id（机柜或设备）
    this.pickedId = null        // 选中高亮的对象 id
    this.focusTarget = null     // 待聚焦的世界坐标（缓动）

    this._initThree()
    this._bindEvents()
    this._resizeObserver = new ResizeObserver(() => this._resize())
    this._resizeObserver.observe(container)
    this._raf = requestAnimationFrame(() => this._loop())
  }

  // ===== Three 初始化 =====
  _initThree() {
    const el = this.container
    const w = el.clientWidth || 800
    const h = el.clientHeight || 600

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(BG)
    this.scene.fog = new THREE.Fog(BG, 40, 90)

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200)
    this.camera.position.set(14, 12, 16)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    el.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI * 0.49
    this.controls.minDistance = 4
    this.controls.maxDistance = 60

    // 光照：环境 + 两盏方向（无阴影，实例化场景保持简单）
    this.scene.add(new THREE.AmbientLight(0xbfd4ff, 0.55))
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.1)
    dir1.position.set(12, 20, 8)
    this.scene.add(dir1)
    const dir2 = new THREE.DirectionalLight(0x88aaff, 0.35)
    dir2.position.set(-14, 10, -10)
    this.scene.add(dir2)

    // 地面 + 网格
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshLambertMaterial({ color: GROUND }),
    )
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.y = -0.01
    this.scene.add(this.ground)
    const grid = new THREE.GridHelper(80, 40, GRID, 0x14273f)
    grid.position.y = 0
    this.scene.add(grid)

    // 机柜实例 mesh（本体按柜内设备最差状态着色，per-instance color）
    this.cabGeo = new THREE.BoxGeometry(CAB.w, CAB.h, CAB.d)
    this.cabMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, metalness: 0.35, roughness: 0.6,
    })
    this.cabMesh = new THREE.InstancedMesh(this.cabGeo, this.cabMat, MAX_INST)
    this.cabMesh.count = 0
    this.cabMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.scene.add(this.cabMesh)

    // 机柜边缘描线（选中/悬停高亮框）
    this.edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(CAB.w + 0.08, CAB.h + 0.08, CAB.d + 0.08))
    this.edgeMat = new THREE.LineBasicMaterial({ color: CAB_EDGE })

    // 设备实例 mesh（正面简模，状态着色，alert 呼吸走 material.emissiveIntensity）
    this.devGeo = new THREE.BoxGeometry(CAB.w * 0.86, 0.9, DEV_DEPTH)
    this.devMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, metalness: 0.2, roughness: 0.5,
      emissive: 0xffffff, emissiveIntensity: 0.0,
    })
    this.devMesh = new THREE.InstancedMesh(this.devGeo, this.devMat, MAX_INST)
    this.devMesh.count = 0
    this.devMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.scene.add(this.devMesh)
  }

  // ===== 事件 =====
  _bindEvents() {
    const dom = this.renderer.domElement
    dom.addEventListener('click', this._onClick)
    dom.addEventListener('pointermove', this._onMove)
    dom.addEventListener('pointerleave', this._onLeave)
  }

  _raycastClient(cx, cy) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const p = new THREE.Vector2(
      ((cx - rect.left) / rect.width) * 2 - 1,
      -((cy - rect.top) / rect.height) * 2 + 1,
    )
    const rc = new THREE.Raycaster()
    rc.setFromCamera(p, this.camera)
    const hits = rc.intersectObjects([this.devMesh, this.cabMesh], false)
    for (const hit of hits) {
      if (hit.instanceId === undefined) continue
      if (hit.object === this.devMesh) {
        const d = this.devIndex.get(hit.instanceId)
        if (d) return { kind: 'device', id: d.deviceId, data: d }
      } else {
        const row = this.cabList?.[hit.instanceId]
        if (row) return { kind: 'cabinet', id: row.id, data: row }
      }
    }
    return null
  }

  _onClick = (e) => {
    const hit = this._raycastClient(e.clientX, e.clientY)
    if (!hit) { this.pickedId = null; this._applyHighlights(); return }
    this.pickedId = hit.kind === 'cabinet' ? 'cab:' + hit.id : 'dev:' + hit.id
    this._applyHighlights()
    if (hit.kind === 'cabinet') this.opts.onPickCabinet?.(hit.data)
    else this.opts.onPickDevice?.(hit.data)
  }

  _onMove = (e) => {
    const hit = this._raycastClient(e.clientX, e.clientY)
    const key = hit ? (hit.kind === 'cabinet' ? 'cab:' + hit.id : 'dev:' + hit.id) : null
    if (key !== this.hoverId) {
      this.hoverId = key
      this._applyHighlights()
      this.opts.onHover?.(hit ? { kind: hit.kind, ...hit.data } : null)
    }
    this.renderer.domElement.style.cursor = hit ? 'pointer' : ''
  }

  _onLeave = () => {
    if (this.hoverId) { this.hoverId = null; this._applyHighlights() }
    this.opts.onHover?.(null)
  }

  // ===== 数据装载（重建几何）=====
  setScene(data) {
    if (!data) return
    this.sceneData = data
    this.cabIndex.clear()
    this.devIndex.clear()
    this.statusByDevice.clear()
    this.pickedId = null
    this.hoverId = null

    const rows = data.room.rows || 1
    const cols = data.room.cols || 1
    const rowsY = Array.from({ length: rows }, (_, i) => (i - (rows - 1) / 2) * ROW_GAP)

    // 机柜：row → Y（前后排），col → X；本体色 = 柜内设备最差状态
    const cabCount = data.cabinets.length
    this.cabMesh.count = 0
    this.cabList = data.cabinets.slice()
    const m = new THREE.Matrix4()
    // 设备块贴面方向：初始相机水平朝向（dir.z>0 贴 +Z 面），避免被机柜遮挡
    const camDir = this.camera.position.clone().sub(this.controls.target)
    const faceZ = camDir.z >= 0 ? DEV_FACE_OFF : -DEV_FACE_OFF
    data.cabinets.forEach((c, i) => {
      const y = rowsY[(c.row - 1) % rows]
      const x = (c.col - 1 - (cols - 1) / 2) * COL_GAP
      this.cabIndex.set(c.id, { row: c.row, col: c.col, x, y, data: c })
      m.makeTranslation(x, CAB.h / 2, y)
      this.cabMesh.setMatrixAt(i, m)
      this.cabMesh.setColorAt(i, this._cabColor(c.devices))
    })
    this.cabMesh.count = cabCount
    this.cabMesh.instanceMatrix.needsUpdate = true
    if (this.cabMesh.instanceColor) this.cabMesh.instanceColor.needsUpdate = true
    this.cabFaceZ = faceZ

    // 设备：按柜内 U 位升序贴正面（Z 向偏移）
    let di = 0
    for (const c of data.cabinets) {
      const pos = this.cabIndex.get(c.id)
      if (!pos) continue
      const z = pos.y
      const x = pos.x
      // 设备块统一贴朝向初始相机的一侧（setScene 时计算，避免被机柜遮挡）
      const face = this.cabFaceZ
      for (const d of c.devices) {
        const u = d.u_start != null ? d.u_start : 0
        const h = Math.min(UNMANAGED_H, CAB.h - 0.3)
        const y = 0.35 + u * (CAB.h - 0.7) / 42
        m.makeTranslation(x, y, z + face)
        this.devMesh.setMatrixAt(di, m)
        this.devMesh.setColorAt(di, this._statusColor(d.status))
        this.devIndex.set(di, { deviceId: d.id, cabinetId: c.id, status: d.status, name: d.name, ip: d.ip })
        this.statusByDevice.set(d.id, d.status)
        di++
      }
    }
    this.devMesh.count = di
    this.devMesh.instanceMatrix.needsUpdate = true
    if (this.devMesh.instanceColor) this.devMesh.instanceColor.needsUpdate = true
    // InstancedMesh 的 mesh 级 boundingSphere 初始无效（radius<0），raycast 粗筛会跳过整个 mesh；
    // 必须在实例矩阵写完后重算，否则拾取恒为 null
    this.cabMesh.computeBoundingSphere()
    this.devMesh.computeBoundingSphere()
    this._refreshAlertFlag()
    this._applyHighlights()
    this._frameAll()
  }

  _statusColor(s) {
    return s && COLS[s] ? COLS[s] : UNM
  }

  // 机柜本体色 = 柜内设备最差状态（无设备 → 暗蓝本体）
  _cabColor(devices) {
    let worst = null
    for (const d of devices) {
      const s = d && d.status
      if (!s || !STATUS_RANK[s]) continue
      if (!worst || STATUS_RANK[s] > STATUS_RANK[worst]) worst = s
    }
    if (!worst) return new THREE.Color(CAB_BASE)
    // 与本体色混一点，机柜比设备块沉稳
    return COLS[worst].clone().lerp(new THREE.Color(CAB_BASE), worst === 'alert' ? 0.12 : 0.4)
  }

  _refreshAlertFlag() {
    this.hasAlert = false
    for (const d of this.devIndex.values()) if (d.status === 'alert') { this.hasAlert = true; break }
  }

  // ===== WS 增量改色（不重建场景）=====
  updateDeviceStatuses(statuses) {
    if (!this.sceneData) return
    let changed = false
    for (const s of statuses) {
      if (!s || !s.id) continue
      const old = this.statusByDevice.get(s.id)
      if (old === s.status) continue
      this.statusByDevice.set(s.id, s.status)
      for (const [iid, d] of this.devIndex.entries()) {
        if (d.deviceId === s.id) {
          d.status = s.status
          this.devMesh.setColorAt(iid, this._statusColor(s.status))
          changed = true
        }
      }
      // 同步到 sceneData（hover/抽屉数据一致）
      for (const c of this.sceneData.cabinets) {
        const d = c.devices.find((x) => x.id === s.id)
        if (d) d.status = s.status
      }
    }
    if (changed && this.devMesh.instanceColor) this.devMesh.instanceColor.needsUpdate = true
    if (changed) {
      // 同步刷新受影响机柜的本体色（最差状态可能变化）
      for (const [iid, c] of this.cabList.entries()) {
        this.cabMesh.setColorAt(iid, this._cabColor(c.devices))
      }
      if (this.cabMesh.instanceColor) this.cabMesh.instanceColor.needsUpdate = true
    }
    this._refreshAlertFlag()
  }

  // ===== 高亮（hover/选中描边）=====
  _applyHighlights() {
    // 清除旧 edge
    while (this.edgeBox) { this.scene.remove(this.edgeBox); this.edgeBox = null }
    const key = this.hoverId || this.pickedId
    if (!key || !key.startsWith('cab:')) return
    const cab = this.cabIndex.get(Number(key.slice(4)))
    if (!cab) return
    this.edgeBox = new THREE.LineSegments(this.edgeGeo, this.edgeMat)
    this.edgeBox.position.set(cab.x, CAB.h / 2, cab.y)
    this.scene.add(this.edgeBox)
  }

  // ===== 相机 =====
  _frameAll() {
    if (!this.sceneData) return
    const w = (this.sceneData.room.cols || 1) * COL_GAP + 6
    const d = (this.sceneData.room.rows || 1) * ROW_GAP + 6
    const dist = Math.max(w, d) * 0.9 + 4
    this.camera.position.set(dist * 0.55, dist * 0.55, dist * 0.75)
    this.controls.target.set(0, 1.5, 0)
    this.controls.update()
  }

  focusCabinet(cabId) {
    const c = this.cabIndex.get(cabId)
    if (!c) return
    this.focusTarget = new THREE.Vector3(c.x, CAB.h / 2, c.y)
  }

  focusDevice(deviceId) {
    for (const d of this.devIndex.values()) {
      if (d.deviceId === deviceId) {
        const c = this.cabIndex.get(d.cabinetId)
        if (c) this.focusTarget = new THREE.Vector3(c.x, CAB.h / 2, c.y)
        return
      }
    }
  }

  _loop = () => {
    if (this.disposed) return
    this._raf = requestAnimationFrame(this._loop)
    // alert 呼吸：整层 emissive 强度按正弦脉动
    this.devMat.emissiveIntensity = this.hasAlert
      ? 0.25 + 0.25 * Math.sin(performance.now() / 260)
      : 0
    // 聚焦缓动
    if (this.focusTarget) {
      this.controls.target.lerp(this.focusTarget, 0.12)
      const camGoal = this.focusTarget.clone().add(
        this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(9),
      )
      this.camera.position.lerp(camGoal, 0.08)
      if (this.controls.target.distanceTo(this.focusTarget) < 0.05) this.focusTarget = null
    }
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  _resize() {
    if (this.disposed) return
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this._raf)
    this._resizeObserver.disconnect()
    const dom = this.renderer.domElement
    dom.removeEventListener('click', this._onClick)
    dom.removeEventListener('pointermove', this._onMove)
    dom.removeEventListener('pointerleave', this._onLeave)
    this.controls.dispose()
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        mats.forEach((mt) => mt.dispose())
      }
    })
    this.renderer.dispose()
    if (dom.parentElement) dom.parentElement.removeChild(dom)
  }
}
