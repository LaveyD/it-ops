<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import type { DeviceDetail } from '../types'

const route = useRoute()
const device = ref<DeviceDetail | null>(null)
const id = route.params.id as string

onMounted(async () => {
  try {
    device.value = await api.device(id)
  } catch (e) {
    console.error(e)
  }
})
</script>

<template>
  <div class="dash">
    <header class="topbar">
      <div class="logo">IT 运维<span>大屏</span></div>
      <div class="nav">
        <router-link to="/">总览</router-link>
      </div>
      <div class="clock">设备详情（M5 完善指标大图）</div>
    </header>
    <div style="padding: 30px" v-if="device">
      <h2 style="margin-bottom: 16px">{{ device.name }} <span :class="'tag-' + device.status" class="tag">{{ device.status }}</span></h2>
      <p style="color: var(--text-dim); line-height: 2">
        ID: {{ device.id }} ｜ 类型: {{ device.type }} ｜ IP: {{ device.ip || '-' }}
        ｜ 机房: {{ device.location || '-' }} ｜ 责任人: {{ device.owner || '-' }}<br/>
        最新指标: {{ JSON.stringify(device.latest_metrics) }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.tag { font-size: 12px; padding: 2px 10px; border-radius: 999px; }
.tag-normal { background: rgba(34, 197, 94, 0.15); color: var(--ok); }
.tag-warn { background: rgba(250, 173, 20, 0.15); color: var(--warn); }
.tag-alert { background: rgba(255, 77, 79, 0.15); color: var(--crit); }
</style>
