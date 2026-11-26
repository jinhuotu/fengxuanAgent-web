<script setup lang="ts">
/**
 * 会话历史列表。对话页把它放进左侧栏的中段，所以自己不带卡片底色和边框。
 * 顶部是"新对话"按钮，下面按 今天 / 昨天 / 更早 分组列出会话。
 * 只负责展示和抛出事件；新建、选中、删除都由页面决定。
 */
import { computed } from 'vue'
import type { ChatSession } from '@/types/chat'

const props = defineProps<{
  sessions: ChatSession[]
  selectedId: number
  total: number
  loading: boolean
  creating: boolean
  clearing: boolean
  generatingSessionIds: number[]
  deletingSessionIds: number[]
}>()
const emit = defineEmits<{ create: []; clearing: []; select: [sessionId: number]; more: []; delete: [sessionId: number] }>()

const GROUP_TODAY = '今天'
const GROUP_YESTERDAY = '昨天'
const GROUP_EARLIER = '更早'
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

// 做什么：判断一条会话属于哪个时间分组
// 入参：会话更新时间的 ISO 字符串
// 返回：今天 / 昨天 / 更早；按日历日切分，昨晚 11 点算昨天而不是"24 小时内"
function sessionGroupLabel(isoTime: string): string {
  const updatedAt = new Date(isoTime).getTime()
  if (!Number.isFinite(updatedAt)) return GROUP_EARLIER
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const passedDays = Math.floor((startOfToday.getTime() - updatedAt) / MILLISECONDS_PER_DAY)
  if (passedDays < 1) return GROUP_TODAY
  return passedDays === 1 ? GROUP_YESTERDAY : GROUP_EARLIER
}

// 做什么：把已按时间倒序的会话列表切成连续的分组
// 入参：无，读取组件收到的会话列表
// 返回：按出现顺序排列的分组，每组带标题和会话；空列表返回空数组
function groupSessions(): { label: string; sessions: ChatSession[] }[] {
  const groups: { label: string; sessions: ChatSession[] }[] = []
  for (const session of props.sessions) {
    const label = sessionGroupLabel(session.updated_at)
    const lastGroup = groups[groups.length - 1]
    // 列表本身是倒序的，同名分组只会相邻出现，所以接到最后一组就够了
    if (lastGroup && lastGroup.label === label) lastGroup.sessions.push(session)
    else groups.push({ label, sessions: [session] })
  }
  return groups
}
const sessionGroups = computed(groupSessions)

// 做什么：把后端的时间字符串改成悬停提示用的"日期 时间"
// 入参：形如 2026-11-23T18:44:00 的时间字符串
// 返回：2026-11-23 18:44；空字符串原样返回
function formatSessionTime(isoTime: string): string {
  return isoTime ? isoTime.replace('T', ' ').slice(0, 16) : ''
}
</script>

<template>
  <div class="session-panel" aria-label="我的会话">
    <el-button type="primary" class="new-chat ink-button" :loading="creating"
      :disabled="loading" @click="emit('create')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      <span class="new-chat-label">新对话</span>
    </el-button>

    <div class="panel-title">
      <span>最近会话 <span>{{ total }}</span></span>
      <el-button v-if="total" text size="small" class="clear-all" :loading="clearing"
        :disabled="loading || clearing" @click="emit('clearing')">清空</el-button>
    </div>

    <div v-loading="loading" class="session-list">
      <template v-for="group in sessionGroups" :key="group.label">
        <p class="group-label">{{ group.label }}</p>
        <!-- 新手注意：行是 li，里面放"选中"和"删除"两个独立按钮，button 不能嵌套 button -->
        <li v-for="session in group.sessions" :key="session.id" class="session-row">
          <button type="button" class="session-select" :class="{ selected: selectedId === session.id }"
            :aria-current="selectedId === session.id ? 'true' : undefined" :title="formatSessionTime(session.updated_at)"
            @click="emit('select', session.id)">
            <span class="session-title">{{ session.title }}</span>
            <span v-if="generatingSessionIds.includes(session.id)" class="generating-dot" aria-label="生成中"></span>
          </button>
          <button type="button" class="session-delete" :disabled="generatingSessionIds.includes(session.id) || deletingSessionIds.includes(session.id)"
            :title="generatingSessionIds.includes(session.id) ? '生成中不能删除' : '删除这条会话'"
            :aria-label="`删除会话 ${session.title}`" @click.stop="emit('delete', session.id)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" />
            </svg>
          </button>
        </li>
      </template>
      <p v-if="!loading && !sessions.length" class="muted">还没有对话记录</p>
      <el-button v-if="sessions.length < total" text :loading="loading"
        class="load-more" @click="emit('more')">更多会话</el-button>
    </div>
    <p class="privacy-note">仅展示你自己的会话记录</p>
  </div>
</template>

<style scoped>
/* 直接铺在侧栏上：不设宽度，由侧栏插槽决定占多宽 */
.session-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.new-chat {
  width: 100%;
  height: 38px;
  gap: 6px;
  border-radius: var(--radius-control);
}

.new-chat svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18px 4px 4px;
  font-size: 12px;
  color: var(--color-text-faint);
}

.clear-all {
  padding: 0;
  height: auto;
  font-size: 12px;
  color: var(--color-text-faint);
}

.clear-all:hover {
  color: var(--color-danger);
}

.session-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-height: 0;
  padding: 2px;
  overflow-y: auto;
}

.group-label {
  margin: 12px 8px 4px;
  font-size: 12px;
  color: var(--color-text-faint);
}

.group-label:first-child {
  margin-top: 4px;
}

/* 会话行：一行只放标题，悬停时铺一层浅底并露出删除按钮 */
.session-row {
  position: relative;
  display: flex;
  align-items: stretch;
  border-radius: 8px;
  transition: background 0.15s;
}

.session-row:hover,
.session-row:focus-within {
  background: var(--color-hover);
}

.session-select {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 30px 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 13.5px;
  text-align: left;
  cursor: pointer;
  transition: color 0.15s;
}

.session-select:hover {
  color: var(--color-text);
}

.session-select.selected {
  background: rgba(31, 41, 55, 0.08);
  color: var(--color-text);
  font-weight: 500;
}

.generating-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--color-accent);
}

.session-delete {
  position: absolute;
  top: 50%;
  right: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-faint);
  cursor: pointer;
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.session-delete svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.session-row:hover .session-delete,
.session-row:focus-within .session-delete {
  opacity: 1;
}

.session-delete:hover {
  background: rgba(192, 57, 43, 0.1);
  color: var(--color-danger);
}

.session-delete:disabled {
  cursor: default;
  opacity: 0.3;
}

.session-delete:disabled:hover {
  background: transparent;
  color: var(--color-text-faint);
}

.session-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  margin: 12px 10px;
  font-size: 13px;
  color: var(--color-text-faint);
  text-align: center;
}

.load-more {
  align-self: center;
  margin-top: 6px;
}

.privacy-note {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--color-text-faint);
  text-align: center;
}

/* ---------- 窄屏：列表横着排在对话页顶部 ---------- */
@media (max-width: 900px) {
  .session-panel {
    flex: 0 0 auto;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding: 0 14px 8px;
  }

  .new-chat {
    width: 38px;
    flex-shrink: 0;
  }

  .new-chat-label,
  .panel-title,
  .group-label,
  .privacy-note {
    display: none;
  }

  .session-list {
    flex-direction: row;
    align-items: center;
    padding: 0;
    overflow-x: auto;
  }

  .session-row {
    flex: 0 0 180px;
  }

  .muted {
    margin: 8px 0;
    white-space: nowrap;
  }
}
</style>
