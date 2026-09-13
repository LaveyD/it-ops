import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElIcons from '@element-plus/icons-vue'
// EP 基础变量/reset + 用到的组件样式（用 theme-chalk 预编译独立 css，
// 不用 index.css：其含 a{display:inline-block} 等未作用域规则，会污染大屏/登录页；
// 这些 css 全部 .el- 前缀作用域，且 style.css 最后加载兜底）
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-card.css'
import 'element-plus/theme-chalk/el-checkbox.css'
import 'element-plus/theme-chalk/el-checkbox-group.css'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-drawer.css'
import 'element-plus/theme-chalk/el-dropdown.css'
import 'element-plus/theme-chalk/el-dropdown-item.css'
import 'element-plus/theme-chalk/el-dropdown-menu.css'
import 'element-plus/theme-chalk/el-form.css'
import 'element-plus/theme-chalk/el-form-item.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-input-number.css'
import 'element-plus/theme-chalk/el-loading.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-radio.css'
import 'element-plus/theme-chalk/el-radio-button.css'
import 'element-plus/theme-chalk/el-radio-group.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-select-dropdown.css'
import 'element-plus/theme-chalk/el-table.css'
import 'element-plus/theme-chalk/el-table-column.css'
import 'element-plus/theme-chalk/el-tag.css'
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

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus)
for (const [name, comp] of Object.entries(ElIcons)) app.component(name, comp)
app.mount('#app')
