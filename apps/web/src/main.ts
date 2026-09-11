import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

// 大屏令牌引导：/dashboard?token=*** → 写入 localStorage 后由登录分流接管
// （电视/大屏机用 admin 签发的 30 天 viewer 令牌免密进入）
const url = new URL(window.location.href)
const qtoken = url.searchParams.get('token')
if (qtoken) {
  localStorage.setItem('token', qtoken)
  url.searchParams.delete('token')
  window.history.replaceState({}, '', url.pathname)
}

createApp(App).use(createPinia()).use(router).mount('#app')
