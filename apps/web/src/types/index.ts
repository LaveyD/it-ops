export interface BizSystem {
  id: number
  name: string
  owner: string | null
  status: 'normal' | 'warn' | 'alert'
  sla_target: number | null
  sla_actual: number | null
}

export interface Overview {
  device_count: number
  online_rate: number
  alert_counts: { info: number; warn: number; crit: number }
  unacked_alerts: number
  biz_systems: BizSystem[]
  topology: { id: number; name: string; version: number } | null
}

export interface ReferencedBy {
  topology_id: number
  topology_name: string
  node_id: string
  node_label: string
}

export interface Device {
  id: string
  name: string
  type: string
  ip: string | null
  status: 'normal' | 'warn' | 'alert'
  location: string | null
  location_id: number | null
  cabinet_id: number | null
  u_start: number | null
  owner: string | null
  extra: Record<string, unknown>
  referenced_by: ReferencedBy[]
}

export interface Alert {
  id: number
  device_id: string | null
  device_name: string | null
  level: 'info' | 'warn' | 'crit'
  title: string
  detail: string | null
  created_at: string
  acked: boolean
}

export interface DeviceDetail extends Device {
  latest_metrics: Record<string, number>
  recent_alerts: Array<{
    id: number; level: string; title: string; detail: string | null
    created_at: string; acked: boolean
  }>
}

export interface MetricSeries {
  metric: string
  points: [string, number][]
}

export interface AlertDailyCount {
  date: string
  info: number
  warn: number
  crit: number
}

export interface DeviceTopItem {
  device_id: string
  name: string
  metric: string
  value: number
}

export interface TopoNode {
  id: string
  label: string
  type: string
  color: string
  x: number
  y: number
  size: number
  properties?: { deviceId?: string }
  [k: string]: unknown
}

export interface TopoLink {
  id: string
  source: string
  target: string
  label: string
}

export interface TopoCanvas {
  nodes: TopoNode[]
  links: TopoLink[]
  groups?: Array<Record<string, unknown>>
}

export interface TopologyVersion {
  id: number
  name: string
  version: number
  is_active: boolean
  updated_at: string
}

export interface TopologyActive {
  id: number
  name: string
  version: number
  canvas: TopoCanvas
  devices: Record<string, { id: string; name: string; status: string; ip: string | null }>
}

// ===== M6 后台管理 =====
export type Role = 'admin' | 'operator' | 'viewer'

export interface UserAccount {
  id: number
  username: string
  display_name: string | null
  role: Role
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface Location {
  id: number
  name: string
  zone_type: 'headquarters' | 'branch' | 'machine_room' | 'other'
  remark: string | null
}

export interface AuditItem {
  id: number
  username: string
  action: string
  target_type: string | null
  target_id: string | null
  detail: Record<string, unknown>
  ip: string | null
  created_at: string
}

export interface AuditPage {
  items: AuditItem[]
  total: number
  page: number
  page_size: number
}

// ===== M7 资产与空间 =====
export interface Room {
  id: number
  name: string
  location_id: number | null
  rows: number
  cols: number
  remark: string | null
  created_at: string
  updated_at: string
}

export interface Cabinet {
  id: number
  room_id: number
  name: string
  row: number
  col: number
  u_height: number
  status: 'normal' | 'warn' | 'alert'
  created_at: string
  updated_at: string
}

export interface SceneDevice {
  id: string
  name: string
  type: string
  status: 'normal' | 'warn' | 'alert'
  u_start: number | null
  ip: string | null
}

export interface SceneCabinet extends Omit<Cabinet, 'room_id' | 'created_at' | 'updated_at'> {
  devices: SceneDevice[]
}

export interface RoomScene {
  room: { id: number; name: string; rows: number; cols: number; location_id: number | null; remark: string | null }
  cabinets: SceneCabinet[]
}

export interface BizSystemInput {
  name: string
  owner?: string | null
  status?: 'normal' | 'warn' | 'alert'
  sla_target?: number | null
  sla_actual?: number | null
}
