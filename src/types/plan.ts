/** 工作进度平台的目标、计划、任务、学习与每日记录类型。 */

export interface KeyResult {
  id: number
  title: string
  metric_unit: string
  start_value: number
  target_value: number
  current_value: number
  progress: number
}

export interface PlanGoal {
  id: number
  period_type: number
  period_label: string
  title: string
  description: string | null
  status: number
  progress_mode: number
  manual_progress: number
  progress: number
  project_count: number
  key_results: KeyResult[]
}

export interface PlanProject {
  id: number
  kind: number
  title: string
  description: string | null
  goal_id: number | null
  start_date: string | null
  end_date: string | null
  status: number
  progress: number
  task_total: number
  task_done: number
}

export interface PlanTask {
  id: number
  project_id: number | null
  project_title: string | null
  title: string
  note: string | null
  status: number
  priority: number
  planned_date: string | null
  due_date: string | null
  done_at: string | null
  actual_minutes: number | null
}

export interface StudyItemRow {
  id: number
  project_id: number
  project_title: string
  title: string
  mastery: number
  review_stage: number
  next_review_date: string | null
  last_reviewed_at: string | null
}

export interface StudyProjectSummary {
  id: number
  title: string
  learned: number
  total: number
  next_review_date: string | null
}

export interface StudyOverview {
  review_today: StudyItemRow[]
  projects: StudyProjectSummary[]
  items: StudyItemRow[]
}

export interface DailyLog {
  log_date: string
  note: string
  study_minutes: number
  study_gain: string | null
  study_project_ids: number[]
  study_project_titles: string[]
}

export interface WeekMark {
  log_date: string
  has_log: boolean
}

export interface DailyToday {
  today: DailyLog | null
  tasks: PlanTask[]
  week: WeekMark[]
  streak: number
}

export interface GoalCreatePayload {
  period_type: number
  period_label: string
  title: string
  description?: string | null
  progress_mode?: number
  manual_progress?: number
}

export interface KeyResultCreatePayload {
  title: string
  metric_unit: string
  start_value: number
  target_value: number
  current_value: number
}

export interface ProjectCreatePayload {
  kind: number
  title: string
  description?: string | null
  goal_id?: number | null
  start_date?: string | null
  end_date?: string | null
  status?: number
}

export interface TaskCreatePayload {
  project_id?: number | null
  title: string
  note?: string | null
  priority?: number
  planned_date?: string | null
  due_date?: string | null
}

export interface TaskUpdatePayload {
  status?: number
  title?: string
  note?: string | null
  priority?: number
  project_id?: number | null
  planned_date?: string | null
  due_date?: string | null
}

export interface DailyLogPayload {
  note: string
  study_minutes: number
  study_gain: string | null
  study_project_ids: number[]
}

export interface DeletedResult {
  deleted: boolean
}
