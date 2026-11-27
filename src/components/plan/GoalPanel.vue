<script setup lang="ts">
/** 总计划：目标 + 关键结果，进度按数值达成率自动折算。 */
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { createGoal, createKeyResult, deleteGoal, listGoals, updateGoal, updateKeyResult } from '@/api/plan'
import type { GoalCreatePayload, KeyResult, KeyResultCreatePayload, PlanGoal } from '@/types/plan'
import { GOAL_PERIOD_NAMES, GOAL_STATUS_NAMES, PERIOD_CHOICES } from '@/utils/planStatus'

const FILTERS = [
  { value: 0, label: '全部' }, { value: 1, label: '年度' }, { value: 2, label: '季度' }, { value: 3, label: '月度' },
]
const MANUAL_MODE = 1
const AUTO_MODE = 2

const goals = ref<PlanGoal[]>([])
const activeFilter = ref(0)
const loading = ref(false)
const loadError = ref('')

const goalDialogVisible = ref(false)
const goalFormRef = ref<FormInstance>()
const goalForm = reactive({
  title: '', period_type: 2, period_label: '', description: '', progress_mode: AUTO_MODE, manual_progress: 0,
})
const goalRules: FormRules = {
  title: [{ required: true, whitespace: true, max: 80, message: '请输入 1–80 字的目标', trigger: 'blur' }],
  period_label: [{ required: true, whitespace: true, max: 20, message: '请输入周期标签', trigger: 'blur' }],
}

const keyResultDialogVisible = ref(false)
const keyResultGoalId = ref<number | null>(null)
const keyResultFormRef = ref<FormInstance>()
const keyResultForm = reactive({ title: '', metric_unit: '项', start_value: 0, target_value: 1, current_value: 0 })
const keyResultRules: FormRules = {
  title: [{ required: true, whitespace: true, max: 80, message: '请输入 1–80 字的关键结果', trigger: 'blur' }],
}

const filteredGoals = computed(() => (
  activeFilter.value === 0 ? goals.value : goals.value.filter((goal) => goal.period_type === activeFilter.value)
))

// 做什么：读取本人全部目标
// 入参：无，凭证由请求封装提供
// 返回：无；失败时页面内提供重试
async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    goals.value = await listGoals()
  } catch {
    loadError.value = '加载目标失败，请重试'
  } finally {
    loading.value = false
  }
}

// 做什么：按当前季度生成一个默认周期标签
// 入参：无，读取浏览器当前日期
// 返回：形如 2026 Q4 的标签
function defaultPeriodLabel(): string {
  const now = new Date()
  return `${now.getFullYear()} Q${Math.floor(now.getMonth() / 3) + 1}`
}

// 做什么：打开新建目标弹窗并填入默认值
// 入参：无
// 返回：无；表单回到空状态
function openGoalDialog(): void {
  goalForm.title = ''
  goalForm.period_type = 2
  goalForm.period_label = defaultPeriodLabel()
  goalForm.description = ''
  goalForm.progress_mode = AUTO_MODE
  goalForm.manual_progress = 0
  goalDialogVisible.value = true
}

// 做什么：提交新建目标
// 入参：无，读取弹窗表单
// 返回：无；成功后关闭弹窗并刷新列表
async function submitGoal(): Promise<void> {
  if (!goalFormRef.value) return
  const valid = await goalFormRef.value.validate().catch(() => false)
  if (!valid) return
  const payload: GoalCreatePayload = {
    title: goalForm.title.trim(),
    period_type: goalForm.period_type,
    period_label: goalForm.period_label.trim(),
    description: goalForm.description.trim() || null,
    progress_mode: goalForm.progress_mode,
    manual_progress: goalForm.manual_progress,
  }
  try {
    await createGoal(payload)
    goalDialogVisible.value = false
    ElMessage.success('目标已创建')
    await load()
  } catch {
    ElMessage.error('创建目标失败，请重试')
  }
}

// 做什么：打开新增关键结果弹窗
// 入参：目标编号
// 返回：无；表单回到默认值
function openKeyResultDialog(goalId: number): void {
  keyResultGoalId.value = goalId
  keyResultForm.title = ''
  keyResultForm.metric_unit = '项'
  keyResultForm.start_value = 0
  keyResultForm.target_value = 1
  keyResultForm.current_value = 0
  keyResultDialogVisible.value = true
}

// 做什么：提交新增关键结果
// 入参：无，读取弹窗表单与当前目标
// 返回：无；成功后刷新列表
async function submitKeyResult(): Promise<void> {
  if (!keyResultFormRef.value || keyResultGoalId.value === null) return
  const valid = await keyResultFormRef.value.validate().catch(() => false)
  if (!valid) return
  const payload: KeyResultCreatePayload = {
    title: keyResultForm.title.trim(),
    metric_unit: keyResultForm.metric_unit.trim() || '项',
    start_value: Number(keyResultForm.start_value) || 0,
    target_value: Number(keyResultForm.target_value) || 0,
    current_value: Number(keyResultForm.current_value) || 0,
  }
  try {
    await createKeyResult(keyResultGoalId.value, payload)
    keyResultDialogVisible.value = false
    ElMessage.success('关键结果已添加')
    await load()
  } catch {
    ElMessage.error('添加关键结果失败，请重试')
  }
}

// 做什么：行内改关键结果当前值并重算进度
// 入参：关键结果与输入框事件
// 返回：无；数值非法时恢复原值
async function saveKeyResultValue(keyResult: KeyResult, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  if (!Number.isFinite(value)) {
    input.value = String(keyResult.current_value)
    return
  }
  if (value === keyResult.current_value) return
  try {
    await updateKeyResult(keyResult.id, { current_value: value })
    await load()
  } catch {
    input.value = String(keyResult.current_value)
    ElMessage.error('更新当前值失败，请重试')
  }
}

// 做什么：弹窗调整手动模式目标的进度
// 入参：目标
// 返回：无；取消弹窗时保持原值
async function editManualProgress(goal: PlanGoal): Promise<void> {
  let input = ''
  try {
    const result = await ElMessageBox.prompt('输入 0–100 的整数进度', '调整手动进度', {
      inputValue: String(goal.manual_progress),
      inputPattern: /^(100|[1-9]?\d)$/,
      inputErrorMessage: '请输入 0–100 的整数',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    })
    input = result.value
  } catch {
    // 用户点了取消，属于正常退出。
    return
  }
  try {
    await updateGoal(goal.id, { manual_progress: Number(input) })
    await load()
    ElMessage.success('进度已更新')
  } catch {
    ElMessage.error('更新进度失败，请重试')
  }
}

// 做什么：确认后删除目标
// 入参：目标
// 返回：无；取消或失败都保留目标
async function removeGoal(goal: PlanGoal): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除目标「${goal.title}」及其关键结果？`, '删除目标', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
  } catch {
    // 用户取消，不做任何改动。
    return
  }
  try {
    await deleteGoal(goal.id)
    ElMessage.success('目标已删除')
    await load()
  } catch {
    ElMessage.error('删除失败，请重试')
  }
}

onMounted(load)
</script>

<template>
  <div class="panel-shell">
    <div class="goal-toolbar">
      <div class="filter-row" role="tablist" aria-label="按周期筛选">
        <button v-for="item in FILTERS" :key="item.value" type="button"
          :class="{ 'is-active': activeFilter === item.value }" @click="activeFilter = item.value">
          {{ item.label }}
        </button>
      </div>
      <el-button class="ink-button" @click="openGoalDialog">新建目标</el-button>
    </div>

    <section v-if="loadError" class="panel-state">
      <p>{{ loadError }}</p>
      <el-button @click="load">重新加载</el-button>
    </section>
    <section v-else-if="loading" class="panel-state">正在加载目标…</section>

    <div v-else class="goal-grid">
      <article v-for="goal in filteredGoals" :key="goal.id" class="plan-card">
        <header class="goal-head">
          <div class="goal-badge">
            <span class="period">{{ goal.period_label }}</span>
            <span class="status" :class="`status-${goal.status}`">{{ GOAL_STATUS_NAMES[goal.status] }}</span>
          </div>
          <button type="button" class="plan-text-button" @click="removeGoal(goal)">删除</button>
        </header>
        <h3 class="goal-title">{{ goal.title }}</h3>
        <p v-if="goal.description" class="goal-desc">{{ goal.description }}</p>

        <div class="goal-progress">
          <div class="progress-text">
            <strong>{{ goal.progress }}%</strong>
            <span>{{ goal.progress_mode === MANUAL_MODE ? '手动进度' : `${goal.key_results.length} 个关键结果` }}
              · {{ goal.project_count }} 个计划</span>
          </div>
          <div class="plan-progress"><span :style="{ width: `${goal.progress}%` }"></span></div>
        </div>

        <ul v-if="goal.key_results.length" class="kr-list">
          <li v-for="kr in goal.key_results" :key="kr.id">
            <div class="kr-head">
              <strong>{{ kr.title }}</strong>
              <span>{{ kr.current_value }} / {{ kr.target_value }} {{ kr.metric_unit }}</span>
            </div>
            <div class="kr-row">
              <div class="plan-progress"><span :style="{ width: `${kr.progress}%` }"></span></div>
              <input class="kr-input" type="number" :value="kr.current_value" @change="saveKeyResultValue(kr, $event)" />
              <span class="kr-percent">{{ kr.progress }}%</span>
            </div>
          </li>
        </ul>
        <p v-else class="empty-hint">还没有关键结果。拆出 2–4 个能算数的指标，进度才有意义。</p>

        <div class="goal-actions">
          <button type="button" class="plan-text-button" @click="openKeyResultDialog(goal.id)">＋ 关键结果</button>
          <button v-if="goal.progress_mode === MANUAL_MODE" type="button" class="plan-text-button"
            @click="editManualProgress(goal)">调整进度</button>
        </div>
      </article>

      <p v-if="!filteredGoals.length" class="panel-state">这个周期还没有目标，先定一个方向。</p>
    </div>

    <el-dialog v-model="goalDialogVisible" title="新建目标" width="480px">
      <el-form ref="goalFormRef" :model="goalForm" :rules="goalRules" label-position="top">
        <el-form-item label="目标" prop="title">
          <el-input v-model="goalForm.title" maxlength="80" placeholder="例如：把工作进度平台上线并跑顺" />
        </el-form-item>
        <el-form-item label="周期类型">
          <el-select v-model="goalForm.period_type" style="width: 100%">
            <el-option v-for="value in PERIOD_CHOICES" :key="value" :label="GOAL_PERIOD_NAMES[value]" :value="value" />
          </el-select>
        </el-form-item>
        <el-form-item label="周期标签" prop="period_label">
          <el-input v-model="goalForm.period_label" maxlength="20" placeholder="例如：2026 Q4" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="goalForm.description" type="textarea" :rows="2" maxlength="300" />
        </el-form-item>
        <el-form-item label="进度来源">
          <el-select v-model="goalForm.progress_mode" style="width: 100%">
            <el-option label="按关键结果自动算" :value="AUTO_MODE" />
            <el-option label="手动填写" :value="MANUAL_MODE" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="goalForm.progress_mode === MANUAL_MODE" label="手动进度（%）">
          <input v-model.number="goalForm.manual_progress" class="plain-input" type="number" min="0" max="100" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="goalDialogVisible = false">取消</el-button>
        <el-button class="ink-button" @click="submitGoal">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="keyResultDialogVisible" title="新增关键结果" width="480px">
      <el-form ref="keyResultFormRef" :model="keyResultForm" :rules="keyResultRules" label-position="top">
        <el-form-item label="关键结果" prop="title">
          <el-input v-model="keyResultForm.title" maxlength="80" placeholder="例如：六张表全部有迁移和测试" />
        </el-form-item>
        <el-form-item label="计量单位">
          <el-input v-model="keyResultForm.metric_unit" maxlength="20" placeholder="项 / 小时 / 篇" />
        </el-form-item>
        <div class="triple-row">
          <el-form-item label="起始值">
            <input v-model.number="keyResultForm.start_value" class="plain-input" type="number" />
          </el-form-item>
          <el-form-item label="目标值">
            <input v-model.number="keyResultForm.target_value" class="plain-input" type="number" />
          </el-form-item>
          <el-form-item label="当前值">
            <input v-model.number="keyResultForm.current_value" class="plain-input" type="number" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="keyResultDialogVisible = false">取消</el-button>
        <el-button class="ink-button" @click="submitKeyResult">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.panel-shell {
  display: grid;
  gap: 18px;
}

.goal-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.filter-row {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
}

.filter-row button {
  padding: 6px 14px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.filter-row button.is-active {
  background: var(--color-ink);
  color: #fff;
}

.panel-state {
  padding: 40px 0;
  text-align: center;
  color: var(--color-text-muted);
}

.goal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 18px;
}

.plan-card {
  display: flex;
  flex-direction: column;
  padding: 20px 22px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.goal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.goal-badge {
  display: flex;
  gap: 6px;
}

.period,
.status {
  padding: 2px 9px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
}

.period {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.status {
  background: var(--color-user-bubble);
  color: var(--color-text-muted);
}

.status-2 {
  background: #e7f3eb;
  color: #237a4b;
}

.goal-title {
  margin: 12px 0 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
}

.goal-desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--color-text-muted);
}

.goal-progress {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--color-line);
}

.progress-text {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.progress-text strong {
  font-size: 22px;
  font-weight: 600;
  line-height: 1;
}

.progress-text span {
  font-size: 12px;
  color: var(--color-text-faint);
}

.kr-list {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}

.kr-list li + li {
  margin-top: 12px;
}

.kr-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.kr-head strong {
  font-size: 13px;
  font-weight: 500;
}

.kr-head span {
  flex: none;
  font-size: 11px;
  color: var(--color-text-faint);
  font-variant-numeric: tabular-nums;
}

.kr-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kr-row .plan-progress {
  flex: 1;
}

.kr-input {
  width: 68px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-line);
  border-radius: 7px;
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.kr-percent {
  width: 38px;
  text-align: right;
  font-size: 11px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.empty-hint {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--color-text-faint);
  line-height: 1.6;
}

.goal-actions {
  display: flex;
  gap: 16px;
  margin-top: auto;
  padding-top: 16px;
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

.triple-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
</style>
