<script setup lang="ts">
/**
 * 单条消息的展示组件。
 * 只负责"长什么样"：用户消息画成右侧气泡，助手消息平铺并带头像和模型标签。
 * 不发请求、不改状态；状态文字（中断、失败、长度上限）由传入的 message.status 决定。
 */

import type { ChatMessage } from '@/types/chat'

// 入参：message 一条消息，来自页面状态；role 决定左右布局，status 决定尾部提示
defineProps<{ message: ChatMessage; canRetry?: boolean; retryDisabled?: boolean }>()
const emit = defineEmits<{ retry: [requestId: string] }>()
</script>

<template>
  <!-- 新手注意：用户消息是右侧气泡，助手回答不用气泡，像文档一样平铺，长文更好读。 -->
  <article class="message" :class="message.role" :aria-label="message.role === 'user' ? '你' : 'AI 助手'">
    <div v-if="message.role === 'user'" class="user-bubble">{{ message.content }}</div>

    <template v-else>
      <span class="assistant-avatar brand-mark" aria-hidden="true">锋</span>
      <div class="assistant-body">
        <div class="assistant-meta">
          AI 助手
          <span v-if="message.model" class="model-badge">{{ message.model }}</span>
        </div>

        <div class="message-content">
          <template v-if="message.content">
            {{ message.content }}<span v-if="message.status === 'generating'" class="stream-cursor" aria-hidden="true"></span>
          </template>
          <span v-else-if="message.status === 'generating'" class="thinking">
            <span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>正在思考…
          </span>
          <span v-else class="empty-answer">未生成回答</span>
        </div>

        <p v-if="message.status === 'interrupted'" class="message-state">已中断，以上可能是部分回答</p>
        <p v-if="message.status === 'failed'" class="message-state failed">生成失败，可重新发送问题</p>
        <p v-if="message.finish_reason === 'length'" class="message-state">已达到本次回答长度上限</p>
        <el-button v-if="canRetry" text :disabled="retryDisabled" @click="emit('retry', message.request_id)">重新发送此问题</el-button>
      </div>
    </template>
  </article>
</template>

<style scoped>
.message {
  display: flex;
  margin-bottom: 28px;
}

.message.user {
  justify-content: flex-end;
}

/* 用户气泡：最多占列宽 78%，右下角收小表示"是我说的" */
.user-bubble {
  max-width: 78%;
  padding: 12px 16px;
  border-radius: 16px 16px 4px 16px;
  background: var(--color-primary-soft);
  color: #1b3d8f;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.message.assistant {
  align-items: flex-start;
  gap: 14px;
}

.assistant-avatar {
  width: 34px;
  height: 34px;
  margin-top: 2px;
  border-radius: 10px;
  font-size: 15px;
}

.assistant-body {
  flex: 1;
  min-width: 0;
  padding-top: 3px;
}

.assistant-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}

.model-badge {
  padding: 1px 8px;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-canvas);
  font-size: 11px;
  font-weight: 400;
  color: var(--color-text-muted);
}

.message-content {
  font-size: 15px;
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 流式输出时的光标：一根闪烁的竖线，告诉用户"还在写" */
.stream-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 3px;
  background: var(--color-primary);
  vertical-align: -2px;
  animation: blink 1s steps(2) infinite;
}

.thinking {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-muted);
}

/* 三个点依次跳动，是业界通用的"正在输入"符号 */
.typing-dots {
  display: inline-flex;
  gap: 4px;
}

.typing-dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary);
  opacity: 0.3;
  animation: bounce 1.2s infinite;
}

.typing-dots i:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dots i:nth-child(3) {
  animation-delay: 0.4s;
}

.empty-answer {
  color: var(--color-text-faint);
}

.message-state {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.message-state.failed {
  color: var(--color-danger);
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

@keyframes bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.3;
  }
  40% {
    transform: translateY(-4px);
    opacity: 1;
  }
}
</style>
