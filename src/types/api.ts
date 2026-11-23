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

/** 当前用户信息，对应后端 GET /auth/me 的 data */
export interface UserInfo {
  id: number
  username: string
  /** 显示名可空，前端展示时回退成 username */
  display_name: string | null
  /** active 正常，disabled 被停用 */
  status: string
  /** 是否管理员；阶段一暂时靠这一列决定谁能建用户 */
  is_admin: boolean
  /** 后端返回 ISO 字符串，目前是 UTC */
  created_at: string
}
