<script setup lang="ts">
import type { ChatSession } from '@/types/chat'

defineProps<{
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

// 做什么：把后端的时间字符串改成页面显示用的"日期 时间"
// 入参：形如 2026-11-23T18:44:00 的时间字符串
// 返回：2026-11-23 18:44；空字符串原样返回
function formatSessionTime(isoTime: string): string {
  return isoTime ? isoTime.replace('T', ' ').slice(0, 16) : ''
}

</script>

<template>
    <aside class="session-panel" aria-label="我的会话">
      <div class="session-panel-head">
        <h2>对话</h2>
        <el-button type="primary" size="small" class="new-chat" :loading="creating"
          :disabled="loading" @click="emit('create')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          新建
        </el-button>
      </div>
      <p class="panel-title">
        <span>最近会话 <span>{{ total }}</span></span>
        <el-button v-if="total" text size="small" class="clear-all" :loading="clearing"
          :disabled="loading || clearing" @click="emit('clearing')">清空</el-button>
      </p>
      <div v-loading="loading" class="session-list">
        <!-- 新手注意：行是 li，里面放"选中"和"删除"两个独立按钮，button 不能嵌套 button -->
        <li v-for="session in sessions" :key="session.id" class="session-row">
          <button type="button" class="session-select" :class="{ selected: selectedId === session.id }"
            :aria-current="selectedId === session.id ? 'true' : undefined"
            @click="emit('select', session.id)">
            <span class="session-title">{{ session.title }}</span>
            <small v-if="generatingSessionIds.includes(session.id)">生成中…</small>
            <small v-else>{{ formatSessionTime(session.updated_at) }}</small>
          </button>
          <button type="button" class="session-delete" :disabled="generatingSessionIds.includes(session.id) || deletingSessionIds.includes(session.id)"
            :title="generatingSessionIds.includes(session.id) ? '生成中不能删除' : '删除这条会话'"
            :aria-label="`删除会话 ${session.title}`" @click.stop="emit('delete', session.id)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" />
            </svg>
          </button>
        </li>
        <p v-if="!loading && !sessions.length" class="muted">还没有对话记录</p>
        <el-button v-if="sessions.length < total" text :loading="loading"
          class="load-more" @click="emit('more')">更多会话</el-button>
      </div>
      <p class="privacy-note">仅展示你自己的会话记录</p>
    </aside>
</template>

<style scoped>
.session-panel {
  display: flex;
  flex-direction: column;
  flex: 0 0 236px;
  min-height: 0;
}

.session-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 10px 12px;
}

.session-panel-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.new-chat {
  gap: 4px;
  border-radius: 8px;
}

.new-chat svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  padding: 4px 12px 8px;
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
  gap: 2px;
  min-height: 0;
  overflow-y: auto;
}

/* 会话行平时透明；悬停或选中时整行变白底卡片，删除按钮只在悬停时露出来 */
.session-row {
  position: relative;
  display: flex;
  align-items: stretch;
  border-radius: 10px;
  transition: background 0.15s, box-shadow 0.15s;
}

.session-row:hover,
.session-row:focus-within {
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.session-select {
  display: block;
  flex: 1;
  min-width: 0;
  padding: 10px 32px 10px 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: color 0.15s;
}

.session-select:hover {
  color: var(--color-text);
}

.session-select.selected {
  color: var(--color-primary);
}

.session-select:disabled {
  cursor: default;
}

.session-delete {
  position: absolute;
  top: 50%;
  right: 6px;
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
  display: block;
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-select small {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-text-faint);
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

@media (max-width: 900px) {
  .session-panel {
    flex: 0 0 auto;
  }

  .panel-title,
  .privacy-note {
    display: none;
  }

  .session-list {
    flex-direction: row;
    overflow-x: auto;
  }

  .session-item {
    flex: 0 0 180px;
  }

  .muted {
    margin: 8px 0;
  }

}
</style>
