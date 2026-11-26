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
    path: '/knowledge', label: '知识库', permission: '',
    icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
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
// 对话页自己带标题栏和输入区，侧栏中段也让给会话历史，所以外壳要按路由区分
const isChatRoute = computed(() => route.name === 'chat')
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
  <div class="app-layout" :class="{ 'is-chat': isChatRoute }">
    <!-- 新手注意：左边是固定的"菜单外壳"，右边是可替换的"展板"。 -->
    <aside class="app-sidebar">
      <RouterLink to="/home" class="sidebar-brand" aria-label="锋煊 Agent 平台首页">
        <span class="brand-mark">锋</span>
        <span class="brand-name">锋煊 Agent<small>智能工作空间</small></span>
      </RouterLink>

      <nav class="sidebar-navigation" aria-label="主菜单">
        <p class="navigation-label">工作空间</p>
        <RouterLink v-for="item in visibleNavigation" :key="item.path" :to="item.path"
          :class="{ 'router-link-active': item.path === '/knowledge' && route.name === 'knowledge-documents' }"
          class="menu-item" :title="item.label" :aria-label="item.label">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="item.icon" /></svg>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <!-- 对话页的会话历史由 ChatView 放进这个插槽：状态仍归对话页管，这里只占位 -->
      <div id="workspace-sidebar-extension" class="sidebar-extension"></div>

      <SidebarAccount :display-name="displayName" :logging-out="loggingOut" @logout="logout" />
    </aside>

    <section class="workspace">
      <!-- 每个页面自带标题（对话页是会话标题，其余是页面主标题），这里不再放一条外壳标题条，避免同名标题出现两次 -->
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
  flex: 0 0 264px;
  padding: 18px 12px 12px;
  background: var(--color-sidebar);
  border-right: 1px solid var(--color-line);
}

/* ---------- 品牌 ---------- */
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 8px 18px;
  color: var(--color-text);
  text-decoration: none;
}

.brand-name {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}

.brand-name small {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  font-weight: 400;
  color: var(--color-text-faint);
}

/* ---------- 菜单：激活项只铺一层浅底，不再用"白卡片 + 阴影"，侧栏才不会一块块凸起 ---------- */
.sidebar-navigation {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
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
  height: 38px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--color-text-muted);
  font-size: 14px;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}

.menu-item:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.menu-item.router-link-active {
  background: var(--color-hover);
  color: var(--color-text);
  font-weight: 600;
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

/* 会话历史插槽：非对话页不占位 */
.sidebar-extension {
  display: none;
}

/* ---------- 对话页：会话历史紧跟品牌，功能菜单沉到侧栏底部 ---------- */
.app-layout.is-chat .sidebar-extension {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  margin-top: 16px;
  order: 1;
}

.app-layout.is-chat .sidebar-navigation {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-line);
  order: 2;
}

.app-layout.is-chat .sidebar-bottom {
  order: 3;
}

/* ---------- 右侧：可滚动内容（标题由各页面自己渲染） ---------- */
.workspace {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.workspace-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 32px 36px 40px;
}

/* 对话页自己管理滚动和留白，外壳不再包一层 */
.workspace-content.chat-content {
  overflow: hidden;
  padding: 0;
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
    flex-basis: 68px;
    padding: 18px 8px 14px;
  }

  .sidebar-brand {
    justify-content: center;
    padding: 2px 0 18px;
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

  /* 窄侧栏放不下会话历史，对话页会把它改放到自己页面顶部 */
  .app-layout.is-chat .sidebar-extension {
    display: none;
  }

  .app-layout.is-chat .sidebar-navigation {
    margin-top: 6px;
    padding-top: 8px;
  }

  .workspace-content {
    padding: 20px 18px 18px;
  }
}

@media (max-width: 600px) {
  .workspace-content {
    padding: 16px 12px 12px;
  }
}
</style>
