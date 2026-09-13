import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { public: true } },
    // 大屏（M6 由 / 迁到 /dashboard，页面代码不动）
    { path: '/dashboard', name: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: 'IT 运维大屏' } },
    // 拓扑编辑器：M6 过渡路由（全屏深色）；M8 迁入 /admin/network/topology 并适配浅色壳
    { path: '/topology', name: 'topology-editor', component: () => import('../views/TopologyEditor.vue'), meta: { title: '拓扑编辑' } },
    { path: '/devices/:id', name: 'device', component: () => import('../views/DeviceDetail.vue') },
    // 后台管理：/admin 设 public，登录+viewer 拦截由 AdminLayout 内处理（避免守卫内异步 ensureMe）
    {
      path: '/admin',
      component: () => import('../layouts/AdminLayout.vue'),
      meta: { public: true },
      children: [
        { path: '', name: 'admin-overview', component: () => import('../views/admin/Overview.vue'), meta: { title: '总览' } },
        { path: 'assets/location', name: 'admin-location', component: () => import('../views/admin/Locations.vue'), meta: { title: '机房与区域' } },
        { path: 'assets/device', name: 'admin-device', component: () => import('../views/admin/Devices.vue'), meta: { title: '设备台账' } },
        { path: 'assets/biz', name: 'admin-biz', component: () => import('../views/admin/BizSystems.vue'), meta: { title: '业务系统' } },
        { path: 'alerts', name: 'admin-alerts', component: () => import('../views/admin/Alerts.vue'), meta: { title: '告警中心' } },
        { path: 'network/topology', name: 'admin-topology', component: () => import('../views/admin/Placeholder.vue'), meta: { title: '网络拓扑' } },
        { path: 'network/links', name: 'admin-links', component: () => import('../views/admin/Placeholder.vue'), meta: { title: '链路视图' } },
        { path: 'twin', name: 'admin-twin', component: () => import('../views/admin/Placeholder.vue'), meta: { title: '3D 总览' } },
        { path: 'twin/room', name: 'admin-twin-room', component: () => import('../views/admin/Placeholder.vue'), meta: { title: '3D 机房' } },
        { path: 'system/users', name: 'admin-users', component: () => import('../views/admin/Placeholder.vue'), meta: { title: '用户与角色' } },
        { path: 'system/audit', name: 'admin-audit', component: () => import('../views/admin/Placeholder.vue'), meta: { title: '审计日志' } },
        { path: 'system/notify', name: 'admin-notify', component: () => import('../views/admin/Placeholder.vue'), meta: { title: '通知配置' } },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  // 根路径按角色分流：viewer → 大屏，其余 → 后台
  if (to.path === '/') {
    if (!token) return { path: '/login' }
    const role = localStorage.getItem('role')
    return { path: role === 'viewer' ? '/dashboard' : '/admin' }
  }
  if (!to.meta.public && !token) return { path: '/login', query: { redirect: to.fullPath } }
  if (to.name === 'login' && token) return { path: '/' }
})

export default router
