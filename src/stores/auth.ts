/**
 * 登录状态仓库。
 * 为什么用 Pinia 而不是把 token 塞在组件里：多个页面都要知道"现在是谁、有没有登录"，
 * 状态放一处，页面刷新或切换时不会各自记一份。
 */

import { defineStore } from 'pinia'
import { getCurrentPermissions, getCurrentUser } from '@/api/auth'
import type { UserInfo } from '@/types/api'

import { clearToken, getToken, readAccountKey, saveToken } from '@/utils/token'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    // 初始化时直接从 localStorage 读，刷新页面不会掉登录态
    token: getToken(),
    currentUser: null as UserInfo | null,
    permissions: [] as string[],
    permissionsLoaded: false,
    permissionVersion: 0,
  }),

  getters: {
    // 做什么：判断当前是否已登录
    // 入参：无
    // 返回：true 表示有 token（注意：这只说明"本地有票"，票是否有效要后端说了算）
    isLoggedIn: (state): boolean => state.token.length > 0,
    // 做什么：得到"当前是哪个账号的哪一批登录"
    // 入参：无
    // 返回：账号标识；续期会换凭证但标识不变，退出或改密后标识才会变
    accountKey: (state): string => readAccountKey(state.token),
  },

  actions: {
    // 做什么：采用其他页面已写入的登录状态；同账号续期时保留身份，换了账号才撤销
    // 入参：无，只读取当前存储
    // 返回：无；不删除或覆盖其他页面的新 token
    // 新手注意：续期像换了张同一个人的新门禁卡，人没变，不用把桌子上的东西收走。
    syncStoredToken(): void {
      const previousKey = this.accountKey
      this.token = getToken()
      if (this.token && this.accountKey === previousKey) return
      this.currentUser = null
      this.permissionVersion++
      this.permissions = []
      this.permissionsLoaded = false
    },
    // 做什么：续期后换上新凭证，本人信息和权限保持不动
    // 入参：后端新签发的凭证
    // 返回：无；调用方需先确认新旧凭证属于同一账号
    replaceToken(token: string): void {
      this.token = token
      saveToken(token)
    },
    // 做什么：加载供统一布局和各页面共享的本人信息
    // 入参：无，使用当前登录凭证
    // 返回：成功保存本人信息；失败抛异常，账号切换后的旧结果被忽略
    async loadCurrentUser(): Promise<void> {
      const requestKey = this.accountKey
      const currentUser = await getCurrentUser()
      if (requestKey === this.accountKey) this.currentUser = currentUser
    },

    // 做什么：加载本人权限，清除旧权限并忽略过期请求
    // 入参：无，使用当前登录凭证
    // 返回：成功保存清单；失败保持空清单并抛出异常
    async loadPermissions(): Promise<void> {
      const requestVersion = ++this.permissionVersion
      this.permissions = []
      this.permissionsLoaded = false
      if (!this.token) return
      const permissionResult = await getCurrentPermissions()
      // 新手注意：版本号像取号单，旧号码不能覆盖新账号的结果。
      if (requestVersion !== this.permissionVersion) return
      this.permissions = permissionResult.permissions
      this.permissionsLoaded = true
    },

    // 做什么：判断已加载清单中是否包含指定权限
    // 入参：后端约定的权限码
    // 返回：未加载或无权限时为 false，命中时为 true
    hasPermission(permissionCode: string): boolean {
      return this.permissionsLoaded && this.permissions.includes(permissionCode)
    },
    // 做什么：登录成功后保存 token
    // 入参：后端返回的 token
    // 返回：无
    setToken(token: string) {
      this.currentUser = null
      this.permissionVersion++
      this.permissions = []
      this.permissionsLoaded = false
      this.token = token
      saveToken(token)
    },

    // 做什么：退出登录，清掉内存和本地存储
    // 入参：无
    // 返回：无
    logout() {
      this.currentUser = null
      this.permissionVersion++
      this.permissions = []
      this.permissionsLoaded = false
      this.token = ''
      clearToken()
    },
  },
})
