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
  <!-- 标题行在白板上方；表格、骨架屏、分页都装在同一块白色圆角板里 -->
  <section class="knowledge-card">
    <header class="knowledge-heading">
      <slot name="heading" />
      <slot name="actions" />
    </header>
    <div class="data-panel">
      <div v-if="error" class="knowledge-list-error">
        <el-alert :title="error" type="error" :closable="false" show-icon />
        <el-button @click="emit('retry')">重试</el-button>
      </div>
      <template v-else>
        <SkeletonTable v-if="skeleton" :rows="6" :columns="4" label="正在加载列表" />
        <template v-else>
          <slot />
          <!-- 总数自己写成中文：组件库默认语言是英文，会显示成 "Total 2" -->
          <el-pagination :current-page="currentPage" :page-size="pageSize" :total="total"
            :disabled="loading" layout="slot, prev, pager, next" @update:current-page="emit('pageChange', $event)">
            <span class="data-total">共 {{ total }} 条</span>
          </el-pagination>
        </template>
      </template>
    </div>
  </section>
</template>

<style scoped>
.knowledge-card {
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
}

.knowledge-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 20px;
}

/* 页面主标题：比正文大两档，是整页唯一的视觉重心 */
.knowledge-heading :deep(h1) {
  margin: 0;
  font-size: 26px;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}

.knowledge-heading :deep(p) {
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.knowledge-list-error {
  display: grid;
  justify-items: start;
  gap: 12px;
  padding: 18px 0;
}

@media (max-width: 600px) {
  .knowledge-heading :deep(h1) {
    font-size: 22px;
  }

  /* 窄屏两侧留白收一点，表格才放得下 */
  .knowledge-card :deep(.data-panel) {
    padding: 0 12px;
  }
}
</style>
