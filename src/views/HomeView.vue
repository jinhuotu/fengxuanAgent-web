<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const currentUser = computed(() => authStore.currentUser)
const USER_STATUS_ACTIVE = 'active'
const PERMISSION_USERS_LIST = 'users:list'

// 快捷入口：permission 为空表示所有登录用户都可见，否则按权限码显示
const QUICK_ENTRIES = [
  {
    title: 'AI 对话',
    description: '新建会话，向助手提问，回答逐段呈现。',
    path: '/chat',
    permission: '',
    icon: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z',
    accent: 'blue',
  },
  {
    title: '用户管理',
    description: '查看成员、创建账号、追加角色。',
    path: '/users',
    permission: PERMISSION_USERS_LIST,
    icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
    accent: 'green',
  },
  {
    title: '修改密码',
    description: '定期更换密码，保护账号安全。',
    path: '/change-password',
    permission: '',
    icon: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2',
    accent: 'amber',
  },
]

// 做什么：按当前时间给出问候语，让首页第一眼更像"有人在打招呼"
// 入参：无，读取浏览器本地时间
// 返回：早上好 / 下午好 / 晚上好 之一
function greetingByHour(): string {
  const hour = new Date().getHours()
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

// 做什么：过滤出当前用户有权限看到的快捷入口
// 入参：无，读取权限仓库
// 返回：可见的入口列表；权限未加载时只显示不需要权限的入口
const visibleEntries = computed(() => {
  return QUICK_ENTRIES.filter((entry) => !entry.permission || authStore.hasPermission(entry.permission))
})
</script>

<template>
  <div class="home-page">
    <template v-if="currentUser">
      <section class="welcome-panel" aria-labelledby="welcome-title">
        <p class="section-label">{{ greetingByHour() }}</p>
        <h1 id="welcome-title">{{ currentUser.display_name || currentUser.username }}，今天想从哪里开始？</h1>
        <p class="welcome-description">从下面的入口进入对应功能，或使用左侧菜单切换页面。</p>
      </section>

      <section class="entry-grid" aria-label="快捷入口">
        <button v-for="entry in visibleEntries" :key="entry.path" type="button"
          class="entry-card" :class="`accent-${entry.accent}`" @click="router.push(entry.path)">
          <span class="entry-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path :d="entry.icon" /></svg>
          </span>
          <strong>{{ entry.title }}</strong>
          <small>{{ entry.description }}</small>
          <span class="entry-arrow" aria-hidden="true">→</span>
        </button>
      </section>

      <el-card class="account-card" shadow="never">
        <p class="section-label">ACCOUNT</p>
        <h2>我的账号</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="用户名">{{ currentUser.username }}</el-descriptions-item>
          <el-descriptions-item label="显示名称">{{ currentUser.display_name || '未设置' }}</el-descriptions-item>
          <el-descriptions-item label="账号状态">
            <el-tag :type="currentUser.status === USER_STATUS_ACTIVE ? 'success' : 'info'" effect="light">
              {{ currentUser.status === USER_STATUS_ACTIVE ? '正常' : '已停用' }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <footer class="home-footer">锋煊 Agent 平台 · 从简单开始，让协作更有序</footer>
    </template>
  </div>
</template>

<style scoped>
.home-page {
  max-width: 1120px;
  margin: 0 auto;
  color: var(--color-text);
  line-height: 1.65;
}

.section-label {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
}

/* ---------- 顶部问候 ---------- */
.welcome-panel {
  padding: 32px 36px;
  border-radius: var(--radius-card);
  color: #ffffff;
  background:
    radial-gradient(circle at 90% 0%, rgba(140, 185, 255, 0.4) 0, transparent 50%),
    linear-gradient(120deg, #14233d 0%, #1f3f80 70%, #2457cb 100%);
}

.welcome-panel .section-label {
  color: rgba(255, 255, 255, 0.6);
}

.welcome-panel h1 {
  margin: 0 0 10px;
  font-size: clamp(22px, 2.4vw, 30px);
  font-weight: 700;
  overflow-wrap: anywhere;
}

.welcome-description {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

/* ---------- 快捷入口卡：白底，左侧图标色块区分功能 ---------- */
.entry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 16px;
  margin: 20px 0;
}

.entry-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 22px 22px 20px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: var(--shadow-card);
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
}

.entry-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary-light-7);
  box-shadow: var(--shadow-float);
}

.entry-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin-bottom: 8px;
  border-radius: 12px;
}

.entry-icon svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.accent-blue .entry-icon {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.accent-green .entry-icon {
  background: #e6f6ec;
  color: var(--color-success);
}

.accent-amber .entry-icon {
  background: #fbf1dc;
  color: var(--color-warning);
}

.entry-card strong {
  font-size: 16px;
}

.entry-card small {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-muted);
}

.entry-arrow {
  position: absolute;
  top: 22px;
  right: 22px;
  font-size: 16px;
  color: var(--color-text-faint);
  transition: transform 0.15s, color 0.15s;
}

.entry-card:hover .entry-arrow {
  transform: translateX(3px);
  color: var(--color-primary);
}

/* ---------- 账号信息 ---------- */
.account-card {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  --el-card-padding: 26px 28px;
}

.account-card h2 {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 600;
}

.home-footer {
  margin-top: 28px;
  font-size: 12px;
  color: var(--color-text-faint);
  text-align: center;
}
</style>
