/**
 * 全项目唯一的 axios 实例。
 * 为什么只建一个：地址、超时、鉴权头、错误提示这四件事只写一遍，
 * 业务代码里就不用每个请求都重复设置，也不会漏带 token。
 */

import axios, { type AxiosError } from 'axios'
import { ElMessage } from 'element-plus'

import type { ApiResponse } from '@/types/api'
import { clearToken, getToken } from '@/utils/token'

declare module 'axios' {
  interface AxiosRequestConfig {
    suppressErrorMessage?: boolean
    redirectOnUnauthorized?: boolean
  }
}

const http = axios.create({
  // /api 会被 Vite 代理转给后端 8081，见 vite.config.ts
  baseURL: '/api',
  timeout: 10000,
})

const LOGIN_PATH = '/login'

// 做什么：让选择了统一跳转的请求在凭证失效时回登录页
// 入参：失败的 Axios 响应和原请求配置
// 返回：无；旧请求的 401 不清除后续登录换来的凭证
function redirectExpiredSession(error: AxiosError): void {
  if (error.response?.status !== 401 || !error.config?.redirectOnUnauthorized) return
  const token = getToken()
  if (!token || error.config.headers.get('Authorization') !== `Bearer ${token}`) return
  clearToken()
  window.location.replace(LOGIN_PATH)
}

// 请求拦截：有 token 就自动带上，业务代码不用每次手动加请求头
http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截：只做一件事——业务码不是 0 就当成失败抛出
// 注意：不在这里改动返回结构，提取 data 的事交给 api/ 下每个函数，类型才对得上
http.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse<unknown>
    if (body.code !== 0) {
      if (!response.config.suppressErrorMessage) ElMessage.error(body.message || '请求失败')
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return response
  },
  (error) => {
    // 后端没启动、404、超时都会走到这里
    redirectExpiredSession(error)
    const message: string = error.response?.data?.message ?? '网络异常，请确认后端已启动'
    if (!error.config?.suppressErrorMessage) ElMessage.error(message)
    return Promise.reject(error)
  },
)

export default http
