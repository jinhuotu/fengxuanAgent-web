<script setup lang="ts">
/** 学习计划：今天该复习什么，以及每个主题学到了哪一步。 */
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import {
  createProject, createStudyItem, deleteProject, deleteStudyItem, getStudyOverview, reviewStudyItem,
} from '@/api/plan'
import type { StudyItemRow, StudyOverview } from '@/types/plan'
import { formatMonthDay, MASTERY_MAX, masteryLabel, PLAN_KIND } from '@/utils/planStatus'

const MASTERY_CELLS = [1, 2, 3, 4, 5]

const overview = ref<StudyOverview | null>(null)
const loading = ref(false)
const loadError = ref('')

const projectDialogVisible = ref(false)
const projectFormRef = ref<FormInstance>()
const projectForm = reactive({ title: '' })
const projectRules: FormRules = {
  title: [{ required: true, whitespace: true, max: 80, message: '请输入 1–80 字的主题名', trigger: 'blur' }],
}

const itemDialogVisible = ref(false)
const itemFormRef = ref<FormInstance>()
const itemForm = reactive({ project_id: null as number | null, title: '' })
const itemRules: FormRules = {
  title: [{ required: true, whitespace: true, max: 120, message: '请输入 1–120 字的知识点', trigger: 'blur' }],
}

const reviewItems = computed(() => overview.value?.review_today ?? [])
const groups = computed(() => (overview.value?.projects ?? []).map((project) => ({
  ...project,
  items: (overview.value?.items ?? []).filter((item) => item.project_id === project.id),
})))

// 做什么：读取学习概览
// 入参：无，凭证由请求封装提供
// 返回：无；失败时页面内提供重试
async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    overview.value = await getStudyOverview()
  } catch {
    loadError.value = '加载学习计划失败，请重试'
  } finally {
    loading.value = false
  }
}

// 做什么：提交一次复习结果
// 入参：知识点与是否记住
// 返回：无；答对升档、答错退档，成功后刷新
async function review(item: StudyItemRow, remembered: boolean): Promise<void> {
  try {
    const updated = await reviewStudyItem(item.id, remembered)
    ElMessage.success(remembered ? `「${item.title}」下次 ${formatMonthDay(updated.next_review_date)} 复习` : '已退一档，明天再练')
    await load()
  } catch {
    ElMessage.error('记录复习失败，请重试')
  }
}

// 做什么：打开新建学习主题弹窗
// 入参：无
// 返回：无；表单回到空状态
function openProjectDialog(): void {
  projectForm.title = ''
  projectDialogVisible.value = true
}

// 做什么：提交新建学习主题
// 入参：无，读取弹窗表单
// 返回：无；成功后刷新列表
async function submitProject(): Promise<void> {
  if (!projectFormRef.value) return
  const valid = await projectFormRef.value.validate().catch(() => false)
  if (!valid) return
  try {
    await createProject({ kind: PLAN_KIND.STUDY, title: projectForm.title.trim(), status: 2 })
    projectDialogVisible.value = false
    ElMessage.success('学习主题已创建')
    await load()
  } catch {
    ElMessage.error('创建学习主题失败，请重试')
  }
}

// 做什么：打开新增知识点弹窗
// 入参：预设的学习主题编号
// 返回：无；表单回到空状态
function openItemDialog(projectId: number | null = null): void {
  itemForm.project_id = projectId ?? (groups.value[0]?.id ?? null)
  itemForm.title = ''
  itemDialogVisible.value = true
}

// 做什么：提交新增知识点
// 入参：无，读取弹窗表单
// 返回：无；成功后刷新列表
async function submitItem(): Promise<void> {
  if (!itemFormRef.value || itemForm.project_id === null) return
  const valid = await itemFormRef.value.validate().catch(() => false)
  if (!valid) return
  try {
    await createStudyItem(itemForm.project_id, itemForm.title.trim())
    itemDialogVisible.value = false
    ElMessage.success('知识点已添加，明天进入第一次复习')
    await load()
  } catch {
    ElMessage.error('添加知识点失败，请重试')
  }
}

// 做什么：确认后删除一个知识点
// 入参：知识点
// 返回：无；取消或失败都保留知识点
async function removeItem(item: StudyItemRow): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除知识点「${item.title}」？`, '删除知识点', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
  } catch {
    // 用户取消，不做任何改动。
    return
  }
  try {
    await deleteStudyItem(item.id)
    ElMessage.success('知识点已删除')
    await load()
  } catch {
    ElMessage.error('删除失败，请重试')
  }
}

// 做什么：确认后删除整个学习主题
// 入参：学习主题摘要
// 返回：无；取消或失败都保留主题
async function removeProject(projectId: number, title: string): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除学习主题「${title}」及其知识点？`, '删除学习主题', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
  } catch {
    // 用户取消，不做任何改动。
    return
  }
  try {
    await deleteProject(projectId)
    ElMessage.success('学习主题已删除')
    await load()
  } catch {
    ElMessage.error('删除失败，请重试')
  }
}

onMounted(load)
</script>

<template>
  <div class="panel-shell">
    <header class="panel-toolbar">
      <h2>学习计划 <small>{{ groups.length }} 个主题</small></h2>
      <div class="toolbar-actions">
        <el-button @click="openProjectDialog">新建学习主题</el-button>
        <el-button class="ink-button" :disabled="!groups.length" @click="openItemDialog()">新增知识点</el-button>
      </div>
    </header>

    <section v-if="loadError" class="panel-state">
      <p>{{ loadError }}</p>
      <el-button @click="load">重新加载</el-button>
    </section>
    <section v-else-if="loading" class="panel-state">正在加载学习计划…</section>

    <div v-else class="study-grid">
      <article class="plan-card review-card">
        <header class="review-head">
          <div>
            <p class="card-label">REVIEW TODAY</p>
            <h3>今天要复习</h3>
          </div>
          <span class="review-count">{{ reviewItems.length }} 个</span>
        </header>
        <ul v-if="reviewItems.length" class="review-list">
          <li v-for="item in reviewItems" :key="item.id">
            <div class="review-text">
              <strong>{{ item.title }}</strong>
              <small>{{ item.project_title }} · {{ masteryLabel(item.mastery) }}</small>
            </div>
            <div class="review-actions">
              <button type="button" class="review-button is-yes" @click="review(item, true)">记住了</button>
              <button type="button" class="review-button" @click="review(item, false)">没记住</button>
            </div>
          </li>
        </ul>
        <p v-else class="empty-hint">今天没有到期的知识点。加一个新知识点，明天开始第一轮。</p>
      </article>

      <div class="theme-list">
        <article v-for="group in groups" :key="group.id" class="plan-card theme-card">
          <header class="theme-head">
            <div>
              <h3>{{ group.title }}</h3>
              <p class="theme-meta">
                {{ group.learned }}/{{ group.total }} 已掌握
                <template v-if="group.next_review_date"> · 下次 {{ formatMonthDay(group.next_review_date) }}</template>
              </p>
            </div>
            <span class="theme-percent">{{ group.total ? Math.round(group.learned * 100 / group.total) : 0 }}%</span>
          </header>
          <div class="plan-progress">
            <span :style="{ width: `${group.total ? Math.round(group.learned * 100 / group.total) : 0}%` }"></span>
          </div>
          <ul v-if="group.items.length" class="item-list">
            <li v-for="item in group.items" :key="item.id">
              <div class="item-main">
                <strong>{{ item.title }}</strong>
                <small>{{ masteryLabel(item.mastery) }}</small>
              </div>
              <div class="mastery-cells" :aria-label="`掌握度 ${item.mastery} / ${MASTERY_MAX}`">
                <span v-for="cell in MASTERY_CELLS" :key="cell" :class="{ 'is-on': cell <= item.mastery }"></span>
              </div>
              <button type="button" class="plan-text-button" @click="removeItem(item)">删除</button>
            </li>
          </ul>
          <p v-else class="empty-hint">还没有知识点。点「＋ 知识点」把这一章拆成可以复习的小块。</p>
          <footer class="theme-actions">
            <button type="button" class="plan-text-button" @click="openItemDialog(group.id)">＋ 知识点</button>
            <button type="button" class="plan-text-button" @click="removeProject(group.id, group.title)">删除主题</button>
          </footer>
        </article>

        <p v-if="!groups.length" class="panel-state">还没有学习主题。先建一个，比如「RAG 精读」。</p>
      </div>
    </div>

    <el-dialog v-model="projectDialogVisible" title="新建学习主题" width="420px">
      <el-form ref="projectFormRef" :model="projectForm" :rules="projectRules" label-position="top">
        <el-form-item label="主题名" prop="title">
          <el-input v-model="projectForm.title" maxlength="80" placeholder="例如：RAG 精读" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="projectDialogVisible = false">取消</el-button>
        <el-button class="ink-button" @click="submitProject">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="itemDialogVisible" title="新增知识点" width="420px">
      <el-form ref="itemFormRef" :model="itemForm" :rules="itemRules" label-position="top">
        <el-form-item label="所属主题">
          <el-select v-model="itemForm.project_id" style="width: 100%">
            <el-option v-for="group in groups" :key="group.id" :label="group.title" :value="group.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="知识点" prop="title">
          <el-input v-model="itemForm.title" maxlength="120" placeholder="一个能单独复习的小块" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDialogVisible = false">取消</el-button>
        <el-button class="ink-button" @click="submitItem">添加</el-button>
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

.study-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr);
  gap: 18px;
  align-items: start;
}

.plan-card {
  padding: 20px 22px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.card-label {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--color-accent);
}

.review-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.review-head h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.review-count {
  font-size: 12px;
  color: var(--color-text-faint);
}

.review-list,
.item-list {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}

.review-list li {
  padding: 12px 0;
  border-top: 1px solid var(--color-line);
}

.review-list li:first-child {
  border-top: 0;
  padding-top: 4px;
}

.review-text strong,
.item-main strong {
  display: block;
  font-size: 13px;
  font-weight: 500;
}

.review-text small,
.item-main small {
  font-size: 11px;
  color: var(--color-text-faint);
}

.review-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.review-button {
  padding: 5px 12px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-base);
}

.review-button:hover {
  border-color: var(--color-primary-light-7);
  color: var(--color-text);
}

.review-button.is-yes {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.empty-hint {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--color-text-faint);
  line-height: 1.6;
}

.theme-list {
  display: grid;
  gap: 16px;
}

.theme-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.theme-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.theme-meta {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--color-text-faint);
}

.theme-percent {
  flex: none;
  font-size: 12px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.theme-head + .plan-progress {
  margin-top: 12px;
}

.item-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid var(--color-line);
}

.item-list li:first-child {
  border-top: 0;
  margin-top: 8px;
}

.item-main {
  flex: 1;
  min-width: 0;
}

.mastery-cells {
  display: flex;
  gap: 3px;
  flex: none;
}

.mastery-cells span {
  width: 8px;
  height: 8px;
  border: 1px solid var(--color-line);
  border-radius: 2px;
}

.mastery-cells span.is-on {
  border-color: var(--color-accent);
  background: var(--color-accent);
}

.theme-actions {
  display: flex;
  gap: 14px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--color-line);
}

@media (max-width: 1000px) {
  .study-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
