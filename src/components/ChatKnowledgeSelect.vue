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
}>()
const emit = defineEmits<{ change: [knowledgeBaseId: number | null] }>()
const selection = computed(knowledgeOptions)

// 做什么：从当前会话的真实选中值整理展示选项
// 入参：无，使用组件传入的选中编号和知识库列表
// 返回：带文档数的选项和已失效标记
function knowledgeOptions() {
  return buildKnowledgeOptions(props.bases, props.selectedId)
}

// 做什么：将下拉选择或清除动作通知页面
// 入参：用户选择的编号或空值
// 返回：无，选中值由页面在服务端确认后更新
function changeSelection(value: number | null | undefined): void {
  emit('change', value ?? null)
}
</script>

<template>
  <div class="knowledge-bar">
    <div class="knowledge-row">
      <span>知识库</span>
      <el-select :model-value="failed ? null : selectedId"
        :placeholder="failed ? '知识库加载失败' : '不使用知识库'"
        :disabled="disabled || loading || failed" :loading="loading" :value-on-clear="null"
        aria-label="知识库" class="knowledge-select" clearable @change="changeSelection">
        <el-option v-if="!loading && !failed && selection.orphan && selectedId !== null"
          :value="selectedId" label="已失效的知识库" disabled />
        <el-option v-for="option in selection.options" :key="option.value" :value="option.value" :label="option.label" />
      </el-select>
    </div>
    <p v-if="!loading && !failed && !bases.length" class="knowledge-note"><RouterLink to="/knowledge">还没有知识库，去新建一个</RouterLink></p>
    <p v-if="error" class="knowledge-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.knowledge-bar {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 4px clamp(24px, 5%, 72px);
  color: var(--color-text-muted);
  font-size: 13px;
}

.knowledge-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 32px;
}

.knowledge-select {
  width: 240px;
  min-width: 0;
}

.knowledge-note,
.knowledge-error {
  margin: 4px 0 0;
}

.knowledge-error {
  color: var(--color-danger);
}

@media (max-width: 900px) {
  .knowledge-bar {
    padding-inline: 14px;
  }
}
</style>
