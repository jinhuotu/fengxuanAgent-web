<script setup lang="ts">
/**
 * 表格形状的骨架屏。
 * 为什么不用 el-skeleton：Element Plus 的骨架是"几行横条"，和表格的列宽对不上，
 * 加载完数据换成真表格时会明显跳一下。这里按列数画格子，位置和真表格基本对齐。
 */

// 入参：行数、列数、无障碍朗读文字
const props = withDefaults(defineProps<{
  rows?: number
  columns?: number
  label?: string
}>(), {
  rows: 6,
  columns: 4,
  label: '正在加载列表',
})

// 做什么：生成行序号数组，供模板里 v-for 使用
// 入参：无
// 返回：1..rows 的连续整数
function rowNumbers(): number[] {
  return Array.from({ length: props.rows }, (_, index) => index + 1)
}

// 做什么：生成列序号数组
// 入参：无
// 返回：1..columns 的连续整数
function columnNumbers(): number[] {
  return Array.from({ length: props.columns }, (_, index) => index + 1)
}
</script>

<template>
  <div class="skeleton-table" role="status" :aria-label="label">
    <div class="skeleton-row skeleton-head" aria-hidden="true">
      <span v-for="column in columnNumbers()" :key="column" class="skeleton-cell" />
    </div>
    <div v-for="row in rowNumbers()" :key="row" class="skeleton-row" aria-hidden="true">
      <span v-for="column in columnNumbers()" :key="column" class="skeleton-cell"
        :class="{ wide: column === 1 }" />
    </div>
    <span class="visually-hidden">{{ label }}</span>
  </div>
</template>

<style scoped>
/* 骨架屏放在 .data-panel 里，容器已经带了描边和圆角，这里不再自己画框 */
.skeleton-table {
  overflow: hidden;
}

.skeleton-row {
  display: flex;
  gap: 16px;
  padding: 13px 0;
}

.skeleton-row:first-child {
  border-top: 0;
}

.skeleton-head {
  align-items: center;
  height: 44px;
  border-bottom: 1px solid #d9d5cc;
}

.skeleton-row:not(.skeleton-head) + .skeleton-row {
  border-top: 1px solid var(--color-line);
}

/* 第一列宽一点，模仿"编号/名称在前"的常见表格 */
.skeleton-cell {
  flex: 1;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, rgba(20, 35, 61, 0.06) 25%, rgba(20, 35, 61, 0.12) 37%,
    rgba(20, 35, 61, 0.06) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

.skeleton-cell.wide {
  flex: 1.6;
}

.skeleton-head .skeleton-cell {
  height: 10px;
  background: rgba(20, 35, 61, 0.05);
  animation: none;
}

@keyframes shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>
