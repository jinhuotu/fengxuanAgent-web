<script setup lang="ts">
/**
 * 对话页的空状态组件。
 * 两种样子：
 *   - 还没选中任何会话：一个大的"新建对话"引导
 *   - 已选中会话但还没有消息：标题 + 三条建议提问
 * 只负责展示和抛出事件；新建会话、填入输入框都由页面决定。
 */

// 建议提问：点一下只是把问题填进输入框，用户可以改完再发，不会自动发送
const SUGGESTED_QUESTIONS = [
  { label: '梳理思路', question: '帮我梳理一个复杂需求的实现思路，并拆成可执行的小步骤。' },
  { label: '解释概念', question: '用通俗的语言解释一个技术概念，并举一个生活中的例子。' },
  { label: '润色文字', question: '帮我把一段工作说明改得更清楚、更专业，保持原意不变。' },
]

// 入参：hasSession 是否已选中会话；creating 新建请求进行中，用来显示按钮加载态
defineProps<{ hasSession: boolean; creating: boolean }>()

// 事件：create 用户点了"新建对话"；pick 用户点了某条建议
const emit = defineEmits<{ create: []; pick: [question: string] }>()
</script>

<template>
  <div class="empty-state">
    <template v-if="!hasSession">
      <span class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
        </svg>
      </span>
      <h1>有什么想聊的？</h1>
      <p>新建一个对话，开始你的第一个问题。</p>
      <el-button type="primary" round class="empty-action" :loading="creating" @click="emit('create')">新建对话</el-button>
    </template>

    <template v-else>
      <h1>开始新的思考</h1>
      <p>输入问题，AI 会逐段为你回答。也可以从下面的问题开始。</p>
      <div class="suggestions">
        <button v-for="suggestion in SUGGESTED_QUESTIONS" :key="suggestion.label" type="button"
          class="suggestion" @click="emit('pick', suggestion.question)">
          <strong>{{ suggestion.label }}</strong>
          <small>{{ suggestion.question }}</small>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 0 32px;
  text-align: center;
}

.empty-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-bottom: 20px;
  border-radius: 18px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.empty-icon svg {
  width: 26px;
  height: 26px;
  fill: currentColor;
}

.empty-state h1 {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 600;
}

.empty-state p {
  margin: 0;
  color: var(--color-text-muted);
}

.empty-action {
  margin-top: 24px;
}

.suggestions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
  margin-top: 28px;
}

.suggestion {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--transition-base), background var(--transition-base),
    box-shadow var(--transition-base), transform var(--transition-base);
}

.suggestion:hover {
  border-color: var(--color-primary-light-7);
  background: var(--color-primary-light-9);
  box-shadow: var(--shadow-card);
  transform: translateY(-2px);
}

.suggestion strong {
  font-size: 14px;
}

.suggestion small {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-muted);
}

@media (max-width: 900px) {
  .suggestions {
    grid-template-columns: 1fr;
  }
}
</style>
