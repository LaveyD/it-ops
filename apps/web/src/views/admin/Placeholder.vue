<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
const milestone: Record<string, string> = {
  '/admin/assets/location': 'M7 资产与空间',
  '/admin/assets/device': 'M7 资产与空间',
  '/admin/assets/biz': 'M7 资产与空间',
  '/admin/alerts': 'M7 告警中心',
  '/admin/system/audit': 'M10 系统管理',
  '/admin/system/notify': 'M10 系统管理',
}
const m = milestone[route.path] || '后续里程碑'
</script>

<template>
  <div class="ph">
    <div class="ph-box">
      <div class="ph-badge">{{ m }}</div>
      <h2>{{ route.meta.title || '建设中' }}</h2>
      <p>该页面将在后续里程碑实现（见 docs/06-split-and-admin-plan.md）。</p>
      <p class="dim">M6 已交付：后台管理壳 + 角色 RBAC + 大屏令牌 + 审计底座。</p>
    </div>
  </div>
</template>

<style scoped>
.ph { height: 100%; display: flex; align-items: center; justify-content: center; }
.ph-box {
  background: #fff; border: 1px solid #e8eaef; border-radius: 12px;
  padding: 40px 48px; text-align: center; max-width: 460px;
}
.ph-badge { display: inline-block; background: #e6f4ff; color: #1890ff; padding: 4px 12px; border-radius: 14px; font-size: 12px; margin-bottom: 14px; }
h2 { margin: 0 0 10px; font-size: 20px; color: #1f2d3d; }
p { margin: 4px 0; color: #5a6b7f; font-size: 14px; }
.dim { color: #9aa7b6; font-size: 12px; }
</style>
