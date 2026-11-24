<script setup lang="ts">
import type { AxiosError } from 'axios'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { logout as requestLogout } from '@/api/auth'
import SidebarAccount from '@/components/SidebarAccount.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const loading = ref(!authStore.currentUser)
const loadError = ref('')
const loggingOut = ref(false)
const PERMISSION_USERS_LIST = 'users:list'
const navigationItems = [
  {
    path: '/home', label: '工作台', permission: '',
    icon: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  },
  {
    path: '/chat', label: 'AI 对话', permission: '',
    icon: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z',
  },
  {
    path: '/users', label: '用户管理', permission: PERMISSION_USERS_LIST,
    icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  },
  {
    path: '/change-password', label: '修改密码', permission: '',
    icon: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2',
  },
]
const visibleNavigation = computed(availableNavigation)
const pageTitle = computed(() => String(route.meta.title || '工作台'))
const displayName = computed(() => authStore.currentUser?.display_name || authStore.currentUser?.username || '当前用户')

// 做什么：按已加载权限生成侧栏菜单
// 入参：无，读取当前权限仓库
// 返回：可以展示的菜单；权限未确认时隐藏用户管理
function availableNavigation() {
  return navigationItems.filter((item) => !item.permission || authStore.hasPermission(item.permission))
}

// 做什么：进入登录后布局时验证身份并加载菜单权限
// 入参：无，凭证由请求封装提供
// 返回：成功显示页面；401 清除身份回登录，其他错误允许重试
async function loadWorkspace(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    await authStore.loadCurrentUser()
    await authStore.loadPermissions()
  } catch (error) {
    if ((error as AxiosError).response?.status === 401) {
      authStore.logout()
      await router.replace('/login')
      return
    }
    loadError.value = '暂时无法加载工作空间，请稍后重试。'
  } finally {
    loading.value = false
  }
}

// 做什么：请求后端撤销凭证，然后退出本地会话
// 入参：无，退出请求会携带当前 token
// 返回：无；请求失败也清理本地状态并返回登录页
async function logout(): Promise<void> {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await requestLogout()
  } catch {
    // 请求失败已由拦截器提示，退出流程继续清理本地状态。
  } finally {
    authStore.logout()
    await router.replace('/login')
    loggingOut.value = false
  }
}

onMounted(loadWorkspace)
</script>

<template>
  <div class="app-layout">
    <!-- 新手注意：左边是固定的"菜单外壳"，右边是可替换的"展板"。 -->
    <aside class="app-sidebar">
      <RouterLink to="/home" class="sidebar-brand" aria-label="锋煊 Agent 平台首页">
        <span class="brand-mark">锋</span>
        <span class="brand-name">锋煊 Agent<small>智能工作空间</small></span>
      </RouterLink>

      <nav class="sidebar-navigation" aria-label="主菜单">
        <p class="navigation-label">工作空间</p>
        <RouterLink v-for="item in visibleNavigation" :key="item.path" :to="item.path"
          class="menu-item" :title="item.label" :aria-label="item.label">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="item.icon" /></svg>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <SidebarAccount :display-name="displayName" :logging-out="loggingOut" @logout="logout" />
    </aside>

    <section class="workspace">
      <header class="workspace-header">
        <div class="breadcrumb">
          <span class="breadcrumb-root">锋煊 Agent 平台</span>
          <span class="breadcrumb-divider">/</span>
          <strong>{{ pageTitle }}</strong>
        </div>
        <span class="header-account">{{ displayName }}</span>
      </header>

      <main class="workspace-content" :class="{ 'chat-content': route.name === 'chat' }" :aria-label="pageTitle">
        <el-skeleton v-if="loading" :rows="6" animated class="page-loading" aria-label="正在加载工作空间" />
        <div v-else-if="loadError" class="workspace-error">
          <el-alert :title="loadError" type="error" :closable="false" />
          <el-button @click="loadWorkspace">重新加载</el-button>
        </div>
        <!-- 子路由只换右边的内容，左边菜单始终保留 -->
        <RouterView v-else />
      </main>
    </section>
  </div>
</template>

<style scoped>
/* ---------- 整体骨架：左栏固定宽度，右侧占满剩余 ---------- */
.app-layout {
  display: flex;
  height: 100dvh;
  overflow: hidden;
  background: var(--color-canvas);
  color: var(--color-text);
}

.app-sidebar {
  display: flex;
  flex-direction: column;
  flex: 0 0 240px;
  padding: 18px 14px 14px;
  background: var(--color-sidebar);
  border-right: 1px solid var(--color-line);
}

/* ---------- 品牌 ---------- */
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 8px 20px;
  color: var(--color-text);
  text-decoration: none;
}

.brand-name {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}

.brand-name small {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 1px;
  color: var(--color-text-faint);
}

/* ---------- 菜单：激活项是白底卡片，hover 只淡淡加深 ---------- */
.sidebar-navigation {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.navigation-label {
  margin: 0 10px 8px;
  font-size: 12px;
  color: var(--color-text-faint);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 42px;
  padding: 0 12px;
  border-radius: var(--radius-control);
  color: var(--color-text-muted);
  font-size: 14px;
  text-decoration: none;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}

.menu-item:hover {
  background: rgba(20, 35, 61, 0.05);
  color: var(--color-text);
}

.menu-item.router-link-active {
  background: var(--color-surface);
  color: var(--color-primary);
  font-weight: 600;
  box-shadow: var(--shadow-card);
}

.menu-item svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---------- 右侧：顶部标题条 + 可滚动内容 ---------- */
.workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 56px;
  gap: 20px;
  padding: 0 32px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-line);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.breadcrumb-root,
.header-account {
  color: var(--color-text-faint);
}

.breadcrumb-divider {
  color: var(--color-line);
}

.breadcrumb strong {
  font-size: 14px;
  font-weight: 600;
}

.header-account {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 24px 32px 32px;
}

/* 对话页要自己管理滚动，所以去掉外层内边距并禁止外层滚动 */
.workspace-content.chat-content {
  overflow: hidden;
  padding: 16px 20px 20px;
}

.page-loading {
  padding: 24px;
}

.workspace-error {
  display: grid;
  gap: 16px;
  justify-items: start;
}

/* ---------- 窄屏：侧栏收成只剩图标 ---------- */
@media (max-width: 900px) {
  .app-sidebar {
    flex-basis: 72px;
    padding: 18px 10px 14px;
  }

  .sidebar-brand {
    justify-content: center;
    padding: 2px 0 20px;
  }

  .brand-name,
  .navigation-label,
  .menu-item > span {
    display: none;
  }

  .menu-item {
    justify-content: center;
    padding: 0;
  }

  .workspace-header {
    padding: 0 20px;
  }

  .workspace-content {
    padding: 18px;
  }
}

@media (max-width: 600px) {
  .workspace-header {
    padding: 0 14px;
  }

  .breadcrumb-root,
  .breadcrumb-divider {
    display: none;
  }

  .workspace-content {
    padding: 12px;
  }

  .workspace-content.chat-content {
    padding: 10px;
  }
}
</style>
