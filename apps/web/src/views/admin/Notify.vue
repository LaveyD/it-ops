<script setup lang="ts">
// 系统管理 · 通知配置：渠道表单（webhook / 邮件）仅落地保存，推送 M+ 再做
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../../api'

const form = reactive({
  webhook_url: '', email_to: '', email_from: '', notify_alert: true,
})
const meta = ref<{ updated_by: string | null; updated_at: string } | null>(null)
const loading = ref(false)
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const c = await api.notifyConfig()
    Object.assign(form, {
      webhook_url: c.webhook_url ?? '', email_to: c.email_to ?? '',
      email_from: c.email_from ?? '', notify_alert: c.notify_alert,
    })
    meta.value = { updated_by: c.updated_by, updated_at: c.updated_at }
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '加载配置失败') }
  finally { loading.value = false }
}
async function save() {
  saving.value = true
  try {
    const r = await api.saveNotifyConfig({
      webhook_url: form.webhook_url.trim() || null,
      email_to: form.email_to.trim() || null,
      email_from: form.email_from.trim() || null,
      notify_alert: form.notify_alert,
    })
    ElMessage.success('已保存')
    meta.value = { updated_by: r.updated_by, updated_at: r.updated_at }
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '保存失败') }
  finally { saving.value = false }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <el-card shadow="never" v-loading="loading">
      <template #header>
        <div class="hd">
          <span>通知配置</span>
          <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </template>

      <el-alert class="note" type="info" :closable="false" show-icon
        title="M10 阶段仅落地保存配置；实际推送（webhook / 邮件）在后续里程碑接入。" />

      <el-form label-width="110px" class="form">
        <el-divider content-position="left">Webhook</el-divider>
        <el-form-item label="Webhook URL">
          <el-input v-model="form.webhook_url" placeholder="https://…/hook （如飞书 / 钉钉机器人）" clearable />
        </el-form-item>
        <el-form-item label="严重告警推送">
          <el-switch v-model="form.notify_alert" />
          <span class="dim">开启后，严重（alert）告警触发时推送（推送逻辑 M+ 接入）</span>
        </el-form-item>

        <el-divider content-position="left">邮件</el-divider>
        <el-form-item label="收件人">
          <el-input v-model="form.email_to" placeholder="ops@example.com（多个用英文逗号分隔）" clearable />
        </el-form-item>
        <el-form-item label="发件人">
          <el-input v-model="form.email_from" placeholder="it-ops@example.com" clearable />
        </el-form-item>
      </el-form>

      <div v-if="meta" class="meta dim">
        最后更新：{{ meta.updated_by ?? '系统' }} · {{ (meta.updated_at || '').replace('T', ' ').slice(0, 19) }} UTC
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.hd { display: flex; align-items: center; justify-content: space-between; }
.dim { color: #909399; font-size: 12px; }
.note { margin-bottom: 18px; }
.form { max-width: 720px; }
.meta { margin-top: 8px; }
</style>
