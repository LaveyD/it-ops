<script setup lang="ts">
// 系统管理 · 用户与角色：用户 CRUD / 重置密码 / 启用禁用 / 大屏令牌（admin 专属）
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../../api'
import type { Role, UserAccount } from '../../types'

const users = ref<UserAccount[]>([])
const loading = ref(false)
const roleLabel: Record<string, string> = { admin: '管理员', operator: '运维', viewer: '只读' }
const roleType: Record<string, 'danger' | 'warning' | 'info'> = { admin: 'danger', operator: 'warning', viewer: 'info' }

const visible = ref(false)
const form = reactive({ id: null as number | null, username: '', password: '', display_name: '', role: 'operator' as Role })

async function load() {
  loading.value = true
  try { users.value = await api.users() } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '加载用户失败')
  } finally { loading.value = false }
}
function openCreate() {
  Object.assign(form, { id: null, username: '', password: '', display_name: '', role: 'operator' })
  visible.value = true
}
async function save() {
  if (!form.username.trim() || form.username.length < 2) { ElMessage.warning('用户名至少 2 位'); return }
  if (form.id == null && form.password.length < 6) { ElMessage.warning('密码至少 6 位'); return }
  try {
    if (form.id == null) await api.createUser({ username: form.username, password: form.password, display_name: form.display_name || undefined, role: form.role })
    else await api.updateUser(form.id, { display_name: form.display_name || null, role: form.role })
    ElMessage.success('已保存')
    visible.value = false
    load()
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '保存失败') }
}
async function remove(u: UserAccount) {
  if (u.username === 'admin') { ElMessage.warning('不能删除内置 admin'); return }
  try { await ElMessageBox.confirm(`删除用户「${u.username}」？`, '确认', { type: 'warning' }) } catch { return }
  try { await api.deleteUser(u.id); ElMessage.success('已删除'); load() } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  }
}
async function toggleEnabled(u: UserAccount) {
  if (u.username === 'admin') { ElMessage.warning('不能禁用内置 admin'); return }
  try { await api.updateUser(u.id, { enabled: !u.enabled }); ElMessage.success(u.enabled ? '已禁用' : '已启用'); load() }
  catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '操作失败') }
}
async function resetPwd(u: UserAccount) {
  try {
    const { value } = await ElMessageBox.prompt(`重置「${u.username}」的密码`, '重置密码', {
      inputType: 'password', inputPattern: /^.{6,128}$/, inputErrorMessage: '密码至少 6 位',
    })
    await api.resetPassword(u.id, value)
    ElMessage.success('已重置')
  } catch { /* 取消 */ }
}
// 大屏令牌：生成 30 天 viewer 令牌（供大屏/电视免密登录），弹窗展示 + 可复制
const tokenBox = ref('')
const tokenVisible = ref(false)
async function issueToken() {
  try {
    await ElMessageBox.confirm('生成新的 30 天大屏只读令牌？旧令牌将仍可登录至过期。', '确认', { type: 'info' })
  } catch { return }
  try {
    const r = await api.screenToken()
    tokenBox.value = r.token
    tokenVisible.value = true
    ElMessage.success(`已生成（有效期 ${Math.round(r.expires_in / 86400)} 天）`)
  } catch (e: unknown) { ElMessage.error(e instanceof Error ? e.message : '生成失败') }
}
async function copyToken() {
  try { await navigator.clipboard.writeText(tokenBox.value); ElMessage.success('已复制') }
  catch { ElMessage.warning('复制失败，请手动选择') }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="hd">
          <span>用户与角色<span class="dim">（admin 全部 · operator 除系统管理 · viewer 无后台）</span></span>
          <div>
            <el-button size="small" @click="issueToken">大屏令牌</el-button>
            <el-button size="small" type="primary" @click="openCreate">新增用户</el-button>
          </div>
        </div>
      </template>
      <el-table :data="users" v-loading="loading" size="small">
        <el-table-column prop="username" label="用户名" min-width="140">
          <template #default="{ row }"><b>{{ row.username }}</b></template>
        </el-table-column>
        <el-table-column prop="display_name" label="显示名" min-width="120">
          <template #default="{ row }"><span class="dim">{{ row.display_name ?? '-' }}</span></template>
        </el-table-column>
        <el-table-column label="角色" width="100">
          <template #default="{ row }"><el-tag size="small" :type="roleType[row.role]">{{ roleLabel[row.role] }}</el-tag></template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }"><el-tag size="small" :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '禁用' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }"><span class="dim">{{ row.created_at.replace('T', ' ').slice(0, 19) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button link type="primary" @click="Object.assign(form, { id: row.id, username: row.username, password: '', display_name: row.display_name ?? '', role: row.role }), visible = true">编辑</el-button>
            <el-button link type="primary" @click="resetPwd(row)">重置密码</el-button>
            <el-button link :type="row.enabled ? 'warning' : 'success'" @click="toggleEnabled(row)">{{ row.enabled ? '禁用' : '启用' }}</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="visible" :title="form.id == null ? '新增用户' : `编辑 · ${form.username}`" width="440px">
      <el-form label-width="80px">
        <el-form-item label="用户名">
          <el-input v-model="form.username" :disabled="form.id != null" placeholder="如 op1" />
        </el-form-item>
        <el-form-item v-if="form.id == null" label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="显示名"><el-input v-model="form.display_name" /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 100%">
            <el-option value="admin" label="管理员（全部权限）" />
            <el-option value="operator" label="运维（除系统管理）" />
            <el-option value="viewer" label="只读（仅大屏）" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="tokenVisible" title="大屏只读令牌（30 天）" width="520px">
      <p class="dim">供大屏 / 电视免密登录，身份为内置 screen（viewer）。请妥善保存。</p>
      <el-input :model-value="tokenBox" readonly :autosize="{ minRows: 3 }" class="tok" />
      <template #footer>
        <el-button @click="tokenVisible = false">关闭</el-button>
        <el-button type="primary" @click="copyToken">复制</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.hd { display: flex; align-items: center; justify-content: space-between; }
.dim { color: #909399; font-size: 12px; margin-left: 8px; }
.tok :deep(.el-textarea__inner) { font-family: ui-monospace, monospace; font-size: 12px; }
</style>
