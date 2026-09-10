import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { public: true } },
    { path: '/', name: 'dashboard', component: () => import('../views/Dashboard.vue') },
    { path: '/editor', name: 'editor', component: () => import('../views/TopologyEditor.vue') },
    { path: '/devices/:id', name: 'device', component: () => import('../views/DeviceDetail.vue') },
  ],
})

router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  if (!to.meta.public && !token) return { name: 'login' }
  if (to.name === 'login' && token) return { name: 'dashboard' }
})

export default router
