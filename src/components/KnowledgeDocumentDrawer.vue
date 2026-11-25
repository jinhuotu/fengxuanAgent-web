<script setup lang="ts">
import type { KnowledgeChunk } from '@/types/knowledge'
import { formatChunkCount, formatChunkSpan } from '@/utils/knowledgeStatus'

defineProps<{
  modelValue: boolean
  title: string
  chunks: KnowledgeChunk[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  error: string
}>()
const emit = defineEmits<{ 'update:modelValue': [visible: boolean]; pageChange: [page: number]; retry: [] }>()
</script>

<template>
  <el-drawer :model-value="modelValue" :title="`${title} · ${formatChunkCount(total)}`"
    size="min(720px, 100%)" direction="rtl" append-to-body @update:model-value="emit('update:modelValue', $event)">
    <p v-if="loading" class="chunk-loading" role="status">正在加载原文…</p>
    <div v-else-if="error" class="chunk-error">
      <el-alert :title="error" type="error" :closable="false" show-icon />
      <el-button @click="emit('retry')">重试</el-button>
    </div>
    <el-empty v-else-if="!chunks.length" description="这篇文档没有切片" />
    <div v-else class="chunk-list">
      <article v-for="chunk in chunks" :key="chunk.id" class="chunk-card">
        <p class="chunk-span">#{{ chunk.chunk_index + 1 }}　{{ formatChunkSpan(chunk) }}</p>
        <p class="chunk-content">{{ chunk.content }}</p>
      </article>
    </div>
    <el-pagination v-if="total > 0" class="chunk-pagination" :current-page="page" :page-size="pageSize"
      :total="total" :disabled="loading" layout="prev, pager, next" @update:current-page="emit('pageChange', $event)" />
  </el-drawer>
</template>

<style scoped>
.chunk-list,
.chunk-error {
  display: grid;
  gap: 12px;
}

.chunk-error {
  justify-items: start;
}

.chunk-card {
  padding: 14px 16px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
}

.chunk-span,
.chunk-loading {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
}

.chunk-content {
  margin: 8px 0 0;
  color: var(--color-text);
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.chunk-pagination {
  margin-top: 16px;
  overflow-x: auto;
}
</style>
