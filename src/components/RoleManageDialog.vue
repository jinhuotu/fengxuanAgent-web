<script setup lang="ts">
import { computed } from 'vue'
import type { RoleSummary, UserListItem } from '@/types/api'

const props = defineProps<{
  action: 'bind' | 'unbind'
  user: Pick<UserListItem, 'id' | 'username'> | null
  options: RoleSummary[]
  loading: boolean
  saving: boolean
  showAdminWarning: boolean
}>()
const emit = defineEmits<{ submit: [] }>()

// 新手注意：v-model 像传话，弹窗的改动通过事件交回页面保存。
const visible = defineModel<boolean>({ required: true })
const roleCode = defineModel<string>('roleCode', { required: true })
const title = computed(() => props.action === 'bind' ? '追加角色' : '撤销角色')
</script>

<template>
  <el-dialog v-model="visible" :title="title" width="min(440px, calc(100% - 32px))"
    :show-close="!props.saving" :close-on-click-modal="!props.saving" :close-on-press-escape="!props.saving">
    <p v-if="props.user">目标用户：{{ props.user.username }}，编号 {{ props.user.id }}</p>
    <el-select v-model="roleCode" :aria-label="title" placeholder="请选择角色"
      :loading="props.loading" :disabled="props.loading || props.saving">
      <el-option v-for="role in props.options" :key="role.code" :label="role.name" :value="role.code" />
    </el-select>
    <el-alert v-if="props.showAdminWarning" class="admin-role-warning"
      title="管理员角色包含用户管理权限，请确认目标账号。" type="warning" :closable="false" />
    <template #footer>
      <el-button :disabled="props.saving" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="props.saving" :disabled="!roleCode || props.loading" @click="emit('submit')">
        {{ props.action === 'bind' ? '确认追加' : '确认撤销' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.admin-role-warning {
  margin-top: 12px;
}
</style>
