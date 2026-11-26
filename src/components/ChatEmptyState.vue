<script setup lang="ts">
/**
 * 对话页的空状态：一句问候 + 四个建议问题。
 * 没有会话时不再放"新建对话"按钮——输入框就在下面，用户直接打字或点建议即可，
 * 新建会话由页面在发送时顺带完成。只负责展示和抛出事件。
 */

// 建议问题贴着知识库场景写，让用户一眼知道这个助手是"问资料"的，不是闲聊机器人
const SUGGESTED_QUESTIONS = [
  { label: '查规范', question: '发布窗口和值班交接各有什么要求？' },
  { label: '看架构', question: '这个项目分成哪几层，每层负责什么？' },
  { label: '做总结', question: '帮我总结知识库里关于测试和验收的要求。' },
  { label: '解释概念', question: '用通俗的话解释一个技术概念，并举一个生活里的例子。' },
]

// 入参：hasSession 是否已选中会话；busy 新建或发送进行中，用来禁用建议；
//       knowledgePicked 是否已选知识库，决定副标题怎么说明回答的来源
defineProps<{ hasSession: boolean; busy: boolean; knowledgePicked: boolean }>()

// 事件：pick 用户点了某条建议
const emit = defineEmits<{ pick: [question: string] }>()
</script>

<template>
  <div class="empty-state">
    <h1>{{ hasSession ? '接着聊点什么？' : '有什么想问的？' }}</h1>
    <p v-if="knowledgePicked">回答只依据你选的知识库；资料没写的地方，助手会直接说没有。</p>
    <!-- 没选库时后端不做检索，不能说"依据知识库"，改成告诉用户怎么选 -->
    <p v-else>想有据可查，先在下方选一个知识库；不选也可以直接提问。</p>
    <div class="suggestions">
      <button v-for="suggestion in SUGGESTED_QUESTIONS" :key="suggestion.label" type="button"
        class="suggestion" :disabled="busy" @click="emit('pick', suggestion.question)">
        <strong>{{ suggestion.label }}</strong>
        <small>{{ suggestion.question }}</small>
        <svg class="suggestion-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  padding: 8px 0 4px;
}

.empty-state h1 {
  margin: 0 0 10px;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.empty-state p {
  max-width: 34em;
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--color-text-muted);
}

/* 建议卡：两行两列，每张是一句能直接发出去的问题 */
.suggestions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 28px;
}

.suggestion {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 40px 14px 16px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--transition-base), background var(--transition-base),
    transform var(--transition-base);
}

.suggestion:hover:not(:disabled) {
  border-color: #d6d1c7;
  background: #fffdf9;
  transform: translateY(-1px);
}

.suggestion:disabled {
  cursor: default;
  opacity: 0.6;
}

.suggestion strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-accent);
}

.suggestion small {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-muted);
}

.suggestion-arrow {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--color-text-faint);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: stroke var(--transition-base);
}

.suggestion:hover:not(:disabled) .suggestion-arrow {
  stroke: var(--color-text);
}

@media (max-width: 900px) {
  .empty-state h1 {
    font-size: 22px;
  }

  .suggestions {
    grid-template-columns: 1fr;
    gap: 8px;
    margin-top: 18px;
  }
}
</style>
