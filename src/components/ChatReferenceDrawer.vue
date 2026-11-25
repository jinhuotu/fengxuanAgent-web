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
      <div class="reference-meta">
        <span class="meta-chip">片段 #{{ detail.chunk_index + 1 }}</span>
        <span class="meta-chip">{{ formatChunkSpan(detail) }}</span>
        <span class="meta-chip">相关度 {{ referenceScoreLabel(score) }}</span>
      </div>
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

/* 三个小标签：片段序号、字符范围、相关度，一行能扫完 */
.reference-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.meta-chip {
  padding: 3px 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-canvas);
  color: var(--color-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.reference-content {
  margin: 0;
  max-height: 65vh;
  overflow-y: auto;
  padding: 16px 18px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-canvas);
  color: var(--color-text);
  font-size: 14px;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  tab-size: 4;
}

.reference-error {
  display: grid;
  justify-items: start;
  gap: 12px;
}
</style>
