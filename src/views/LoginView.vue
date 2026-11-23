<script setup lang="ts">
/**
 * 登录页。
 * 四件事：表单校验、调接口拿 token、把 token 存进仓库、跳转到首页。
 * 注意错误提示不在这里弹——axios 拦截器已经统一弹过了，这里只负责恢复按钮状态。
 */

import { type FormInstance, type FormRules, ElMessage } from 'element-plus'
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { login } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive({
  username: '',
  password: '',
})

// 校验规则交给 el-form，不在提交函数里手写 if：规则集中一处，前端提示和后端校验口径一致
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
  ],
}

// 做什么：校验表单、请求登录接口、保存 token、跳到首页
// 入参：无（读 form）
// 返回：无；失败时提示已由拦截器弹出，这里只恢复按钮
// 为什么先存 token 再跳转：首页的根路径分流依赖 getToken()，顺序反了会回到登录页
async function handleSubmit(): Promise<void> {
  if (!formRef.value) return

  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const data = await login({ username: form.username, password: form.password })
    authStore.setToken(data.access_token)
    ElMessage.success('登录成功')
    router.push('/home')
  } catch {
    // 空 catch 是故意的：错误已经由 http 拦截器提示，这里不需要再处理
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <el-card class="login-card">
      <h1 class="title">锋煊 Agent 平台</h1>
      <p class="subtitle">登录后才能进入问答与知识库</p>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="handleSubmit"
      >
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="管理员创建的账号" clearable />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="至少 8 位"
            show-password
          />
        </el-form-item>

        <el-button class="submit" type="primary" native-type="submit" :loading="submitting">
          登录
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
}

.login-card {
  width: 380px;
}

.title {
  margin: 0 0 6px;
  font-size: 20px;
}

.subtitle {
  margin: 0 0 16px;
  color: #909399;
  font-size: 13px;
}

.submit {
  width: 100%;
}
</style>
