<script setup lang="ts">
/**
 * 工作进度：四个视图看同一份数据。
 * 每日进度排第一位，因为它每天都用；总计划看方向，工作进度看推进，学习计划看复习。
 */
import { ref } from 'vue'
import DailyPanel from '@/components/plan/DailyPanel.vue'
import GoalPanel from '@/components/plan/GoalPanel.vue'
import StudyPanel from '@/components/plan/StudyPanel.vue'
import WorkPanel from '@/components/plan/WorkPanel.vue'

const VIEWS = [
  { key: 'daily', label: '每日进度' },
  { key: 'goals', label: '总计划' },
  { key: 'work', label: '工作进度' },
  { key: 'study', label: '学习计划' },
] as const
type ViewKey = (typeof VIEWS)[number]['key']

const activeView = ref<ViewKey>('daily')
</script>

<template>
  <div class="plan-page">
    <header class="plan-head">
      <div class="plan-title">
        <p class="section-label">PLAN &amp; PROGRESS</p>
        <h1>工作进度</h1>
        <p class="plan-intro">目标定方向，计划拆动作，每天记一笔。四个视图看的是同一份数据。</p>
      </div>
      <div class="view-switch" role="tablist" aria-label="切换视图">
        <button v-for="view in VIEWS" :key="view.key" type="button" role="tab"
          :aria-selected="activeView === view.key" :class="{ 'is-active': activeView === view.key }"
          @click="activeView = view.key">{{ view.label }}</button>
      </div>
    </header>

    <DailyPanel v-if="activeView === 'daily'" />
    <GoalPanel v-else-if="activeView === 'goals'" />
    <WorkPanel v-else-if="activeView === 'work'" />
    <StudyPanel v-else />
  </div>
</template>

<style scoped>
.plan-page {
  max-width: 1180px;
  margin: 0 auto;
  color: var(--color-text);
}

.plan-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 6px 0 24px;
}

.section-label {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: var(--color-accent);
}

.plan-title h1 {
  margin: 0;
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
}

.plan-intro {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--color-text-muted);
}

/* 分段控件：四个视图共用一个容器，激活项是墨色实心块 */
.view-switch {
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
}

.view-switch button {
  padding: 8px 16px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-base), color var(--transition-base);
}

.view-switch button:hover {
  color: var(--color-text);
  background: var(--color-hover);
}

.view-switch button.is-active {
  background: var(--color-ink);
  color: #fff;
}

.view-switch button.is-active:hover {
  background: var(--color-ink-hover);
  color: #fff;
}
</style>
