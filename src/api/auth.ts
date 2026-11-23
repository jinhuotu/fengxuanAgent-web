/**
 * 认证相关接口。
 * 每个函数只干一件事：发请求、拆出 data、返回强类型结果。
 * 页面里不直接调 http，只调这里的函数，接口地址变了只改这一个文件。
 */

import http from '@/api/http'
import type { ApiResponse, LoginData, LoginRequest, UserInfo } from '@/types/api'

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
