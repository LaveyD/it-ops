import { defineStore } from 'pinia'
import { api } from '../api'

export type Role = 'admin' | 'operator' | 'viewer'

interface AuthState {
  username: string | null
  role: Role | null
  meLoaded: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    username: localStorage.getItem('username'),
    role: (localStorage.getItem('role') as Role) || null,
    meLoaded: false,
  }),
  actions: {
    async login(username: string, password: string) {
      const { token, role } = await api.login(username, password)
      localStorage.setItem('token', token)
      localStorage.setItem('username', username)
      localStorage.setItem('role', role)
      this.username = username
      this.role = role
      this.meLoaded = true
    },
    /** 已有 token 但 role 未缓存时，拉 /me 补全（路由守卫用）。幂等。 */
    async ensureMe() {
      if (this.meLoaded && this.role) return
      const token = localStorage.getItem('token')
      if (!token) return
      try {
        const me = await api.me()
        localStorage.setItem('username', me.username)
        localStorage.setItem('role', me.role)
        this.username = me.username
        this.role = me.role
        this.meLoaded = true
      } catch {
        // 401 时 api 已清 token 并跳登录；这里仅标记未就绪
        this.meLoaded = false
      }
    },
    logout() {
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      localStorage.removeItem('role')
      this.username = null
      this.role = null
      this.meLoaded = false
    },
  },
})
