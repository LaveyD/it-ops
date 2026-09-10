<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../store/auth'

const router = useRouter()
const auth = useAuthStore()
const form = reactive({ username: 'admin', password: '' })
const err = ref('')
const loading = ref(false)

async function doLogin() {
  err.value = ''
  loading.value = true
  try {
    await auth.login(form.username, form.password)
    router.push('/')
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-wrap">
    <div class="login-card">
      <h1>IT 运维大屏</h1>
      <p class="sub">Network Topology · Realtime Monitoring</p>
      <input v-model="form.username" placeholder="用户名" @keyup.enter="doLogin" />
      <input v-model="form.password" type="password" placeholder="密码" @keyup.enter="doLogin" />
      <p class="login-err">{{ err }}</p>
      <button :disabled="loading" @click="doLogin">{{ loading ? '登录中…' : '登 录' }}</button>
    </div>
  </div>
</template>
