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
  return res.json()
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; expires_in: number }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    }),
  me: () => request<{ username: string }>('/api/auth/me'),
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
  deviceTop: (metric = 'cpu', n = 10, windowHours = 1) =>
    request<import('../types').DeviceTopItem[]>(`/api/overview/top?metric=${metric}&n=${n}&window_hours=${windowHours}`),
  bizSystems: () => request<import('../types').BizSystem[]>('/api/biz-systems'),
  topologyActive: () => request<import('../types').TopologyActive>('/api/topology/active'),
}
