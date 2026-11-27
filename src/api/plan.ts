/** 本人工作进度平台的接口封装。 */
import http from '@/api/http'
import type { ApiResponse } from '@/types/api'
import type {
  DailyLog, DailyLogPayload, DailyToday, DeletedResult, GoalCreatePayload, KeyResult, KeyResultCreatePayload,
  PlanGoal, PlanProject, PlanTask, ProjectCreatePayload, StudyItemRow, StudyOverview, TaskCreatePayload,
  TaskUpdatePayload,
} from '@/types/plan'

const PLAN_PATH = '/plan'
const GOALS_PATH = '/goals'
const PROJECTS_PATH = '/projects'
const TASKS_PATH = '/tasks'
const STUDY_PATH = '/study'
const DAILY_PATH = '/daily'
const REQUEST = { suppressErrorMessage: true, redirectOnUnauthorized: true }

// 做什么：读取本人全部目标及关键结果进度
// 入参：无，凭证由请求封装提供
// 返回：目标列表；未登录时按统一规则跳转
export async function listGoals(): Promise<PlanGoal[]> {
  const response = await http.get<ApiResponse<{ items: PlanGoal[] }>>(`${PLAN_PATH}${GOALS_PATH}`, REQUEST)
  return response.data.data.items
}

// 做什么：新建一个目标
// 入参：周期、标题、说明与进度来源
// 返回：新目标；失败抛给页面提示
export async function createGoal(payload: GoalCreatePayload): Promise<PlanGoal> {
  const response = await http.post<ApiResponse<PlanGoal>>(`${PLAN_PATH}${GOALS_PATH}`, payload, REQUEST)
  return response.data.data
}

// 做什么：修改目标上明确提交的字段
// 入参：目标编号与要改的字段
// 返回：修改后的目标；失败抛给页面提示
export async function updateGoal(
  id: number, payload: Partial<GoalCreatePayload> & { status?: number },
): Promise<PlanGoal> {
  const response = await http.patch<ApiResponse<PlanGoal>>(`${PLAN_PATH}${GOALS_PATH}/${id}`, payload, REQUEST)
  return response.data.data
}

// 做什么：删除目标及其关键结果
// 入参：目标编号
// 返回：删除标记；失败抛给页面提示
export async function deleteGoal(id: number): Promise<DeletedResult> {
  const response = await http.delete<ApiResponse<DeletedResult>>(`${PLAN_PATH}${GOALS_PATH}/${id}`, REQUEST)
  return response.data.data
}

// 做什么：在目标下新增关键结果
// 入参：目标编号与关键结果内容
// 返回：新关键结果；失败抛给页面提示
export async function createKeyResult(goalId: number, payload: KeyResultCreatePayload): Promise<KeyResult> {
  const response = await http.post<ApiResponse<KeyResult>>(
    `${PLAN_PATH}${GOALS_PATH}/${goalId}/key-results`, payload, REQUEST,
  )
  return response.data.data
}

// 做什么：更新关键结果的当前值
// 入参：关键结果编号与要改的字段
// 返回：更新后的关键结果；失败抛给页面提示
export async function updateKeyResult(
  id: number, payload: Partial<KeyResultCreatePayload>,
): Promise<KeyResult> {
  const response = await http.patch<ApiResponse<KeyResult>>(`${PLAN_PATH}/key-results/${id}`, payload, REQUEST)
  return response.data.data
}

// 做什么：按类型读取工作计划或学习主题
// 入参：类型（一工作，二学习，空为全部）
// 返回：计划列表；失败抛给页面提示
export async function listProjects(kind?: number): Promise<PlanProject[]> {
  const response = await http.get<ApiResponse<{ items: PlanProject[] }>>(`${PLAN_PATH}${PROJECTS_PATH}`, {
    ...REQUEST, params: kind ? { kind } : {},
  })
  return response.data.data.items
}

// 做什么：新建工作计划或学习主题
// 入参：类型、标题、所属目标与日期
// 返回：新计划；失败抛给页面提示
export async function createProject(payload: ProjectCreatePayload): Promise<PlanProject> {
  const response = await http.post<ApiResponse<PlanProject>>(`${PLAN_PATH}${PROJECTS_PATH}`, payload, REQUEST)
  return response.data.data
}

// 做什么：删除计划及其任务与学习单元
// 入参：计划编号
// 返回：删除标记；失败抛给页面提示
export async function deleteProject(id: number): Promise<DeletedResult> {
  const response = await http.delete<ApiResponse<DeletedResult>>(`${PLAN_PATH}${PROJECTS_PATH}/${id}`, REQUEST)
  return response.data.data
}

// 做什么：读取任务，可按计划或状态筛选
// 入参：计划编号与状态（都可不传）
// 返回：任务列表；失败抛给页面提示
export async function listTasks(projectId?: number, status?: number): Promise<PlanTask[]> {
  const params: Record<string, number> = {}
  if (projectId) params.project_id = projectId
  if (status) params.status = status
  const response = await http.get<ApiResponse<{ items: PlanTask[] }>>(`${PLAN_PATH}${TASKS_PATH}`, {
    ...REQUEST, params,
  })
  return response.data.data.items
}

// 做什么：新建任务
// 入参：所属计划、标题、优先级与日期
// 返回：新任务；失败抛给页面提示
export async function createTask(payload: TaskCreatePayload): Promise<PlanTask> {
  const response = await http.post<ApiResponse<PlanTask>>(`${PLAN_PATH}${TASKS_PATH}`, payload, REQUEST)
  return response.data.data
}

// 做什么：更新任务状态或字段
// 入参：任务编号与要改的字段
// 返回：更新后的任务；失败抛给页面提示
export async function updateTask(id: number, payload: TaskUpdatePayload): Promise<PlanTask> {
  const response = await http.patch<ApiResponse<PlanTask>>(`${PLAN_PATH}${TASKS_PATH}/${id}`, payload, REQUEST)
  return response.data.data
}

// 做什么：删除任务
// 入参：任务编号
// 返回：删除标记；失败抛给页面提示
export async function deleteTask(id: number): Promise<DeletedResult> {
  const response = await http.delete<ApiResponse<DeletedResult>>(`${PLAN_PATH}${TASKS_PATH}/${id}`, REQUEST)
  return response.data.data
}

// 做什么：读取今日复习清单与各学习主题进度
// 入参：无，凭证由请求封装提供
// 返回：学习概览；失败抛给页面提示
export async function getStudyOverview(): Promise<StudyOverview> {
  const response = await http.get<ApiResponse<StudyOverview>>(`${PLAN_PATH}${STUDY_PATH}`, REQUEST)
  return response.data.data
}

// 做什么：在学习主题下新增知识点
// 入参：学习主题编号与知识点名称
// 返回：新知识点；失败抛给页面提示
export async function createStudyItem(projectId: number, title: string): Promise<StudyItemRow> {
  const response = await http.post<ApiResponse<StudyItemRow>>(
    `${PLAN_PATH}${STUDY_PATH}/items`, { project_id: projectId, title }, REQUEST,
  )
  return response.data.data
}

// 做什么：提交一次复习结果，答对升档、答错退档
// 入参：知识点编号与是否掌握
// 返回：更新后的知识点；失败抛给页面提示
export async function reviewStudyItem(id: number, remembered: boolean): Promise<StudyItemRow> {
  const response = await http.post<ApiResponse<StudyItemRow>>(
    `${PLAN_PATH}${STUDY_PATH}/items/${id}/review`, { remembered }, REQUEST,
  )
  return response.data.data
}

// 做什么：删除一个知识点
// 入参：知识点编号
// 返回：删除标记；失败抛给页面提示
export async function deleteStudyItem(id: number): Promise<DeletedResult> {
  const response = await http.delete<ApiResponse<DeletedResult>>(`${PLAN_PATH}${STUDY_PATH}/items/${id}`, REQUEST)
  return response.data.data
}

// 做什么：读取今天的填写状态、今日任务、本周打卡和连续天数
// 入参：无，凭证由请求封装提供
// 返回：今日概览；失败抛给页面提示
export async function getDailyToday(): Promise<DailyToday> {
  const response = await http.get<ApiResponse<DailyToday>>(`${PLAN_PATH}${DAILY_PATH}/today`, REQUEST)
  return response.data.data
}

// 做什么：读取最近的每日记录，用于时间线
// 入参：返回条数
// 返回：按日期倒序的记录；失败抛给页面提示
export async function listRecentDailyLogs(limit = 8): Promise<DailyLog[]> {
  const response = await http.get<ApiResponse<{ items: DailyLog[] }>>(`${PLAN_PATH}${DAILY_PATH}/recent`, {
    ...REQUEST, params: { limit },
  })
  return response.data.data.items
}

// 做什么：按日期保存或覆盖每日记录
// 入参：记录日期与填写内容
// 返回：保存后的记录；失败抛给页面提示
export async function saveDailyLog(date: string, payload: DailyLogPayload): Promise<DailyLog> {
  const response = await http.put<ApiResponse<DailyLog>>(`${PLAN_PATH}${DAILY_PATH}/${date}`, payload, REQUEST)
  return response.data.data
}
