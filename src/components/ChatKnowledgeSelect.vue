<script setup lang="ts">
import { computed } from 'vue'
import type { KnowledgeBase } from '@/types/knowledge'
import { buildKnowledgeOptions } from '@/utils/knowledgeView'

const props = defineProps<{
  bases: KnowledgeBase[]
  selectedId: number | null
  disabled: boolean
  loading: boolean
  failed: boolean
  error: string
  truncated?: boolean
}>()
const emit = defineEmits<{ change: [knowledgeBaseId: number | null] }>()
const selection = computed(knowledgeOptions)
const hasPick = computed(hasSelection)

// 做什么：从当前会话的真实选中值整理展示选项
// 入参：无，使用组件传入的选中编号和知识库列表
// 返回：带文档数的选项和已失效标记
function knowledgeOptions() {
  return buildKnowledgeOptions(props.bases, props.selectedId)
}

// 做什么：判断胶囊是否处于"已选了库"的状态，用来换成暖色底
// 入参：无，使用组件传入的选中编号
// 返回：选中了库为 true；没选或加载失败为 false
function hasSelection(): boolean {
  return !props.failed && props.selectedId !== null
}

// 做什么：将下拉选择或清除动作通知页面
// 入参：用户选择的编号或空值
// 返回：无，选中值由页面在服务端确认后更新
function changeSelection(value: number | null | undefined): void {
  emit('change', value ?? null)
}
</script>

<template>
  <!-- 输入框工具条里的一个胶囊：没选库时是浅底"选择知识库"，选了以后变暖色底并显示库名 -->
  <div class="knowledge-bar">
    <el-select :model-value="failed ? null : selectedId"
      :placeholder="failed ? '知识库加载失败' : '选择知识库'"
      :disabled="disabled || loading || failed" :loading="loading" :value-on-clear="null" filterable
      aria-label="知识库" class="knowledge-select" :class="{ 'is-picked': hasPick }" clearable
      placement="top-start" @change="changeSelection">
      <template #prefix>
        <svg class="knowledge-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
          <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" />
        </svg>
      </template>
      <el-option v-if="!loading && !failed && selection.orphan && selectedId !== null"
        :value="selectedId" label="已失效的知识库" disabled />
      <el-option v-for="option in selection.options" :key="option.value" :value="option.value" :label="option.label" />
    </el-select>
    <p v-if="!loading && !failed && !bases.length" class="knowledge-note"><RouterLink to="/knowledge">还没有知识库，去新建一个</RouterLink></p>
    <p v-else-if="!loading && !failed && truncated" class="knowledge-note">知识库较多，这里只列出前几页；完整列表请到知识库页查看。</p>
    <p v-if="error" class="knowledge-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
/* 胶囊在输入框工具条里，不占固定宽度：文字多长它就多长，最长不超过 260 */
.knowledge-bar {
  position: relative;
  flex-shrink: 0;
  font-size: 13px;
}

.knowledge-select {
  width: auto;
  max-width: 260px;
}

/*
 * 把 Element 下拉自带的方框和描边去掉，改成一个圆角胶囊。
 * 下拉内部的类名不带本组件的 scoped 标记，要用 :deep() 才选得到。
 */
.knowledge-select :deep(.el-select__wrapper) {
  min-height: 32px;
  padding: 0 10px 0 10px;
  gap: 6px;
  border-radius: var(--radius-pill);
  background: var(--color-canvas);
  box-shadow: none;
  font-size: 13px;
  transition: background 0.15s;
}

.knowledge-select :deep(.el-select__wrapper:hover),
.knowledge-select :deep(.el-select__wrapper.is-focused) {
  background: var(--color-hover);
  box-shadow: none;
}

/* 输入框聚焦时整张卡片会加一圈光晕，胶囊自己不再另加 */
.knowledge-select :deep(.el-select__wrapper.is-focused .el-select__cursor) {
  display: none;
}

.knowledge-select :deep(.el-select__selected-item),
.knowledge-select :deep(.el-select__placeholder) {
  overflow: hidden;
  color: var(--color-text-muted);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-select :deep(.el-select__caret) {
  color: var(--color-text-faint);
  font-size: 12px;
}

.knowledge-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: var(--color-text-faint);
}

/* 选了库：暖色底、墨色字、暖橙图标，一眼能看出"这一问会带着资料" */
.knowledge-select.is-picked :deep(.el-select__wrapper) {
  background: var(--color-accent-soft);
}

.knowledge-select.is-picked :deep(.el-select__selected-item) {
  color: var(--color-text);
  font-weight: 500;
}

.knowledge-select.is-picked .knowledge-icon {
  color: var(--color-accent);
}

/* 禁用态（生成中、保存中）整体变淡，但仍能看清当前选的是什么 */
.knowledge-select.is-disabled :deep(.el-select__wrapper) {
  opacity: 0.6;
}

.knowledge-select.is-disabled :deep(.el-select__wrapper) {
  cursor: not-allowed;
}

/* 这几条提示只在"没有知识库 / 只列了前几页 / 保存失败"时出现，浮在胶囊上方，不把输入框顶开 */
.knowledge-note,
.knowledge-error {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 3;
  width: max-content;
  max-width: 320px;
  margin: 0;
  padding: 6px 12px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--shadow-float);
  font-size: 12px;
  line-height: 1.6;
}

.knowledge-error {
  color: var(--color-danger);
}

@media (max-width: 600px) {
  .knowledge-select {
    max-width: 170px;
  }
}
</style>
