/**
 * 与后端约定的数据结构。
 * 后端文件：app/utils/response.py（统一响应）与 app/api/v1/auth.py（登录）
 * 两边字段必须一字不差，改这里就要同步改后端，反之亦然。
 */

/** 统一响应外壳：成功 code=0，失败 code 非 0 并带 message */
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

/** 登录请求体 */
export interface LoginRequest {
  username: string
  password: string
}

/** 登录成功后拿到的数据 */
export interface LoginData {
  access_token: string
  token_type: string
  /** 有效期，单位秒；后端 30 分钟 = 1800 */
  expires_in: number
}
