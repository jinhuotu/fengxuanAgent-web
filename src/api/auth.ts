/**
 * 认证相关接口。
 * 每个函数只干一件事：发请求、拆出 data、返回强类型结果。
 * 页面里不直接调 http，只调这里的函数，接口地址变了只改这一个文件。
 */

import http from '@/api/http'
import type { ApiResponse, ChangePasswordRequest, CurrentPermissions, LoginData, LoginRequest, UserInfo } from '@/types/api'

const CHANGE_PASSWORD_PATH = '/auth/change-password'
const CURRENT_PERMISSIONS_PATH = '/auth/me/permissions'
const LOGOUT_PATH = '/auth/logout'
const REFRESH_PATH = '/auth/refresh'

// 做什么：查询当前登录用户的权限码清单
// 入参：无，凭证由统一请求实例携带
// 返回：权限响应；失败由拦截器提示并抛出异常
export async function getCurrentPermissions(): Promise<CurrentPermissions> {
  const response = await http.get<ApiResponse<CurrentPermissions>>(CURRENT_PERMISSIONS_PATH)
  return response.data.data
}

// 做什么：用用户名密码换 token
// 入参：登录表单（用户名 + 明文密码）
// 返回：token 与有效期；失败时由 http 拦截器统一提示并抛出异常
export async function login(payload: LoginRequest): Promise<LoginData> {
  const response = await http.post<ApiResponse<LoginData>>('/auth/login', payload)
  return response.data.data
}

// 做什么：拿当前 token 向后端确认"我是谁"
// 入参：无（token 由 http 拦截器自动放进请求头）
// 返回：后端认过的用户信息；token 无效时拦截器提示并抛出 401
export async function getCurrentUser(): Promise<UserInfo> {
  const response = await http.get<ApiResponse<UserInfo>>('/auth/me')
  return response.data.data
}

// 做什么：提交本人修改密码请求，登录凭证由拦截器自动携带
// 入参：旧密码与新密码，不包含用户名或用户编号
// 返回：成功得到 null；失败由统一拦截器提示并抛出异常
export async function changePassword(payload: ChangePasswordRequest): Promise<null> {
  const response = await http.post<ApiResponse<null>>(CHANGE_PASSWORD_PATH, payload)
  return response.data.data
}

// 做什么：用仍然有效的当前凭证换一张新凭证，有效期从现在重新计算
// 入参：无，当前凭证由请求拦截器携带
// 返回：新凭证与有效期；失败时不弹提示并抛出异常，是否结束会话由会话计时决定
export async function refreshLogin(): Promise<LoginData> {
  const response = await http.post<ApiResponse<LoginData>>(REFRESH_PATH, undefined, { suppressErrorMessage: true })
  return response.data.data
}

// 做什么：通知后端撤销当前账号的登录凭证
// 入参：无，当前 token 由请求拦截器携带
// 返回：成功得到 null；失败也要让调用方继续清本地登录状态
export async function logout(): Promise<null> {
  const response = await http.post<ApiResponse<null>>(LOGOUT_PATH)
  return response.data.data
}

// 做什么：通知后端撤销当前账号的登录凭证，失败时不弹提示
// 入参：无，当前凭证由请求拦截器携带；用于会话已到期的自动退出
// 返回：成功得到 null；失败抛出异常，由调用方继续清理本地状态
export async function logoutQuietly(): Promise<null> {
  const response = await http.post<ApiResponse<null>>(LOGOUT_PATH, undefined, { suppressErrorMessage: true })
  return response.data.data
}
