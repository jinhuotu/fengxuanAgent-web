<script setup lang="ts">
/**
 * 对话历史加载时的骨架屏。
 * 形状按"助手回答"画：一个方头像 + 三行长短不一的横条，
 * 数据到位后换成真消息，视觉落点基本不变，不会从空白突然跳出一大段文字。
 */

// 入参：要画几组回答，默认两组；label 供读屏朗读
withDefaults(defineProps<{ groups?: number; label?: string }>(), {
  groups: 2,
  label: '正在加载历史消息',
})
</script>

<template>
  <div class="history-skeleton" role="status" :aria-label="label">
    <div v-for="group in groups" :key="group" class="skeleton-group" aria-hidden="true">
      <span class="skeleton-avatar" />
      <div class="skeleton-lines">
        <span class="skeleton-line title" />
        <span class="skeleton-line" />
        <span class="skeleton-line short" />
      </div>
    </div>
    <span class="visually-hidden">{{ label }}</span>
  </div>
</template>

<style scoped>
.history-skeleton {
  display: flex;
  flex-direction: column;
  gap: 30px;
  padding: 6px 0 10px;
}

.skeleton-group {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.skeleton-avatar {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: linear-gradient(90deg, rgba(20, 35, 61, 0.06) 25%, rgba(20, 35, 61, 0.12) 37%,
    rgba(20, 35, 61, 0.06) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

.skeleton-lines {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
}

.skeleton-line {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, rgba(20, 35, 61, 0.06) 25%, rgba(20, 35, 61, 0.12) 37%,
    rgba(20, 35, 61, 0.06) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

.skeleton-line.title {
  width: 38%;
  height: 10px;
  animation-delay: 0.1s;
}

.skeleton-line.short {
  width: 62%;
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
