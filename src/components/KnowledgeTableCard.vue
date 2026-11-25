<script setup lang="ts">
import SkeletonTable from '@/components/SkeletonTable.vue'

defineProps<{
  loading: boolean
  error: string
  currentPage: number
  pageSize: number
  total: number
  // 首次加载且还没有任何数据：用骨架表占位，加载完直接换成真表格
  skeleton?: boolean
}>()
const emit = defineEmits<{ retry: []; pageChange: [page: number] }>()
</script>

<template>
  <el-card class="knowledge-card">
    <header class="knowledge-heading">
      <div><slot name="heading" /></div>
      <slot name="actions" />
    </header>
    <div v-if="error" class="knowledge-list-error">
      <el-alert :title="error" type="error" :closable="false" show-icon />
      <el-button @click="emit('retry')">重试</el-button>
    </div>
    <template v-else>
      <SkeletonTable v-if="skeleton" :rows="6" :columns="4" label="正在加载列表" />
      <template v-else>
        <slot />
        <el-pagination :current-page="currentPage" :page-size="pageSize" :total="total"
          :disabled="loading" layout="total, prev, pager, next" @update:current-page="emit('pageChange', $event)" />
      </template>
    </template>
  </el-card>
</template>

<style scoped>
.knowledge-card {
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  --el-card-padding: 26px 28px;
}

.knowledge-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 4px;
}

.knowledge-heading :deep(h1) {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.knowledge-heading :deep(p) {
  margin: 6px 0 0;
  color: var(--color-text-muted);
}

.knowledge-card :deep(.el-table) {
  margin-top: 20px;
  --el-table-header-bg-color: var(--color-canvas);
  --el-table-header-text-color: var(--color-text-muted);
  font-size: 14px;
}

.knowledge-card :deep(.el-table th.el-table__cell) {
  font-weight: 600;
}

.knowledge-card :deep(.el-pagination) {
  margin-top: 20px;
  overflow-x: auto;
}

.knowledge-list-error {
  display: grid;
  justify-items: start;
  gap: 12px;
  margin-top: 16px;
}

@media (max-width: 600px) {
  .knowledge-card {
    --el-card-padding: 16px;
  }
}
</style>
