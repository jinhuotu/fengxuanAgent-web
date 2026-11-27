<script setup lang="ts">
/** 工作进度：上面的计划进度条 + 下面的任务看板。 */
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { createProject, createTask, deleteProject, deleteTask, listGoals, listProjects, listTasks, updateTask } from '@/api/plan'
import type { PlanGoal, PlanProject, PlanTask, ProjectCreatePayload, TaskCreatePayload } from '@/types/plan'
import {
  dueLabel, formatMonthDay, PLAN_KIND, PRIORITY_NAMES, PROJECT_STATUS_NAMES, TASK_STATUS, TASK_STATUS_NAMES,
} from '@/utils/planStatus'

const columns = [
  { status: TASK_STATUS.TODO, label: '待办' },
  { status: TASK_STATUS.DOING, label: '进行中' },
  { status: TASK_STATUS.DONE, label: '已完成' },
]
const PRIORITY_CHOICES = [1, 2, 3]
const MAX_TITLE_LENGTH = 120

const projects = ref<PlanProject[]>([])
const tasks = ref<PlanTask[]>([])
const goals = ref<PlanGoal[]>([])
const loading = ref(false)
const loadError = ref('')

const projectDialogVisible = ref(false)
const projectFormRef = ref<FormInstance>()
const projectForm = reactive({ title: '', goal_id: null as number | null, start_date: '', end_date: '' })
const projectRules: FormRules = {
  title: [{ required: true, whitespace: true, max: 80, message: '请输入 1–80 字的计划名', trigger: 'blur' }],
}

const taskDialogVisible = ref(false)
const taskFormRef = ref<FormInstance>()
const taskForm = reactive({
  title: '', project_id: null as number | null, priority: 2, planned_date: '', due_date: '',
})
const taskRules: FormRules = {
  title: [{ required: true, whitespace: true, max: MAX_TITLE_LENGTH, message: '请输入 1–120 字的任务', trigger: 'blur' }],
}

const boardColumns = computed(() => columns.map((column) => ({
  ...column,
  items: tasks.value.filter((task) => task.status === column.status),
})))

// 做什么：读取工作计划、任务和可选的目标
// 入参：无，凭证由请求封装提供
// 返回：无；失败时页面内提供重试
async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const [projectList, taskList, goalList] = await Promise.all([
      listProjects(PLAN_KIND.WORK), listTasks(), listGoals(),
    ])
    projects.value = projectList
    tasks.value = taskList.filter((task) => task.status !== TASK_STATUS.DROPPED)
    goals.value = goalList
  } catch {
    loadError.value = '加载工作进度失败，请重试'
  } finally {
    loading.value = false
  }
}

// 做什么：任务推进到下一状态，已完成则退回待办
// 入参：任务
// 返回：无；成功后刷新看板
async function advanceTask(task: PlanTask): Promise<void> {
  const nextStatus = task.status === TASK_STATUS.TODO
    ? TASK_STATUS.DOING
    : (task.status === TASK_STATUS.DOING ? TASK_STATUS.DONE : TASK_STATUS.TODO)
  try {
    await updateTask(task.id, { status: nextStatus })
    await load()
  } catch {
    ElMessage.error('更新任务状态失败，请重试')
  }
}

// 做什么：确认后删除一条任务
// 入参：任务
// 返回：无；取消或失败都保留任务
async function removeTask(task: PlanTask): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除任务「${task.title}」？`, '删除任务', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
  } catch {
    // 用户取消，不做任何改动。
    return
  }
  try {
    await deleteTask(task.id)
    ElMessage.success('任务已删除')
    await load()
  } catch {
    ElMessage.error('删除失败，请重试')
  }
}

// 做什么：打开新建计划弹窗
// 入参：无
// 返回：无；表单回到空状态
function openProjectDialog(): void {
  projectForm.title = ''
  projectForm.goal_id = null
  projectForm.start_date = ''
  projectForm.end_date = ''
  projectDialogVisible.value = true
}

// 做什么：提交新建工作计划
// 入参：无，读取弹窗表单
// 返回：无；成功后刷新计划与任务
async function submitProject(): Promise<void> {
  if (!projectFormRef.value) return
  const valid = await projectFormRef.value.validate().catch(() => false)
  if (!valid) return
  const payload: ProjectCreatePayload = {
    kind: PLAN_KIND.WORK,
    title: projectForm.title.trim(),
    goal_id: projectForm.goal_id,
    start_date: projectForm.start_date || null,
    end_date: projectForm.end_date || null,
    status: 2,
  }
  try {
    await createProject(payload)
    projectDialogVisible.value = false
    ElMessage.success('计划已创建')
    await load()
  } catch {
    ElMessage.error('创建计划失败，请检查日期区间')
  }
}

// 做什么：确认后删除计划及其任务
// 入参：计划
// 返回：无；取消或失败都保留计划
async function removeProject(project: PlanProject): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除计划「${project.title}」及其下 ${project.task_total} 条任务？`, '删除计划', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
  } catch {
    // 用户取消，不做任何改动。
    return
  }
  try {
    await deleteProject(project.id)
    ElMessage.success('计划已删除')
    await load()
  } catch {
    ElMessage.error('删除失败，请重试')
  }
}

// 做什么：打开新建任务弹窗
// 入参：可预设的计划编号
// 返回：无；表单回到默认值
function openTaskDialog(projectId: number | null = null): void {
  taskForm.title = ''
  taskForm.project_id = projectId
  taskForm.priority = 2
  taskForm.planned_date = ''
  taskForm.due_date = ''
  taskDialogVisible.value = true
}

// 做什么：提交新建任务
// 入参：无，读取弹窗表单
// 返回：无；成功后刷新看板
async function submitTask(): Promise<void> {
  if (!taskFormRef.value) return
  const valid = await taskFormRef.value.validate().catch(() => false)
  if (!valid) return
  const payload: TaskCreatePayload = {
    title: taskForm.title.trim(),
    project_id: taskForm.project_id,
    priority: taskForm.priority,
    planned_date: taskForm.planned_date || null,
    due_date: taskForm.due_date || null,
  }
  try {
    await createTask(payload)
    taskDialogVisible.value = false
    ElMessage.success('任务已创建')
    await load()
  } catch {
    ElMessage.error('创建任务失败，请检查日期区间')
  }
}

onMounted(load)
</script>

<template>
  <div class="panel-shell">
    <header class="panel-toolbar">
      <h2>工作计划 <small>{{ projects.length }} 个</small></h2>
      <div class="toolbar-actions">
        <el-button @click="openProjectDialog">新建计划</el-button>
        <el-button class="ink-button" @click="openTaskDialog()">新建任务</el-button>
      </div>
    </header>

    <section v-if="loadError" class="panel-state">
      <p>{{ loadError }}</p>
      <el-button @click="load">重新加载</el-button>
    </section>
    <section v-else-if="loading" class="panel-state">正在加载工作进度…</section>

    <template v-else>
      <div class="project-strip">
        <article v-for="project in projects" :key="project.id" class="project-card">
          <header>
            <strong>{{ project.title }}</strong>
            <span class="project-status">{{ PROJECT_STATUS_NAMES[project.status] }}</span>
          </header>
          <div class="project-progress">
            <div class="plan-progress"><span :style="{ width: `${project.progress}%` }"></span></div>
            <span class="project-percent">{{ project.progress }}%</span>
          </div>
          <p class="project-meta">
            {{ project.task_done }}/{{ project.task_total }} 个任务
            <template v-if="project.end_date"> · {{ formatMonthDay(project.end_date) }} {{ dueLabel(project.end_date) }}</template>
          </p>
          <div class="project-actions">
            <button type="button" class="plan-text-button" @click="openTaskDialog(project.id)">＋ 任务</button>
            <button type="button" class="plan-text-button" @click="removeProject(project)">删除</button>
          </div>
        </article>
        <p v-if="!projects.length" class="empty-hint">还没有工作计划，先建一个装着这条线的事。</p>
      </div>

      <div class="board">
        <section v-for="column in boardColumns" :key="column.status" class="board-column">
          <header class="board-head">
            <h3>{{ column.label }}</h3>
            <span class="board-count">{{ column.items.length }}</span>
          </header>
          <div class="board-list">
            <article v-for="task in column.items" :key="task.id" class="task-card"
              :class="{ 'is-done': task.status === TASK_STATUS.DONE }">
              <header class="task-head">
                <strong>{{ task.title }}</strong>
                <span class="priority" :class="`priority-${task.priority}`">{{ PRIORITY_NAMES[task.priority] }}</span>
              </header>
              <p class="task-meta">
                {{ task.project_title || '独立待办' }}
                <template v-if="task.due_date"> · {{ dueLabel(task.due_date) }}</template>
              </p>
              <p v-if="task.note" class="task-note">{{ task.note }}</p>
              <footer class="task-actions">
                <button type="button" class="plan-text-button" @click="advanceTask(task)">
                  {{ task.status === TASK_STATUS.DONE ? '退回待办' : (task.status === TASK_STATUS.TODO ? '开始做' : '标记完成') }}
                </button>
                <span class="task-status">{{ TASK_STATUS_NAMES[task.status] }}</span>
                <button type="button" class="plan-text-button" @click="removeTask(task)">删除</button>
              </footer>
            </article>
            <p v-if="!column.items.length" class="board-empty">这里还没有任务</p>
          </div>
        </section>
      </div>
    </template>

    <el-dialog v-model="projectDialogVisible" title="新建工作计划" width="460px">
      <el-form ref="projectFormRef" :model="projectForm" :rules="projectRules" label-position="top">
        <el-form-item label="计划名" prop="title">
          <el-input v-model="projectForm.title" maxlength="80" placeholder="例如：上线工作进度平台" />
        </el-form-item>
        <el-form-item label="归属目标">
          <el-select v-model="projectForm.goal_id" clearable placeholder="不挂目标也可以" style="width: 100%">
            <el-option v-for="goal in goals" :key="goal.id" :label="goal.title" :value="goal.id" />
          </el-select>
        </el-form-item>
        <div class="date-row">
          <el-form-item label="开始日期">
            <input v-model="projectForm.start_date" class="plain-input" type="date" />
          </el-form-item>
          <el-form-item label="截止日期">
            <input v-model="projectForm.end_date" class="plain-input" type="date" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="projectDialogVisible = false">取消</el-button>
        <el-button class="ink-button" @click="submitProject">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="taskDialogVisible" title="新建任务" width="460px">
      <el-form ref="taskFormRef" :model="taskForm" :rules="taskRules" label-position="top">
        <el-form-item label="任务" prop="title">
          <el-input v-model="taskForm.title" maxlength="120" placeholder="一句话说清要做什么" />
        </el-form-item>
        <el-form-item label="所属计划">
          <el-select v-model="taskForm.project_id" clearable placeholder="不挂计划也可以" style="width: 100%">
            <el-option v-for="project in projects" :key="project.id" :label="project.title" :value="project.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="taskForm.priority" style="width: 100%">
            <el-option v-for="value in PRIORITY_CHOICES" :key="value" :label="PRIORITY_NAMES[value]" :value="value" />
          </el-select>
        </el-form-item>
        <div class="date-row">
          <el-form-item label="计划日期">
            <input v-model="taskForm.planned_date" class="plain-input" type="date" />
          </el-form-item>
          <el-form-item label="截止日期">
            <input v-model="taskForm.due_date" class="plain-input" type="date" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="taskDialogVisible = false">取消</el-button>
        <el-button class="ink-button" @click="submitTask">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.panel-shell {
  display: grid;
  gap: 18px;
}

.panel-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-toolbar h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.panel-toolbar small {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-faint);
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.panel-state {
  padding: 40px 0;
  text-align: center;
  color: var(--color-text-muted);
}

.project-strip {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.project-card {
  padding: 16px 18px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.project-card header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.project-card header strong {
  font-size: 14px;
  font-weight: 600;
}

.project-status {
  flex: none;
  font-size: 11px;
  color: var(--color-text-faint);
}

.project-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.project-progress .plan-progress {
  flex: 1;
}

.project-percent {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
}

.project-meta {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--color-text-faint);
}

.project-actions {
  display: flex;
  gap: 14px;
  margin-top: 10px;
}

.empty-hint {
  margin: 0;
  padding: 18px;
  font-size: 12px;
  color: var(--color-text-faint);
  border: 1px dashed var(--color-line);
  border-radius: var(--radius-card);
}

.board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.board-column {
  padding: 14px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-sidebar);
}

.board-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 10px;
}

.board-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.board-count {
  font-size: 11px;
  color: var(--color-text-faint);
}

.board-list {
  display: grid;
  gap: 10px;
  min-height: 120px;
}

.task-card {
  padding: 12px 14px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
}

.task-card.is-done {
  opacity: 0.75;
}

.task-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.task-head strong {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;
}

.priority {
  flex: none;
  padding: 1px 7px;
  border-radius: 5px;
  font-size: 10px;
  background: var(--color-user-bubble);
  color: var(--color-text-muted);
}

.priority-3 {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.task-meta {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--color-text-faint);
}

.task-note {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.task-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--color-line);
}

.task-status {
  margin-left: auto;
  font-size: 11px;
  color: var(--color-text-faint);
}

.board-empty {
  margin: 0;
  padding: 20px 0;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-faint);
}

.date-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
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

@media (max-width: 1000px) {
  .board {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
