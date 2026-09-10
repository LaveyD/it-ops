<script setup lang="ts">
</script>

<template>
  <div class="dash">
    <header class="topbar">
      <div class="logo">IT 运维<span>大屏</span></div>
      <div class="nav">
        <router-link to="/">总览</router-link>
        <router-link to="/editor" class="active">拓扑编辑</router-link>
      </div>
    </header>
    <div style="padding: 40px; color: var(--text-dim)">
      <h2 style="color: var(--text); margin-bottom: 12px">拓扑编辑器</h2>
      <p>M3 接入：移植 GraphVis 3D 编辑器（增删节点 / 连线 / 分组 / 节点关联设备 / 保存版本）。</p>
    </div>
  </div>
</template>
