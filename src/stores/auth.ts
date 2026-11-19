/**
 * 登录状态仓库。
 * 为什么用 Pinia 而不是把 token 塞在组件里：多个页面都要知道"现在是谁、有没有登录"，
 * 状态放一处，页面刷新或切换时不会各自记一份。
 */

import { defineStore } from 'pinia'

import { clearToken, getToken, saveToken } from '@/utils/token'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    // 初始化时直接从 localStorage 读，刷新页面不会掉登录态
    token: getToken(),
  }),

  getters: {
    // 做什么：判断当前是否已登录
    // 入参：无
    // 返回：true 表示有 token（注意：这只说明"本地有票"，票是否有效要后端说了算）
    isLoggedIn: (state): boolean => state.token.length > 0,
  },

  actions: {
    // 做什么：登录成功后保存 token
    // 入参：后端返回的 token
    // 返回：无
    setToken(token: string) {
      this.token = token
      saveToken(token)
    },

    // 做什么：退出登录，清掉内存和本地存储
    // 入参：无
    // 返回：无
    logout() {
      this.token = ''
      clearToken()
    },
  },
})
