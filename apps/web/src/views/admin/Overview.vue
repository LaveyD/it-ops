<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../../api'
import type { Overview } from '../../types'

const overview = ref<Overview | null>(null)
const err = ref('')

onMounted(async () => {
  try {
    overview.value = await api.overview()
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '加载失败'
  }
})

const quickLinks = [
  { to: '/admin/network/topology', label: '网络拓扑', desc: '编辑 / 只读 / 版本管理' },
  { to: '/admin/network/links', label: '链路视图', desc: '派生链路台账' },
  { to: '/admin/alerts', label: '告警中心', desc: '筛选 / 批量确认' },
  { to: '/admin/assets/device', label: '设备台账', desc: 'CRUD / 状态' },
  { to: '/admin/twin', label: '状态孪生', desc: '实时状态 / 异常定位' },
  { to: '/admin/twin/room', label: '3D 机房', desc: '三维机房' },
  { to: '/admin/system/users', label: '用户与角色', desc: 'RBAC / 大屏令牌' },
]
</script>

<template>
  <div>
    <div class="stats" v-if="overview">
      <div class="stat"><div class="v">{{ overview.device_count }}</div><div class="k">设备总数</div></div>
      <div class="stat"><div class="v">{{ (overview.online_rate * 100).toFixed(1) }}%</div><div class="k">在线率</div></div>
      <div class="stat"><div class="v">{{ overview.unacked_alerts }}</div><div class="k">未确认告警</div></div>
      <div class="stat"><div class="v">v{{ overview.topology?.version ?? '-' }}</div><div class="k">拓扑版本</div></div>
      <div class="stat"><div class="v">{{ overview.biz_systems.length }}</div><div class="k">业务系统</div></div>
    </div>
    <p class="err" v-else-if="err">{{ err }}</p>

    <div class="grid">
      <router-link v-for="q in quickLinks" :key="q.to" :to="q.to" class="ql">
        <div class="ql-title">{{ q.label }}</div>
        <div class="ql-desc">{{ q.desc }}</div>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.stats { display: flex; gap: 14px; margin-bottom: 18px; }
.stat { flex: 1; background: #fff; border: 1px solid #e8eaef; border-radius: 10px; padding: 16px 18px; }
.stat .v { font-size: 26px; font-weight: 700; color: #1f2d3d; }
.stat .k { font-size: 13px; color: #8593a3; margin-top: 4px; }
.err { color: #ff4d4f; font-size: 13px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.ql { display: block; background: #fff; border: 1px solid #e8eaef; border-radius: 10px; padding: 18px; transition: border-color .15s, box-shadow .15s; }
.ql:hover { border-color: #1890ff; box-shadow: 0 4px 14px rgba(24,144,255,.12); }
.ql-title { font-size: 15px; font-weight: 600; color: #1f2d3d; }
.ql-desc { font-size: 12px; color: #8593a3; margin-top: 6px; }
</style>
