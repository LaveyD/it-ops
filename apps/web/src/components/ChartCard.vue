<script setup lang="ts">
// 统一卡片壳：标题 + 右侧辅助信息 + 内容区
defineProps<{
  title: string
  time?: string
  extra?: string
}>()
</script>

<template>
  <section class="card">
    <div class="head">
      <span class="t">{{ title }}</span>
      <span class="time" v-if="time || extra">{{ time || extra }}</span>
    </div>
    <div class="body">
      <slot />
    </div>
  </section>
</template>
