<script setup lang="ts">
/**
 * 单条消息的展示组件。
 * 只负责"长什么样"：用户消息画成右侧气泡，助手消息平铺并带头像和模型标签。
 * 引用展开只改变组件的本地显示；状态文字由传入的 message.status 决定。
 */

import { computed, ref } from 'vue'
import type { ChatMessage, ChatReference } from '@/types/chat'
import { referenceTitle } from '@/utils/knowledgeView'
import { renderMarkdown } from '@/utils/markdown'

// 入参：message 一条消息，来自页面状态；role 决定左右布局，status 决定尾部提示
const props = withDefaults(defineProps<{
  message: ChatMessage
  canRetry?: boolean
  retryDisabled?: boolean
  references?: ChatReference[]
}>(), {
  // 做什么：给未传入引用的消息单独准备空列表
  // 入参：无
  // 返回：空数组
  references: () => [],
})
const emit = defineEmits<{ retry: [requestId: string]; openReference: [reference: ChatReference] }>()
const referencesExpanded = ref(false)

// 做什么：把助手正文渲染成 Markdown；生成中在末尾补一个闪烁光标
// 入参：无，读取当前消息正文与状态
// 返回：只含白名单标签的 HTML，用户消息不使用
const renderedContent = computed(() => renderMarkdown(props.message.content, {
  cursor: props.message.status === 'generating',
}))

// 做什么：展开或收起本条助手消息的参考资料
// 入参：无，读取当前展开状态
// 返回：无，只更新本组件的展开状态
function toggleReferences(): void {
  referencesExpanded.value = !referencesExpanded.value
}
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

        <div v-if="message.content" class="message-content markdown-body" v-html="renderedContent"></div>
        <span v-else-if="message.status === 'generating'" class="thinking">
          <span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>正在思考…
        </span>
        <span v-else class="empty-answer">未生成回答</span>

        <p v-if="message.status === 'interrupted'" class="message-state">已中断，以上可能是部分回答</p>
        <p v-if="message.status === 'failed'" class="message-state failed">生成失败，可重新发送问题</p>
        <p v-if="message.finish_reason === 'length'" class="message-state">已达到本次回答长度上限</p>
        <div v-if="references.length" class="message-references">
          <button type="button" class="reference-toggle" :aria-expanded="referencesExpanded" @click="toggleReferences">
            {{ referenceTitle(references.length) }}
            <svg class="reference-chevron" :class="{ rotated: referencesExpanded }" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <ul v-show="referencesExpanded" class="reference-list">
            <li v-for="reference in references" :key="reference.index">
              <button type="button" class="reference-link" :aria-label="`查看第 ${reference.index} 条参考资料原文`"
                @click="emit('openReference', reference)">[{{ reference.index }}] {{ reference.heading_path }}</button>
            </li>
          </ul>
        </div>
        <el-button v-if="canRetry" text :disabled="retryDisabled" class="retry-button" @click="emit('retry', message.request_id)">重新生成</el-button>
      </div>
    </template>
  </article>
</template>

<style scoped>
.message {
  display: flex;
  margin-bottom: 32px;
}

.message.user {
  justify-content: flex-end;
}

/* 用户气泡：中性浅灰。以前用品牌浅蓝，和蓝色按钮、蓝色选中项挤在一起，全页没有重点 */
.user-bubble {
  max-width: 80%;
  padding: 10px 16px;
  border-radius: 18px 18px 6px 18px;
  background: var(--color-user-bubble);
  color: var(--color-user-bubble-text);
  font-size: 15px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.message.assistant {
  align-items: flex-start;
  gap: 14px;
}

.assistant-avatar {
  width: 26px;
  height: 26px;
  margin-top: 1px;
  border-radius: 8px;
  font-size: 12px;
}

.assistant-body {
  flex: 1;
  min-width: 0;
}

/* 身份行压到 12px：它只是标注"这是谁说的"，不该比正文还抢眼 */
.assistant-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
}

.model-badge {
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-faint);
}

.model-badge::before {
  content: '·';
  margin-right: 8px;
}

.message-content {
  font-size: 16px;
  line-height: 1.75;
  overflow-wrap: anywhere;
}

/* 操作按钮平时隐藏，鼠标移到这条消息上才出现，长对话里少一排排干扰 */
.retry-button {
  margin-top: 6px;
  margin-left: -8px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.message:hover .retry-button,
.retry-button:focus-visible {
  opacity: 1;
}

/* ---------- Markdown 正文样式 ----------
 * v-html 生成的子节点拿不到 scoped 属性，所以凡是孩子都要用 :deep() 才能选中。
 * 只给白名单标签配样式，没匹配到的标签（例如表格）根本不会被渲染出来。 */
.markdown-body :deep(p) {
  margin: 0 0 10px;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

/* 回答里最多用到三级标题：字号逐级收小，和 16px 正文拉开层级 */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin: 22px 0 8px;
  font-weight: 600;
  line-height: 1.45;
}

.markdown-body :deep(h1) {
  font-size: 20px;
}

.markdown-body :deep(h2) {
  font-size: 18px;
}

.markdown-body :deep(h3) {
  font-size: 16.5px;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0 0 10px;
  padding-left: 22px;
}

.markdown-body :deep(li) {
  margin: 3px 0;
}

.markdown-body :deep(strong) {
  font-weight: 600;
  color: var(--color-text);
}

.markdown-body :deep(em) {
  font-style: italic;
}

.markdown-body :deep(code) {
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--color-canvas);
  border: 1px solid var(--color-line);
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 0.9em;
}

.markdown-body :deep(pre) {
  margin: 0 0 12px;
  padding: 12px 14px;
  border-radius: var(--radius-control);
  background: var(--color-canvas);
  overflow-x: auto;
  line-height: 1.65;
}

.markdown-body :deep(pre code) {
  padding: 0;
  border: 0;
  background: transparent;
  white-space: pre;
  font-size: 13px;
}

.markdown-body :deep(blockquote) {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-left: 3px solid var(--color-primary-light-7);
  border-radius: 0 8px 8px 0;
  background: var(--color-canvas);
  color: var(--color-text-muted);
}

.markdown-body :deep(hr) {
  margin: 16px 0;
  border: 0;
  border-top: 1px solid var(--color-line);
}

.markdown-body :deep(a) {
  color: var(--color-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* 流式光标：插在最后一个块内，随文字一起前进 */
.markdown-body :deep(.md-cursor) {
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
  font-size: 15px;
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
  display: block;
  width: fit-content;
  margin: 10px 0 0;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--color-canvas);
  font-size: 12px;
  color: var(--color-text-muted);
}

.message-state.failed {
  background: #fdecea;
  color: var(--color-danger);
}

.message-references {
  margin-top: 12px;
  color: var(--color-text-muted);
  font-size: 13px;
}

/* 引用入口做成一颗小胶囊：有底色、有箭头，比纯文字更像"可点开的东西" */
.reference-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-canvas);
  color: var(--color-text-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
}

.reference-toggle:hover {
  border-color: var(--color-primary-light-7);
  background: var(--color-primary-light-9);
  color: var(--color-primary);
}

.reference-chevron {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  transition: transform var(--transition-fast);
}

.reference-chevron.rotated {
  transform: rotate(180deg);
}

.reference-list {
  margin: 8px 0 0;
  padding: 4px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-canvas);
  list-style: none;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.reference-link {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.reference-link:hover,
.reference-link:focus-visible {
  background: var(--color-surface);
  color: var(--color-primary);
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
