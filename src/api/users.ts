/** 用户管理请求，只负责传递参数和拆出强类型结果。 */
import http from '@/api/http'
import type {
  ApiResponse, RoleBindData, RoleBindRequest, RoleListData, RoleUnbindData, UserCreateRequest, UserDeleteData,
  UserInfo, UserListData, UserListQuery, UserStatusChangeData, UserStatusChangeRequest,
} from '@/types/api'

const USERS_PATH = '/users'
const ROLES_PATH = '/roles'
const USER_STATUS_PATH = '/status'

// 做什么：提交新用户信息，凭证由统一请求实例携带
// 入参：用户名、初始密码与可空显示名
// 返回：公开用户信息；无权、重名或请求失败时提示并抛出异常
export async function createUser(payload: UserCreateRequest): Promise<UserInfo> {
  const response = await http.post<ApiResponse<UserInfo>>(USERS_PATH, payload)
  return response.data.data
}

// 做什么：查询指定页的公开用户列表，凭证由统一请求实例携带
// 入参：页码和每页条数，与后端分页字段保持一致
// 返回：用户列表和分页信息；失败由统一拦截器提示并抛出异常
export async function getUserList(query: UserListQuery): Promise<UserListData> {
  const response = await http.get<ApiResponse<UserListData>>(USERS_PATH, { params: query })
  return response.data.data
}

// 做什么：给指定用户追加角色，凭证由统一请求实例携带
// 入参：目标用户编号和角色标识，不覆盖已有角色
// 返回：是否新增绑定；无权限或请求失败时由拦截器提示并抛出异常
export async function bindUserRole(userId: number, payload: RoleBindRequest): Promise<RoleBindData> {
  const userRolePath = `${USERS_PATH}/${userId}${ROLES_PATH}`
  const response = await http.post<ApiResponse<RoleBindData>>(userRolePath, payload)
  return response.data.data
}

// 做什么：读取可选角色的标识与名称
// 入参：无，凭证由统一请求实例携带
// 返回：角色清单；请求失败时由拦截器提示并抛出异常
export async function getRoles(): Promise<RoleListData> {
  const response = await http.get<ApiResponse<RoleListData>>(ROLES_PATH)
  return response.data.data
}

// 做什么：撤销指定用户的一条角色绑定
// 入参：目标用户编号和角色标识
// 返回：是否移除了绑定；请求失败时由拦截器提示并抛出异常
export async function unbindUserRole(userId: number, roleCode: string): Promise<RoleUnbindData> {
  const userRolePath = `${USERS_PATH}/${userId}${ROLES_PATH}/${encodeURIComponent(roleCode)}`
  const response = await http.delete<ApiResponse<RoleUnbindData>>(userRolePath)
  return response.data.data
}

// 做什么：提交目标用户的停用或启用状态
// 入参：目标用户编号和新状态
// 返回：实际状态与是否改变；请求失败时由拦截器提示并抛出异常
export async function changeUserStatus(
  userId: number, payload: UserStatusChangeRequest,
): Promise<UserStatusChangeData> {
  const statusPath = `${USERS_PATH}/${userId}${USER_STATUS_PATH}`
  const response = await http.patch<ApiResponse<UserStatusChangeData>>(statusPath, payload)
  return response.data.data
}

// 做什么：逻辑删除指定用户，后端只打删除标记，不删除数据库里的记录
// 入参：目标用户编号
// 返回：被删除的用户编号；无权限、目标不存在或请求失败时由拦截器提示并抛出异常
export async function deleteUser(userId: number): Promise<UserDeleteData> {
  const userPath = `${USERS_PATH}/${userId}`
  const response = await http.delete<ApiResponse<UserDeleteData>>(userPath)
  return response.data.data
}
