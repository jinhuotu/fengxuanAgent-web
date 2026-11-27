/** 工作进度平台的枚举文案与日期格式化；页面内不再手写字符串映射。 */

export const GOAL_PERIOD_NAMES: Record<number, string> = { 1: '年度', 2: '季度', 3: '月度' }
export const GOAL_STATUS_NAMES: Record<number, string> = { 1: '进行中', 2: '已完成', 3: '已放弃' }
export const PROJECT_STATUS_NAMES: Record<number, string> = {
  1: '未开始', 2: '进行中', 3: '已完成', 4: '已暂停', 5: '已放弃',
}
export const TASK_STATUS_NAMES: Record<number, string> = { 1: '待办', 2: '进行中', 3: '已完成', 4: '已放弃' }
export const PRIORITY_NAMES: Record<number, string> = { 1: '低', 2: '中', 3: '高' }
export const PLAN_KIND = { WORK: 1, STUDY: 2 } as const
export const TASK_STATUS = { TODO: 1, DOING: 2, DONE: 3, DROPPED: 4 } as const
export const PERIOD_CHOICES = [1, 2, 3]
export const PROJECT_STATUS_CHOICES = [1, 2, 3, 4, 5]
export const MASTERY_MAX = 5
export const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const ONE_DAY_MS = 24 * 60 * 60 * 1000

// 做什么：把日期字符串解析成本地零点
// 入参：形如 2026-11-27 的日期字符串
// 返回：本地时区的时间对象
function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00`)
}

// 做什么：取浏览器本地的今天，格式与后端一致
// 入参：无
// 返回：形如 2026-11-27 的字符串
export function todayKey(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// 做什么：把日期显示成月/日
// 入参：日期字符串或空
// 返回：形如 11/27 的文本；空值显示为"未排期"
export function formatMonthDay(value: string | null): string {
  if (!value) return '未排期'
  const date = parseDate(value)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

// 做什么：取日期对应的星期
// 入参：日期字符串
// 返回：周一、周二等短标签
export function weekdayLabel(value: string): string {
  return WEEKDAY_NAMES[parseDate(value).getDay()]
}

// 做什么：算目标日期距今天还有几天
// 入参：日期字符串或空
// 返回：负数表示已过期，空值返回空
export function daysFromToday(value: string | null): number | null {
  if (!value) return null
  const diff = parseDate(value).getTime() - parseDate(todayKey()).getTime()
  return Math.round(diff / ONE_DAY_MS)
}

// 做什么：把截止日期描述成一句人话
// 入参：截止日期或空
// 返回："今天截止""已逾期 3 天""还剩 2 天"或空串
export function dueLabel(value: string | null): string {
  const days = daysFromToday(value)
  if (days === null) return ''
  if (days === 0) return '今天截止'
  if (days < 0) return `已逾期 ${Math.abs(days)} 天`
  return `还剩 ${days} 天`
}

// 做什么：把掌握度描述成短语
// 入参：零到五的掌握度
// 返回：未开始、刚接触、在学、基本掌握、熟练、能讲给别人听
export function masteryLabel(level: number): string {
  const labels = ['未开始', '刚接触', '在学', '基本掌握', '熟练', '能讲给别人听']
  return labels[Math.max(0, Math.min(MASTERY_MAX, level))]
}

// 做什么：把学习时长分钟数显示成小时分钟
// 入参：分钟数
// 返回：如 90 分钟显示为 1.5 小时，0 显示为"未记录"
export function formatStudyMinutes(minutes: number): string {
  if (minutes <= 0) return '未记录'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours} 小时` : `${hours.toFixed(1)} 小时`
}
