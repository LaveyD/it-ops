import { defineStore } from 'pinia'
import { api } from '../api'

interface AuthState {
  username: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({ username: localStorage.getItem('username') }),
  actions: {
    async login(username: string, password: string) {
      const { token } = await api.login(username, password)
      localStorage.setItem('token', token)
      localStorage.setItem('username', username)
      this.username = username
    },
    logout() {
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      this.username = null
    },
  },
})
