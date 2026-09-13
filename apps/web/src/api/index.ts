// 轻量 API client：统一 JWT + 错误处理
async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  })
  if (res.status === 401) {
    localStorage.removeItem('token')
    location.href = '/login'
    throw new Error('未登录')
  }
  if (!res.ok) {
    let detail = res.statusText
    try { const j = await res.json(); detail = JSON.stringify(j.detail ?? j) } catch { /* ignore */ }
    throw new Error(detail)
  }
  // 204 / 空 body（删除类接口返回 No Content）→ 安全返回 null
  if (res.status === 204 || res.headers.get('content-length') === '0') return null as T
  return res.json()
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; expires_in: number; role: import('../store/auth').Role }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    }),
  me: () => request<{ username: string; role: import('../store/auth').Role }>('/api/auth/me'),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  screenToken: () => request<{ token: string; expires_in: number }>('/api/auth/screen-token', { method: 'POST' }),
  overview: () => request<import('../types').Overview>('/api/overview'),
  devices: (q?: Record<string, string>) => {
    const s = q ? '?' + new URLSearchParams(q).toString() : ''
    return request<import('../types').Device[]>(`/api/devices${s}`)
  },
  device: (id: string) => request<import('../types').DeviceDetail>(`/api/devices/${id}`),
  deviceMetrics: (id: string, metric: string, from?: string, to?: string) => {
    const p = new URLSearchParams({ metric })
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return request<import('../types').MetricSeries[]>(`/api/devices/${id}/metrics?${p}`)
  },
  deviceAction: (id: string, action: string) =>
    request<Record<string, unknown>>(`/api/devices/${id}/actions/${action}`, { method: 'POST' }),
  alerts: (q?: Record<string, string>) => {
    const s = q ? '?' + new URLSearchParams(q).toString() : ''
    return request<import('../types').Alert[]>(`/api/alerts${s}`)
  },
  alertStats: (days = 7) => request<import('../types').AlertDailyCount[]>(`/api/alerts/stats?days=${days}`),
  ackAlert: (id: number) => request<{ id: number; acked: boolean }>(`/api/alerts/${id}/ack`, { method: 'POST' }),
  topologyVersions: () => request<import('../types').TopologyVersion[]>('/api/topology/versions'),
  saveTopology: (name: string | null, canvas: unknown) =>
    request<import('../types').TopologyVersion>('/api/topology', { method: 'POST', body: JSON.stringify({ name, canvas }) }),
  activateTopology: (id: number) =>
    request<import('../types').TopologyVersion>(`/api/topology/${id}/activate`, { method: 'POST' }),
  renameTopology: (id: number, name: string) =>
    request<import('../types').TopologyVersion>(`/api/topology/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteTopology: (id: number) => request<void>(`/api/topology/${id}`, { method: 'DELETE' }),
  topologyLinks: () =>
    request<import('../types').TopologyLinks>(`/api/topology/active/links`),
  getVersion: (id: number) =>
    request<import('../types').TopologyVersionDetail>(`/api/topology/${id}`),
  deviceTop: (metric = 'cpu', n = 10, windowHours = 1) =>
    request<import('../types').DeviceTopItem[]>(`/api/overview/top?metric=${metric}&n=${n}&window_hours=${windowHours}`),
  bizSystems: () => request<import('../types').BizSystem[]>('/api/biz-systems'),
  topologyActive: () => request<import('../types').TopologyActive>('/api/topology/active'),
  // ===== M6 后台管理 =====
  users: () => request<import('../types').UserAccount[]>('/api/users'),
  createUser: (body: { username: string; password: string; display_name?: string; role: string }) =>
    request<import('../types').UserAccount>('/api/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id: number, body: { display_name?: string; role?: string; enabled?: boolean }) =>
    request<import('../types').UserAccount>(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteUser: (id: number) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),
  resetPassword: (id: number, password: string) =>
    request<{ ok: boolean }>(`/api/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
  locations: () => request<import('../types').Location[]>('/api/locations'),
  createLocation: (body: { name: string; zone_type?: string; remark?: string | null }) =>
    request<import('../types').Location>('/api/locations', { method: 'POST', body: JSON.stringify(body) }),
  updateLocation: (id: number, body: { name: string; zone_type?: string; remark?: string | null }) =>
    request<import('../types').Location>(`/api/locations/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteLocation: (id: number) => request<void>(`/api/locations/${id}`, { method: 'DELETE' }),
  audit: (q?: Record<string, string>) => {
    const s = q ? '?' + new URLSearchParams(q).toString() : ''
    return request<import('../types').AuditPage>(`/api/audit${s}`)
  },
  // ===== M7 资产与空间 =====
  createDevice: (body: Record<string, unknown>) =>
    request<import('../types').Device>('/api/devices', { method: 'POST', body: JSON.stringify(body) }),
  updateDevice: (id: string, body: Record<string, unknown>) =>
    request<import('../types').Device>(`/api/devices/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteDevice: (id: string) => request<void>(`/api/devices/${id}`, { method: 'DELETE' }),
  batchDeviceStatus: (ids: string[], status: string) =>
    request<{ updated: number; missing: string[] }>('/api/devices/batch-status', {
      method: 'POST', body: JSON.stringify({ ids, status }),
    }),
  createBiz: (body: import('../types').BizSystemInput) =>
    request<import('../types').BizSystem>('/api/biz-systems', { method: 'POST', body: JSON.stringify(body) }),
  updateBiz: (id: number, body: import('../types').BizSystemInput) =>
    request<import('../types').BizSystem>(`/api/biz-systems/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteBiz: (id: number) => request<void>(`/api/biz-systems/${id}`, { method: 'DELETE' }),
  rooms: () => request<import('../types').Room[]>('/api/rooms'),
  createRoom: (body: { name: string; location_id?: number | null; rows: number; cols: number; remark?: string | null }) =>
    request<import('../types').Room>('/api/rooms', { method: 'POST', body: JSON.stringify(body) }),
  updateRoom: (id: number, body: { name: string; location_id?: number | null; rows: number; cols: number; remark?: string | null }) =>
    request<import('../types').Room>(`/api/rooms/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteRoom: (id: number) => request<void>(`/api/rooms/${id}`, { method: 'DELETE' }),
  roomCabinets: (roomId: number) =>
    request<import('../types').Cabinet[]>(`/api/rooms/${roomId}/cabinets`),
  createCabinet: (roomId: number, body: { name: string; row: number; col: number; u_height?: number; status?: string }) =>
    request<import('../types').Cabinet>(`/api/rooms/${roomId}/cabinets`, { method: 'POST', body: JSON.stringify(body) }),
  updateCabinet: (id: number, body: { name: string; row: number; col: number; u_height?: number; status?: string }) =>
    request<import('../types').Cabinet>(`/api/rooms/cabinets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteCabinet: (id: number) => request<void>(`/api/rooms/cabinets/${id}`, { method: 'DELETE' }),
  roomScene: (roomId: number) => request<import('../types').RoomScene>(`/api/rooms/${roomId}/scene`),
  ackAlerts: (ids: number[]) =>
    request<{ acked: number; missing: number[] }>('/api/alerts/ack-batch', {
      method: 'POST', body: JSON.stringify({ ids }),
    }),
}
