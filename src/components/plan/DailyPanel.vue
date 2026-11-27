<script setup lang="ts">
/** 每日进度：左边填今天，右边看打卡、待办和最近记录。 */
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { getDailyToday, listProjects, listRecentDailyLogs, saveDailyLog, updateTask } from '@/api/plan'
import type { DailyLog, DailyToday, PlanProject, PlanTask } from '@/types/plan'
import {
  dueLabel, formatMonthDay, formatStudyMinutes, PLAN_KIND, TASK_STATUS, todayKey, weekdayLabel,
} from '@/utils/planStatus'

const loadDate = todayKey()
const overview = ref<DailyToday | null>(null)
const recentLogs = ref<DailyLog[]>([])
const studyProjects = ref<PlanProject[]>([])
const note = ref('')
const studyMinutes = ref(0)
const studyGain = ref('')
const selectedProjectIds = ref<number[]>([])
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')

const hasRecord = computed(() => Boolean(overview.value?.today))
const todayTasks = computed(() => overview.value?.tasks ?? [])
const streakDays = computed(() => overview.value?.streak ?? 0)
const weekMarks = computed(() => overview.value?.week ?? [])
const dateHeading = computed(() => `${formatMonthDay(loadDate)} ${weekdayLabel(loadDate)}`)

// 做什么：把已有记录回填到表单，没有记录时清空
// 入参：今天已保存的记录或空
// 返回：无；直接改写表单状态
function applyTodayForm(log: DailyLog | null): void {
  note.value = log?.note ?? ''
  studyMinutes.value = log?.study_minutes ?? 0
  studyGain.value = log?.study_gain ?? ''
  selectedProjectIds.value = [...(log?.study_project_ids ?? [])]
}

// 做什么：一次取回今天、最近记录和学习主题
// 入参：无，凭证由请求封装提供
// 返回：无；失败时在页面内给出重试提示
async function loadAll(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const [todayResult, recentResult, projects] = await Promise.all([
      getDailyToday(), listRecentDailyLogs(8), listProjects(PLAN_KIND.STUDY),
    ])
    overview.value = todayResult
    recentLogs.value = recentResult
    studyProjects.value = projects
    applyTodayForm(todayResult.today)
  } catch {
    loadError.value = '加载今天的进度失败，请重试'
  } finally {
    loading.value = false
  }
}

// 做什么：写入成功后重新拉取今天与最近记录
// 入参：无
// 返回：无；刷新失败只提示，不改变"已保存"的事实
async function refreshAfterWrite(): Promise<void> {
  try {
    const [todayResult, recentResult] = await Promise.all([getDailyToday(), listRecentDailyLogs(8)])
    overview.value = todayResult
    recentLogs.value = recentResult
    applyTodayForm(todayResult.today)
  } catch {
    // 写入已经成功，刷新失败只影响展示，保留旧数据并提示。
    ElMessage.warning('已保存，但列表刷新失败，可稍后重试')
  }
}

// 做什么：保存今天的记录，同一天覆盖
// 入参：无，读取当前表单
// 返回：无；成功后点亮本周格子并刷新时间线
async function submit(): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    await saveDailyLog(loadDate, {
      note: note.value.trim(),
      study_minutes: Math.max(0, Number(studyMinutes.value) || 0),
      study_gain: studyGain.value.trim() || null,
      study_project_ids: selectedProjectIds.value,
    })
    ElMessage.success('已保存，今天的格子点亮了')
    await refreshAfterWrite()
  } catch {
    ElMessage.error('保存失败，请重试')
  } finally {
    saving.value = false
  }
}

// 做什么：切换学习主题选中态
// 入参：学习主题编号
// 返回：无；已选中则移除，未选中则加入
function toggleProject(projectId: number): void {
  selectedProjectIds.value = selectedProjectIds.value.includes(projectId)
    ? selectedProjectIds.value.filter((id) => id !== projectId)
    : [...selectedProjectIds.value, projectId]
}

// 做什么：把今日待办勾成完成，或撤销完成
// 入参：被点击的任务
// 返回：无；失败保留原状态并提示
async function toggleTask(task: PlanTask): Promise<void> {
  const nextStatus = task.status === TASK_STATUS.DONE ? TASK_STATUS.TODO : TASK_STATUS.DONE
  try {
    await updateTask(task.id, { status: nextStatus })
    await refreshAfterWrite()
    if (nextStatus === TASK_STATUS.DONE) ElMessage.success(`完成「${task.title}」`)
  } catch {
    ElMessage.error('更新任务失败，请重试')
  }
}

// 做什么：判断某个打卡格是不是今天
// 入参：格子日期
// 返回：是今天时为真，用于描边突出
function isToday(value: string): boolean {
  return value === loadDate
}

onMounted(loadAll)
</script>

<template>
  <section v-if="loadError" class="panel-state">
    <p>{{ loadError }}</p>
    <el-button @click="loadAll">重新加载</el-button>
  </section>

  <section v-else-if="loading" class="panel-state">正在加载今天的进度…</section>

  <div v-else class="daily-grid">
    <article class="plan-card record-card">
      <header class="card-head">
        <div>
          <p class="card-label">TODAY · {{ dateHeading }}</p>
          <h2>今天做了什么</h2>
        </div>
        <span class="record-state" :class="{ 'is-saved': hasRecord }">{{ hasRecord ? '已记录' : '还没记' }}</span>
      </header>

      <el-input v-model="note" type="textarea" :rows="4" maxlength="5000" show-word-limit
        placeholder="写下今天推进了什么、卡在哪里。哪怕只有一行。" />

      <div class="field">
        <label>今天学了哪些主题</label>
        <div class="chip-row">
          <button v-for="project in studyProjects" :key="project.id" type="button" class="chip"
            :class="{ 'is-on': selectedProjectIds.includes(project.id) }"
            @click="toggleProject(project.id)">{{ project.title }}</button>
          <span v-if="!studyProjects.length" class="field-hint">还没有学习主题，可以去「学习计划」建一个。</span>
        </div>
      </div>

      <div class="field-row">
        <div class="field duration-field">
          <label>学习时长（分钟）</label>
          <input v-model.number="studyMinutes" class="plain-input" type="number" min="0" max="1440" />
        </div>
        <div class="field grow">
          <label>一句话收获</label>
          <el-input v-model="studyGain" maxlength="200" placeholder="今天最值钱的一句话" />
        </div>
      </div>

      <div class="card-actions">
        <el-button class="ink-button" :loading="saving" @click="submit">保存今天的记录</el-button>
        <span class="hint">同一天只保留一条，再保存会覆盖。</span>
      </div>
    </article>

    <aside class="side-column">
      <article class="plan-card streak-card">
        <p class="card-label">STREAK</p>
        <div class="streak-line">
          <strong>{{ streakDays }}</strong>
          <span>天连续记录</span>
        </div>
        <div class="week-grid">
          <div v-for="mark in weekMarks" :key="mark.log_date" class="week-cell"
            :class="{ 'has-log': mark.has_log, 'is-today': isToday(mark.log_date) }">
            <span class="week-name">{{ weekdayLabel(mark.log_date) }}</span>
            <span class="week-date">{{ formatMonthDay(mark.log_date) }}</span>
            <span class="week-dot" aria-hidden="true"></span>
          </div>
        </div>
      </article>

      <article class="plan-card todo-card">
        <header class="card-head compact">
          <h3>今日待办</h3>
          <span class="count">{{ todayTasks.length }} 项</span>
        </header>
        <ul v-if="todayTasks.length" class="todo-list">
          <li v-for="task in todayTasks" :key="task.id">
            <input type="checkbox" :checked="task.status === TASK_STATUS.DONE" @change="toggleTask(task)" />
            <div>
              <strong>{{ task.title }}</strong>
              <small>{{ task.project_title || '独立待办' }} · {{ dueLabel(task.due_date) || '今天' }}</small>
            </div>
          </li>
        </ul>
        <p v-else class="empty-hint">今天没有排任务。去「工作进度」加一条，或者就休息。</p>
      </article>

      <article class="plan-card recent-card">
        <header class="card-head compact">
          <h3>最近记录</h3>
        </header>
        <ul v-if="recentLogs.length" class="recent-list">
          <li v-for="log in recentLogs" :key="log.log_date">
            <span class="recent-date">{{ formatMonthDay(log.log_date) }}<small>{{ weekdayLabel(log.log_date) }}</small></span>
            <div>
              <p class="recent-note">{{ log.note || '没写正文' }}</p>
              <small class="recent-meta">
                {{ formatStudyMinutes(log.study_minutes) }}
                <template v-if="log.study_gain"> · {{ log.study_gain }}</template>
              </small>
            </div>
          </li>
        </ul>
        <p v-else class="empty-hint">还没有记录，今天写下第一条。</p>
      </article>
    </aside>
  </div>
</template>

<style scoped>
.daily-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.panel-state {
  padding: 48px 0;
  text-align: center;
  color: var(--color-text-muted);
}

.plan-card {
  padding: 22px 24px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.card-head.compact {
  margin-bottom: 12px;
  align-items: baseline;
}

.card-label {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--color-accent);
}

.card-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.card-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.record-state {
  flex: none;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--color-user-bubble);
  color: var(--color-text-muted);
  font-size: 12px;
}

.record-state.is-saved {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.field {
  margin-top: 16px;
}

.field label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
}

.field-row {
  display: flex;
  gap: 14px;
  margin-top: 16px;
}

.field-row .field {
  margin-top: 0;
}

.grow {
  flex: 1;
  min-width: 0;
}

.duration-field {
  width: 150px;
  flex: none;
}

.plain-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.plain-input:focus {
  outline: none;
  border-color: var(--color-primary-light-5);
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  padding: 6px 12px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-base);
}

.chip:hover {
  border-color: var(--color-primary-light-7);
  color: var(--color-text);
}

.chip.is-on {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.field-hint {
  font-size: 12px;
  color: var(--color-text-faint);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}

.hint {
  font-size: 12px;
  color: var(--color-text-faint);
}

.side-column {
  display: grid;
  gap: 18px;
}

.streak-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 14px;
}

.streak-line strong {
  font-size: 34px;
  font-weight: 600;
  line-height: 1;
}

.streak-line span {
  font-size: 13px;
  color: var(--color-text-muted);
}

.week-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.week-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 0 6px;
  border: 1px dashed var(--color-line);
  border-radius: var(--radius-control);
}

.week-name {
  font-size: 11px;
  color: var(--color-text-faint);
}

.week-date {
  font-size: 11px;
  color: var(--color-text-muted);
}

.week-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: transparent;
}

.week-cell.has-log {
  border-style: solid;
  background: var(--color-accent-soft);
}

.week-cell.has-log .week-dot {
  background: var(--color-accent);
}

.week-cell.is-today {
  border: 2px solid var(--color-ink);
  background: var(--color-surface);
}

.count {
  font-size: 12px;
  color: var(--color-text-faint);
}

.todo-list,
.recent-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.todo-list li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 0;
  border-top: 1px solid var(--color-line);
}

.todo-list li:first-child {
  border-top: 0;
}

.todo-list input {
  margin-top: 3px;
  accent-color: var(--color-accent);
}

.todo-list strong {
  display: block;
  font-size: 13px;
  font-weight: 500;
}

.todo-list small {
  font-size: 11px;
  color: var(--color-text-faint);
}

.recent-list li {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--color-line);
}

.recent-list li:first-child {
  border-top: 0;
}

.recent-date {
  flex: none;
  width: 44px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
}

.recent-date small {
  display: block;
  font-weight: 400;
  color: var(--color-text-faint);
}

.recent-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.recent-meta {
  font-size: 11px;
  color: var(--color-text-faint);
}

.empty-hint {
  margin: 0;
  padding: 8px 0 4px;
  font-size: 12px;
  color: var(--color-text-faint);
  line-height: 1.6;
}

@media (max-width: 960px) {
  .daily-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
