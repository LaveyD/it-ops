<script setup lang="ts">
// 值班信息：本期静态配置（M5 可改为后端配置接口）
const duty = {
  date: new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }),
  shift: '白班 09:00–18:00',
  on_duty: '王工 · 网络组',
  phone: '138****6688',
  backup: '李工 · 系统组',
  note: '重大变更需提前 24h 报备',
}
</script>

<template>
  <div class="duty">
    <div class="row"><span class="k">班次</span><span class="v">{{ duty.shift }}</span></div>
    <div class="row"><span class="k">值班</span><span class="v">{{ duty.on_duty }}</span></div>
    <div class="row"><span class="k">电话</span><span class="v mono">{{ duty.phone }}</span></div>
    <div class="row"><span class="k">备岗</span><span class="v">{{ duty.backup }}</span></div>
    <div class="note">{{ duty.note }}</div>
  </div>
</template>

<style scoped>
.duty { display: flex; flex-direction: column; gap: 9px; font-size: 13px; }
.row { display: flex; justify-content: space-between; align-items: center; }
.k { color: var(--text-dim); font-size: 12px; }
.v { font-weight: 600; }
.mono { font-family: ui-monospace, monospace; letter-spacing: 1px; }
.note {
  margin-top: 2px; padding: 7px 10px; font-size: 11px; color: var(--warn);
  background: rgba(250, 173, 20, 0.08); border: 1px dashed rgba(250, 173, 20, 0.35); border-radius: 6px;
}
</style>
