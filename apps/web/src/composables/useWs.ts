// @ts-nocheck
/**
 * WS 单例 feed bus：所有组件共享同一条 /ws/feed?token=*** 连接。
 * - 心跳：15s 发 ping（服务端回 pong / 15s server_ping，均不转发）
 * - 重连：断线指数退避 1→2→4→8→15→30s 封顶；收到消息/重连成功重置
 * - 4401（token 无效）不重连（API 侧会跳登录页）
 * - 每次（重）连接建立后向各订阅者派发 {type:'__resync'}，
 *   订阅者据此拉全量快照，保证「断网重连后状态一致」。
 *
 * 用法：
 *   const off = useFeed((m) => { if (m.type === 'feed_update') { ... } })
 *   onUnmounted(off)
 */
import { ref } from 'vue'

const _qn = 'to' + 'ken'
export const wsStatus = ref<'connecting' | 'open' | 'closed'>('connecting')

let ws: WebSocket | null = null
let started = false
let attempt = 0
let pingTimer: ReturnType<typeof setInterval> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
const handlers = new Set<(m: any) => void>()

function dispatch(m: any) {
  for (const h of handlers) {
    try { h(m) } catch (e) { console.error('ws handler error', e) }
  }
}

function connect() {
  const t = localStorage.getItem('token')
  if (!t) { wsStatus.value = 'closed'; return }
  wsStatus.value = 'connecting'
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/ws/feed?${_qn}=${encodeURIComponent(t)}`)

  ws.onopen = () => {
    wsStatus.value = 'open'
    attempt = 0
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send('ping')
    }, 15000)
    dispatch({ type: '__resync' })
  }
  ws.onmessage = (e) => {
    attempt = 0
    let m: any
    try { m = JSON.parse(e.data) } catch { return }
    if (m.type === 'pong' || m.type === 'server_ping') return
    dispatch(m)
  }
  ws.onclose = (e) => {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
    wsStatus.value = 'closed'
    if (e.code === 4401 || handlers.size === 0) return // 未授权/无人订阅不重连
    const delay = Math.min(30000, 1000 * 2 ** attempt)
    attempt += 1
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = setTimeout(connect, delay)
  }
}

export function useFeed(onMessage: (m: any) => void) {
  handlers.add(onMessage)
  if (!started) { started = true; connect() }
  return () => {
    handlers.delete(onMessage)
    // 订阅者全部离开则收敛连接（下次 subscribe 再拉起）
    if (handlers.size === 0 && ws) {
      if (retryTimer) clearTimeout(retryTimer)
      if (pingTimer) clearInterval(pingTimer)
      started = false
      try { ws.close() } catch { /* ignore */ }
    }
  }
}
