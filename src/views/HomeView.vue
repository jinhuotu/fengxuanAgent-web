<script setup lang="ts">
/**
 * 登录后的首页。
 * 进页面先调 /auth/me，拿后端认过的人，而不是信任本地存的字符串。
 * token 失效就清掉并回登录页，其他错误只提示不跳。
 */
import type { AxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getCurrentUser } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import type { UserInfo } from '@/types/api'

const router = useRouter()
const authStore = useAuthStore()
const currentUser = ref<UserInfo | null>(null)
const loading = ref(true)

// 做什么：向后端要当前用户，确认这枚 token 真代表某个人
// 入参：无
// 返回：无；401 清 token 回登录页，其他错误只提示留在原地
// 为什么区分 401 和其他错误：401 说明票废了必须重登，500 说明服务有问题，重登也没用
async function loadCurrentUser(): Promise<void> {
  loading.value = true
  try {
    currentUser.value = await getCurrentUser()
  } catch (error) {
    const status = (error as AxiosError).response?.status
    if (status === 401) {
      authStore.logout()
      router.push('/login')
      return
    }
    ElMessage.error('加载用户信息失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

// 做什么：清掉内存与本地存储里的 token，回到登录页
// 入参：无（读 authStore）
// 返回：无（副作用是跳转）
// 注意：阶段一没有服务端登出接口，旧 token 在过期前仍然有效，这是已接受的副作用
function handleLogout(): void {
  authStore.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}

// 组件挂载时拉一次用户信息；放 onMounted 而不是 setup 顶层，保证路由已经就绪
onMounted(loadCurrentUser)
</script>

<template>
  <div class="home-page">
    <el-card class="home-card">
      <h1 class="title">锋煊 Agent 平台</h1>

      <div v-if="loading" class="tip">正在确认身份…</div>

      <div v-else-if="currentUser">
        <p class="status">
          当前用户：{{ currentUser.display_name || currentUser.username }}
        </p>
        <p class="hint">
          账号 {{ currentUser.username }} · 状态 {{ currentUser.status }}
        </p>
      </div>

      <div v-else class="tip">未获取到用户信息</div>

      <el-button type="primary" @click="handleLogout">退出登录</el-button>
    </el-card>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
}

.home-card {
  width: 380px;
}

.title {
  margin: 0 0 12px;
  font-size: 20px;
}

.status {
  margin: 0 0 6px;
  color: #303133;
}

.hint {
  margin: 0 0 18px;
  color: #909399;
  font-size: 13px;
}

.tip {
  margin: 0 0 18px;
  color: #909399;
}
</style>
