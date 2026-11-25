<script setup lang="ts">
import type { KnowledgeChunkDetail } from '@/types/knowledge'
import { formatChunkSpan } from '@/utils/knowledgeStatus'
import { referenceScoreLabel } from '@/utils/knowledgeView'

defineProps<{
  visible: boolean
  loading: boolean
  error: string
  detail: KnowledgeChunkDetail | null
  score: number
}>()
const emit = defineEmits<{ 'update:visible': [visible: boolean] }>()
</script>

<template>
  <el-drawer :model-value="visible" :title="detail?.document_title ?? '参考资料原文'"
    size="min(720px, 100%)" direction="rtl" append-to-body @update:model-value="emit('update:visible', $event)">
    <p v-if="loading" class="reference-status" role="status">正在加载引用原文…</p>
    <div v-else-if="error" class="reference-error">
      <el-alert :title="error" type="error" :closable="false" show-icon />
      <el-button @click="emit('update:visible', false)">关闭</el-button>
    </div>
    <template v-else-if="detail">
      <p class="reference-status">片段 #{{ detail.chunk_index + 1 }}　{{ formatChunkSpan(detail) }}　相关度 {{ referenceScoreLabel(score) }}</p>
      <p class="reference-content">{{ detail.content }}</p>
    </template>
  </el-drawer>
</template>

<style scoped>
.reference-status {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
}

.reference-content {
  margin: 12px 0 0;
  max-height: 65vh;
  overflow-y: auto;
  padding: 14px 16px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  color: var(--color-text);
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.reference-error {
  display: grid;
  justify-items: start;
  gap: 12px;
}
</style>
