<script setup lang="ts">
import type { ChatSession } from '@/types/chat'

defineProps<{
  sessions: ChatSession[]
  selectedId: number
  total: number
  loading: boolean
  creating: boolean
  generatingSessionIds: number[]
}>()
const emit = defineEmits<{ create: []; select: [sessionId: number]; more: [] }>()

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
      <p class="panel-title">最近会话 <span>{{ total }}</span></p>
      <div v-loading="loading" class="session-list">
        <button v-for="session in sessions" :key="session.id" class="session-item"
          :class="{ selected: selectedId === session.id }"
          :aria-current="selectedId === session.id ? 'true' : undefined" @click="emit('select', session.id)">
          <span class="session-title">{{ session.title }}</span>
          <small v-if="generatingSessionIds.includes(session.id)">生成中…</small>
          <small v-else>{{ formatSessionTime(session.updated_at) }}</small>
        </button>
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
  justify-content: space-between;
  margin: 0;
  padding: 4px 12px 8px;
  font-size: 12px;
  color: var(--color-text-faint);
}

.session-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow-y: auto;
}

/* 会话项平时透明，悬停和选中都是白底卡片，用阴影而不是边框区分层级 */
.session-item {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s, color 0.15s;
}

.session-item:hover,
.session-item.selected {
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.session-item:hover {
  color: var(--color-text);
}

.session-item.selected {
  color: var(--color-primary);
}

.session-item:disabled {
  cursor: default;
}

.session-title {
  display: block;
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-item small {
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
