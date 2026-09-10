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
