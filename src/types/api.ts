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

/** 修改本人密码的请求，与后端 ChangePasswordRequest 对齐 */
export interface ChangePasswordRequest {
  current_password: string
  new_password: string
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

/** 当前登录用户权限响应，对应 GET /auth/me/permissions */
export interface CurrentPermissions {
  permissions: string[]
}

/** 新建普通用户请求，对应后端 UserCreate */
export interface UserCreateRequest {
  username: string
  password: string
  display_name: string | null
}

/** 用户列表分页参数，对应 GET /users 的查询字符串 */
export interface UserListQuery {
  page: number
  page_size: number
}

/** 用户列表公开条目，与后端 UserListItem 对齐 */
export interface UserListItem {
  id: number
  username: string
  display_name: string | null
  status: string
  roles: RoleSummary[]
}

/** 已绑定角色的公开标识和名称，与后端 RoleSummary 对齐 */
export interface RoleSummary {
  code: string
  name: string
}

/** 角色清单，对应 GET /roles 的 data */
export interface RoleListData {
  items: RoleSummary[]
}

/** 用户列表分页结果，与统一响应的 data 对齐 */
export interface UserListData {
  items: UserListItem[]
  total: number
  page: number
  page_size: number
}

/** 追加用户角色请求，与后端 RoleBindRequest 对齐 */
export interface RoleBindRequest {
  role_code: string
}

/** created 为 false 表示此前已绑定，重复操作不会新增 */
export interface RoleBindData {
  created: boolean
}

/** removed 为 false 表示指定角色已经解绑 */
export interface RoleUnbindData {
  removed: boolean
}

/** 切换账号状态的请求 */
export interface UserStatusChangeRequest {
  status: 'active' | 'disabled'
}

/** 账号状态及本次请求是否修改了状态 */
export interface UserStatusChangeData {
  changed: boolean
  status: string
}
