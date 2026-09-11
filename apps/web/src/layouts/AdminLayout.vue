<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../store/auth'
import { api } from '../api'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

onMounted(async () => {
  // /admin 为 public 路由：这里做登录 + 角色拦截（viewer 无后台入口）
  if (!localStorage.getItem('token')) {
    router.replace({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  await auth.ensureMe()
  if (auth.role === 'viewer') {
    router.replace('/dashboard')
    return
  }
})

const roleLabel: Record<string, string> = {
  admin: '管理员', operator: '运维', viewer: '只读',
}

function goScreen() {
  router.push('/dashboard')
}

async function logout() {
  try { await api.logout() } catch { /* 忽略，前端清即可 */ }
  auth.logout()
  router.push('/login')
}

// M6 菜单骨架（后续里程碑逐页实现：M7 资产/告警、M8 网络、M9 孪生、M10 系统）
const menus = [
  { index: '/admin', title: '总览' },
  { index: '/admin/assets/location', title: '机房与区域' },
  { index: '/admin/assets/device', title: '设备台账' },
  { index: '/admin/assets/biz', title: '业务系统' },
  { index: '/admin/alerts', title: '告警中心' },
  { index: '/admin/network/topology', title: '网络拓扑' },
  { index: '/admin/network/links', title: '链路视图' },
  { index: '/admin/twin', title: '3D 总览' },
  { index: '/admin/twin/room', title: '3D 机房' },
  { index: '/admin/system/users', title: '用户与角色' },
  { index: '/admin/system/audit', title: '审计日志' },
  { index: '/admin/system/notify', title: '通知配置' },
]
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-side">
      <div class="brand">
        <span class="dot" /> IT 运维平台
      </div>
      <nav class="admin-menu">
        <router-link
          v-for="m in menus"
          :key="m.index"
          :to="m.index"
          class="menu-item"
          :class="{ active: route.path === m.index }"
        >
          <span class="mi-title">{{ m.title }}</span>
        </router-link>
      </nav>
      <div class="side-foot">
        <a href="#" @click.prevent="goScreen">进入大屏</a>
      </div>
    </aside>
    <main class="admin-main">
      <header class="admin-top">
        <div class="crumb">{{ route.meta.title || '后台管理' }}</div>
        <div class="user-box">
          <span class="uname">{{ auth.username }}</span>
          <span class="role-chip">{{ auth.role ? roleLabel[auth.role] : '' }}</span>
          <a href="#" @click.prevent="logout">退出</a>
        </div>
      </header>
      <div class="admin-body">
        <router-view />
      </div>
    </main>
  </div>
</template>

<style scoped>
.admin-shell { display: flex; height: 100vh; background: #f5f7fa; color: #1f2d3d; }
.admin-side {
  width: 216px; flex-shrink: 0; background: #00152e; color: #cfd8e3;
  display: flex; flex-direction: column;
}
.brand { padding: 20px 18px; font-size: 16px; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 8px; }
.brand .dot { width: 10px; height: 10px; border-radius: 50%; background: #1890ff; box-shadow: 0 0 8px #1890ff; }
.admin-menu { flex: 1; overflow-y: auto; padding: 8px 10px; }
.menu-item {
  display: block; padding: 11px 14px; margin-bottom: 4px; border-radius: 8px;
  color: #cfd8e3; font-size: 14px; transition: background .15s;
}
.menu-item:hover { background: rgba(255,255,255,.06); color: #fff; }
.menu-item.active { background: #1890ff; color: #fff; }
.side-foot { padding: 14px 18px; border-top: 1px solid rgba(255,255,255,.08); }
.side-foot a { color: #69b1ff; font-size: 13px; }
.admin-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.admin-top {
  height: 52px; background: #fff; border-bottom: 1px solid #e8eaef;
  display: flex; align-items: center; justify-content: space-between; padding: 0 20px;
}
.crumb { font-size: 15px; font-weight: 600; }
.user-box { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.uname { color: #333; }
.role-chip { background: #e6f4ff; color: #1890ff; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.user-box a { color: #999; }
.admin-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
</style>
