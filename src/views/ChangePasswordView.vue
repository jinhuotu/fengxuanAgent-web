<script setup lang="ts">
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { changePassword } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { validateNewPassword, validatePasswordByteLimit } from '@/utils/passwordPolicy'

const router = useRouter()
const authStore = useAuthStore()
const formRef = ref<FormInstance>()
const submitting = ref(false)
const passwordForm = reactive({
  current_password: '',
  new_password: '',
  confirm_password: '',
})

// 做什么：检查两次输入的新密码是否一致
// 入参：表单校验规则、用户再次输入的新密码
// 返回：一致时完成；不一致时抛出错误，由表单显示提示
async function validateConfirmation(_validationRule: unknown, confirmedPassword: string): Promise<void> {
  if (confirmedPassword !== passwordForm.new_password) {
    throw new Error('两次输入的新密码不一致')
  }
}

const passwordRules: FormRules = {
  current_password: [
    { required: true, message: '请输入旧密码', trigger: 'blur' },
    { asyncValidator: validatePasswordByteLimit, trigger: 'blur' },
  ],
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { asyncValidator: validateNewPassword, trigger: 'blur' },
  ],
  confirm_password: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    { asyncValidator: validateConfirmation, trigger: 'blur' },
  ],
}

// 做什么：校验表单并提交改密，成功后清除登录状态
// 入参：无，读取当前表单和提交状态
// 返回：无；失败保留页面，错误由统一拦截器提示
async function handleSubmit(): Promise<void> {
  if (submitting.value || !formRef.value) return
  submitting.value = true
  try {
    const formValid = await formRef.value.validate().catch(() => false)
    if (!formValid) return
    await changePassword({
      current_password: passwordForm.current_password,
      new_password: passwordForm.new_password,
    })
    authStore.logout()
    formRef.value.resetFields()
    ElMessage.success('密码修改成功，请重新登录')
    await router.replace('/login')
  } catch {
    // 请求错误已经由统一拦截器提示，保留登录状态以便重试。
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-card class="password-card" shadow="never">
    <p class="form-eyebrow">SECURITY</p>
    <h1>修改密码</h1>
    <p class="form-subtitle">修改成功后需要使用新密码重新登录。</p>
    <el-form ref="formRef" :model="passwordForm" :rules="passwordRules" :disabled="submitting"
      label-position="top" @submit.prevent="handleSubmit">
      <el-form-item label="旧密码" prop="current_password">
        <el-input v-model="passwordForm.current_password" type="password" autocomplete="current-password" show-password />
      </el-form-item>
      <el-form-item label="新密码" prop="new_password">
        <el-input v-model="passwordForm.new_password" type="password" autocomplete="new-password" show-password />
      </el-form-item>
      <el-form-item label="确认新密码" prop="confirm_password">
        <el-input v-model="passwordForm.confirm_password" type="password" autocomplete="new-password" show-password />
      </el-form-item>
      <el-button type="primary" native-type="submit" :loading="submitting">确认修改</el-button>
    </el-form>
  </el-card>
</template>

<style scoped>
.password-card {
  width: min(560px, 100%);
  margin: 0 auto;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  --el-card-padding: 30px 32px;
}

.form-eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--color-primary);
}

.password-card h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.form-subtitle {
  margin: 8px 0 24px;
  color: var(--color-text-muted);
}

.password-card :deep(.el-form-item__label) {
  font-weight: 500;
  color: var(--color-text);
}

.password-card :deep(.el-button--primary) {
  min-width: 120px;
  margin-top: 4px;
}
</style>
