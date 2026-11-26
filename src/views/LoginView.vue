<script setup lang="ts">
/**
 * 登录页。
 * 布局：左边品牌介绍区，右边登录表单。
 * 四件事：表单校验、调接口拿 token、把 token 存进仓库、跳转到首页。
 * 注意错误提示不在这里弹——axios 拦截器已经统一弹过了，这里只负责恢复按钮状态。
 */

import { type FormInstance, type FormRules, ElMessage } from 'element-plus'
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { login } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { validatePasswordByteLimit } from '@/utils/passwordPolicy'

const authStore = useAuthStore()
const router = useRouter()
const formRef = ref<FormInstance>()
const submitting = ref(false)

// 仅本地开发用的预填账号密码：打开登录页自动带上，省得每次手输。
// 注意：不要把这两行带进生产环境或提交到正式分支，真实密码不能写在前端源码里。
const DEV_DEFAULT_USERNAME = 'admin'
const DEV_DEFAULT_PASSWORD = 'Aa980210.0'

const form = reactive({
  username: DEV_DEFAULT_USERNAME,
  password: DEV_DEFAULT_PASSWORD,
})

// 左侧品牌区的三条能力说明：只是文字，不随权限变化
const PRODUCT_FEATURES = [
  { title: '流式 AI 对话', description: '回答逐段出现，随时可以停止生成。' },
  { title: '角色与权限', description: '按角色控制菜单和操作，各司其职。' },
  { title: '个人会话', description: '历史记录只对自己可见。' },
]

// 校验规则交给 el-form，不在提交函数里手写 if：规则集中一处，前端提示和后端校验口径一致
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
    { asyncValidator: validatePasswordByteLimit, trigger: 'blur' },
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
    <!-- 左：品牌区，窄屏隐藏，把空间让给表单。墨色底 + 暖橙光晕，与工作台顶部横幅同一套 -->
    <aside class="login-intro" aria-label="产品介绍">
      <div class="intro-brand">
        <span class="brand-mark">锋</span>
        <span class="brand-name">锋煊 Agent<small>智能工作空间</small></span>
      </div>

      <div class="intro-copy">
        <h1>让 AI 成为团队里<br />随叫随到的工作伙伴</h1>
        <p>登录后即可开始对话、管理成员与权限。</p>
      </div>

      <ul class="intro-features">
        <li v-for="feature in PRODUCT_FEATURES" :key="feature.title">
          <span class="feature-dot" aria-hidden="true"></span>
          <div>
            <strong>{{ feature.title }}</strong>
            <small>{{ feature.description }}</small>
          </div>
        </li>
      </ul>

      <footer class="intro-footer">锋煊 Agent 平台 · 内部使用</footer>
    </aside>

    <!-- 右：表单区 -->
    <main class="login-form-panel">
      <el-card class="login-card" shadow="never">
        <p class="form-eyebrow">欢迎回来</p>
        <h2 class="form-title">登录你的账号</h2>
        <p class="form-subtitle">使用管理员创建的账号登录</p>

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large" @submit.prevent="handleSubmit">
          <el-form-item label="用户名" prop="username">
            <el-input v-model="form.username" placeholder="请输入用户名" clearable autocomplete="username" />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input v-model="form.password" type="password" placeholder="至少 8 位" show-password autocomplete="current-password" />
          </el-form-item>

          <el-button class="submit ink-button" type="primary" size="large" native-type="submit" :loading="submitting">
            登录
          </el-button>
        </el-form>
      </el-card>
    </main>
  </div>
</template>

<style scoped>
/* ---------- 整体：左右两栏，各占一半。底色用全站暖白 ---------- */
.login-page {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  min-height: 100dvh;
  background: var(--color-canvas);
}

/* ---------- 左侧品牌区：墨色圆角板浮在暖白底上，内容纵向三段 ---------- */
.login-intro {
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - 32px);
  margin: 16px;
  padding: 36px 44px 28px;
  border-radius: var(--radius-card);
  color: #ffffff;
  /* 光晕颜色和工作台横幅一致：右上角一团暖橙，避免整块墨色显得沉 */
  background:
    radial-gradient(circle at 88% -6%, rgba(214, 124, 86, 0.38) 0, transparent 46%),
    var(--color-ink);
}

.intro-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}

/* 全局的 .brand-mark 是墨色底，放在墨色板上会看不见，这里换成暖白底 */
.intro-brand .brand-mark {
  width: 38px;
  height: 38px;
  background: rgba(255, 255, 255, 0.94);
  color: var(--color-ink);
}

.brand-name small {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.55);
}

.intro-copy {
  margin: auto 0;
  padding: 40px 0;
}

.intro-copy h1 {
  margin: 0 0 16px;
  font-size: clamp(30px, 3vw, 42px);
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: 0.02em;
}

.intro-copy p {
  margin: 0;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.66);
}

.intro-features {
  display: grid;
  gap: 18px;
  margin: 0 0 40px;
  padding: 0;
  list-style: none;
}

.intro-features li {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.feature-dot {
  width: 10px;
  height: 10px;
  margin-top: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  /* 圆点用全站的暖橙点缀色，和表单里的小标题呼应 */
  background: var(--color-accent);
  box-shadow: 0 0 0 4px rgba(201, 100, 66, 0.24);
}

.intro-features strong {
  display: block;
  font-size: 15px;
  font-weight: 600;
}

.intro-features small {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.58);
}

.intro-footer {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.38);
}

/* ---------- 右侧表单区：卡片固定宽度并垂直居中，样子与改密码页的白卡一致 ---------- */
.login-form-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.login-card {
  width: 100%;
  max-width: 400px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  --el-card-border-color: var(--color-line);
  --el-card-bg-color: var(--color-surface);
  --el-card-padding: 36px 36px 32px;
}

/* 小标题用暖橙，和工作台分区标签、改密码页同一种写法 */
.form-eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--color-accent);
}

.form-title {
  margin: 0;
  font-size: 26px;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: var(--color-ink);
}

.form-subtitle {
  margin: 8px 0 28px;
  font-size: 14px;
  color: var(--color-text-muted);
}

.login-card :deep(.el-form-item__label) {
  font-weight: 500;
  color: var(--color-text);
}

/* 登录是这一页唯一的主动作，用墨色实心按钮，高度比默认再高一点更好点 */
.submit {
  width: 100%;
  height: 44px;
  margin-top: 8px;
  font-size: 15px;
}

/* ---------- 窄屏：隐藏品牌区，表单占满 ---------- */
@media (max-width: 960px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-intro {
    display: none;
  }
}
</style>
