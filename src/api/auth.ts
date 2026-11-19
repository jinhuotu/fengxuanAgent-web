/**
 * 认证相关接口。
 * 每个函数只干一件事：发请求、拆出 data、返回强类型结果。
 * 页面里不直接调 http，只调这里的函数，接口地址变了只改这一个文件。
 */

import http from '@/api/http'
import type { ApiResponse, LoginData, LoginRequest } from '@/types/api'

// 做什么：用用户名密码换 token
// 入参：登录表单（用户名 + 明文密码）
// 返回：token 与有效期；失败时由 http 拦截器统一提示并抛出异常
export async function login(payload: LoginRequest): Promise<LoginData> {
  const response = await http.post<ApiResponse<LoginData>>('/auth/login', payload)
  return response.data.data
}
