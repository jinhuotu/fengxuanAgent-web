/**
 * 路由表。
 * 现在有登录页和登录后的首页；业务页面按阶段往后加（阶段二起会有用户管理、权限等）。
 */

import { createRouter, createWebHistory } from 'vue-router'

import { getToken } from '@/utils/token'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import ChangePasswordView from '@/views/ChangePasswordView.vue'
import UserManagementView from '@/views/UserManagementView.vue'
import ChatView from '@/views/ChatView.vue'
import AppLayout from '@/layouts/AppLayout.vue'

const router = createRouter({
  // history 模式：地址栏是 /login 而不是 /#/login，更像正常网站
  history: createWebHistory(),
  routes: [
    // 根路径按登录态分流：本地有 token 就去首页，没有就去登录页
    // 注意：这里只看"本地有没有票"，票是否有效由后端说了算，第二小步的守卫再兜底
    { path: '/', redirect: () => (getToken() ? '/home' : '/login') },
    { path: '/login', name: 'login', component: LoginView },
    // 新手注意：父路由是固定的菜单外壳，子路由是右侧可替换的业务页面。
    {
      path: '/', component: AppLayout, meta: { requiresAuth: true },
      children: [
        { path: 'home', name: 'home', component: HomeView, meta: { title: '工作台' } },
        { path: 'chat', name: 'chat', component: ChatView, meta: { title: 'AI 对话' } },
        { path: 'users', name: 'users', component: UserManagementView, meta: { title: '用户管理' } },
        { path: 'change-password', name: 'change-password', component: ChangePasswordView, meta: { title: '修改密码' } },
      ],
    },
    // 访问不存在的地址也回登录页，避免白屏
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
})

// 全局前置守卫：每次导航前跑一遍，返回 false 或目标路径就中断这次导航
// 两件事：该登录的没登录 -> 打回登录页；已登录还访问登录页 -> 送去首页
// 注意：这里只看"本地有没有票"，票真不真由首页的 /auth/me 说了算
router.beforeEach((to) => {
  const requiresAuth = Boolean(to.meta.requiresAuth)
  const loggedIn = getToken().length > 0

  if (requiresAuth && !loggedIn) {
    return { path: '/login' }
  }

  if (to.path === '/login' && loggedIn) {
    return { path: '/home' }
  }

  return true
})

export default router
