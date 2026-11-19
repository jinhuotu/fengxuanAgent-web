/**
 * 路由表。
 * 现在只有登录页，业务页面按阶段往后加（阶段二起会有用户管理、权限等）。
 */

import { createRouter, createWebHistory } from 'vue-router'

import LoginView from '@/views/LoginView.vue'

const router = createRouter({
  // history 模式：地址栏是 /login 而不是 /#/login，更像正常网站
  history: createWebHistory(),
  routes: [
    // 首页暂时没有，先重定向到登录
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'login', component: LoginView },
    // 访问不存在的地址也回登录页，避免白屏
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
})

export default router
