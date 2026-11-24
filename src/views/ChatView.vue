<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import ChatSessionList from '@/components/ChatSessionList.vue'
import ChatEmptyState from '@/components/ChatEmptyState.vue'
import ChatMessageItem from '@/components/ChatMessageItem.vue'
import { useChat } from '@/composables/useChat'
import { latestRetryRequestId } from '@/composables/chatRecovery'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const initialSessionId = Number(route.query.session) || 0
const chat = useChat(initialSessionId)
const { state } = chat
const generatingSessionIds = computed(listGeneratingSessionIds)
const retryCandidate = computed(() => latestRetryRequestId(state.current))
const conversationBusy = computed(() => state.current.sending || state.current.confirming || state.current.pendingRequestId !== null)
const form = ref<FormInstance>()
const messageContainer = ref<HTMLElement>()
const MAX_INPUT_LENGTH = 4000
const inputRules: FormRules = {
  draft: [
    { required: true, whitespace: true, message: '请输入问题', trigger: 'blur' },
    { max: MAX_INPUT_LENGTH, message: '问题最多 4000 个字符', trigger: 'blur' },
  ],
}

// 做什么：取得本页面正在执行的会话编号供列表显示
// 入参：无，读取各会话任务状态
// 返回：生成中及停止通知尚未确认的会话编号
function listGeneratingSessionIds(): number[] {
  const localIds = Object.values(state.conversations).filter((conversation) => conversation.sending).map((conversation) => conversation.sessionId)
  const remoteIds = state.sessions.filter((session) => session.active_request_id).map((session) => session.id)
  return [...new Set([...localIds, ...remoteIds])]
}

// 做什么：把空状态里点选的建议提问填进输入框，由用户决定是否修改后再发送
// 入参：建议的完整问题
// 返回：无；页面正在生成时不覆盖输入
function fillDraft(question: string): void {
  if (conversationBusy.value) return
  state.current.draft = question
}

// 做什么：通过 Element Plus 表单校验后发送问题
// 入参：无，读取页面表单
// 返回：无；校验失败留在输入框，发送错误由页面状态展示
async function submitQuestion(): Promise<void> {
  if (conversationBusy.value || !form.value) return
  const sessionId = state.selectedId
  const valid = await form.value.validate().catch(() => false)
  if (valid && sessionId === state.selectedId) await chat.sendMessage()
}

// 做什么：新消息到达后滚到末尾，用户正在查看较早内容时不强制拉回
// 入参：无，读取消息容器
// 返回：无
async function scrollToLatest(): Promise<void> {
  const container = messageContainer.value
  if (!container) return
  const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 160
  await nextTick()
  if (nearBottom) container.scrollTop = container.scrollHeight
}

// 做什么：把选中会话写入地址栏，使刷新可以恢复
// 入参：新会话编号
// 返回：无；页面内部更新查询参数不创建新历史记录
function rememberSession(sessionId: number): void {
  if (sessionId) void router.replace({ query: { session: String(sessionId) } })
}

// 做什么：登录失效时中断生成并清除身份
// 入参：是否收到未授权错误
// 返回：无；只有 401 才退出登录
function handleUnauthorized(unauthorized: boolean): void {
  if (!unauthorized) return
  chat.dispose()
  authStore.logout()
  void router.replace('/login')
}

// 做什么：旧账号已清理后重新建立身份，新登录保留并通过整页加载重新校验
// 入参：是否检测到登录存储变化
// 返回：无；退出时转登录页，换号时重新加载权限和本人资料
function handleAccountChanged(changed: boolean): void {
  if (!changed) return
  authStore.syncStoredToken()
  if (authStore.token) window.location.reload()
  else void router.replace('/login')
}

// 做什么：只用服务器确认过的用户编号启用账号通知
// 入参：已加载的本人编号，尚未加载时为 undefined
// 返回：无；暂未确认身份时仍监听登录变化和可见校准
function startTabIdentity(userId: number | undefined): void {
  if (authStore.token !== state.accountToken) return
  chat.startTabSync(userId ?? null)
}

// 做什么：页面首次加载时恢复会话，并监听浏览器离开通知
// 入参：无
// 返回：无
function mountChat(): void {
  // 从其他业务页进入时，内存身份可能仍属于其他标签页切换前的账号。
  if (authStore.token !== state.accountToken) {
    handleAccountChanged(true)
    return
  }
  startTabIdentity(authStore.currentUser?.id)
  window.addEventListener('pagehide', chat.stopAllGenerations)
  void chat.initialize()
}

// 做什么：卸载时移除事件并中断仍在进行的请求
// 入参：无
// 返回：无；销毁操作可以重复执行
function unmountChat(): void {
  window.removeEventListener('pagehide', chat.stopAllGenerations)
  chat.dispose()
}

watch(() => state.selectedId, rememberSession)
watch(() => state.current.messages.at(-1)?.content, scrollToLatest)
watch(() => state.unauthorized, handleUnauthorized)
watch(() => state.accountChanged, handleAccountChanged)
watch(() => authStore.currentUser?.id, startTabIdentity, { immediate: true })
onMounted(mountChat)
onBeforeRouteLeave(chat.dispose)
onBeforeUnmount(unmountChat)
</script>

<template>
  <div class="chat-page">
    <!-- 左：会话列表，直接放在灰色底上，不再套一层卡片 -->
    <ChatSessionList :sessions="state.sessions" :selected-id="state.selectedId" :total="state.sessionTotal"
      :loading="state.loading" :creating="state.creating" :generating-session-ids="generatingSessionIds"
      @create="chat.newSession" @select="chat.selectSession" @more="chat.loadSessions(true)" />

    <!-- 右：白色对话面板 -->
    <section class="conversation-panel" aria-label="对话内容">
      <el-alert v-if="state.current.error" class="chat-alert" :title="state.current.error" type="error" :closable="false" show-icon />
      <el-alert v-if="state.current.contextNotice" class="chat-alert" :title="state.current.contextNotice" type="info" :closable="false" show-icon />
      <div v-if="state.current.syncingHistory || state.current.historySyncError" class="result-confirmation" role="status">
        <span>{{ state.current.syncingHistory ? '历史正在同步，可继续输入或发送下一问。' : state.current.historySyncError }}</span>
        <el-button v-if="state.current.historySyncError" text :disabled="conversationBusy || state.current.loadingHistory"
          @click="chat.syncHistory">重试同步历史</el-button>
      </div>
      <div v-if="state.current.remoteRequestId || state.current.remoteSyncError" class="result-confirmation" role="status">
        <span>{{ state.current.remoteSyncError || '另一页面正在生成，本页仅观察已保存进度。' }}</span>
        <el-button text @click="chat.refreshTabs">同步状态</el-button>
      </div>
      <div v-if="!state.current.remoteRequestId && (state.current.pendingRequestId || state.current.confirming)" class="result-confirmation" role="status">
        <span>{{ state.current.confirming ? '正在确认原请求结果，请稍候…' : '原请求结果尚未确认，暂不重新生成。' }}</span>
        <el-button text :loading="state.current.confirming" @click="chat.checkResult">再次查询结果</el-button>
      </div>

      <div ref="messageContainer" v-loading="state.current.loadingHistory" class="message-list" role="log" aria-label="消息记录">
        <!-- 内容列居中限宽：长回答不会横跨整个屏幕，阅读距离舒服 -->
        <div class="message-column">
          <ChatEmptyState v-if="!state.selectedId || (!state.current.messages.length && !state.current.loadingHistory)"
            :has-session="state.selectedId > 0" :creating="state.creating"
            @create="chat.newSession" @pick="fillDraft" />

          <div v-if="state.current.messages.length < state.current.historyTotal" class="load-older">
            <el-button text :disabled="state.current.sending" @click="chat.loadHistory(true)">加载更早消息</el-button>
          </div>

          <ChatMessageItem v-for="message in state.current.messages" :key="`${message.request_id}-${message.role}`" :message="message"
            :can-retry="message.role === 'assistant' && message.request_id === retryCandidate"
            :retry-disabled="conversationBusy || state.current.loadingHistory" @retry="chat.retryRequest" />
        </div>
      </div>

      <!-- 输入区：悬浮卡片，输入框和按钮在同一张卡里 -->
      <div class="composer-wrap">
        <el-form ref="form" :model="state.current" :rules="inputRules" class="composer" @submit.prevent="submitQuestion">
          <el-form-item prop="draft">
            <el-input v-model="state.current.draft" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }"
              :maxlength="MAX_INPUT_LENGTH" resize="none" aria-label="输入你的问题"
              placeholder="输入问题，Ctrl + Enter 发送"
              :disabled="!state.selectedId || conversationBusy || state.current.loadingHistory"
              @keydown.ctrl.enter.prevent="submitQuestion" />
          </el-form-item>
          <div class="composer-toolbar">
            <span class="composer-hint">Ctrl + Enter 发送 · {{ state.current.draft.length }} / {{ MAX_INPUT_LENGTH }}</span>
            <el-button v-if="state.current.sending" round :disabled="state.current.confirming" @click="chat.stopGeneration">停止生成</el-button>
            <el-button v-else type="primary" round native-type="submit" class="send-button"
              :disabled="!state.selectedId || conversationBusy || state.current.loadingHistory || !state.current.draft.trim()">发送</el-button>
          </div>
        </el-form>
        <p class="composer-note">切换会话可并行生成；离开或关闭仅中断本页面发起的任务。AI 回答请注意核实。</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ---------- 骨架：左列表固定宽，右面板占满 ---------- */
.chat-page {
  display: flex;
  gap: 16px;
  height: 100%;
  min-height: 0;
  color: var(--color-text);
}

/* ---------- 右侧对话面板 ---------- */
.conversation-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
}

.chat-alert {
  margin: 14px 24px 0;
}

.result-confirmation {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 24px 0;
  color: var(--color-text-muted);
  font-size: 13px;
}

.message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 0 12px;
}

/*
 * 内容列：不再写死窄宽度，而是占满面板、只在两侧留内边距。
 * clamp(最小值, 随面板宽度变化的值, 最大值)：面板越宽留白越多，但最多 72px，避免大屏两侧大片空白。
 * max-width 1200px 是上限：再宽一行字就太长，读长回答会串行。
 */
.message-column {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 clamp(24px, 5%, 72px);
}

.load-older {
  margin-bottom: 20px;
  text-align: center;
}

/* ---------- 输入区：悬浮卡片，聚焦时描边发光 ---------- */
/* 输入区外边距：与消息列的左右留白保持一致，视觉上才像同一列 */
.composer-wrap {
  flex-shrink: 0;
  padding: 8px clamp(16px, 5%, 72px) 14px;
}

/* 输入卡片与消息列同宽，这样输入框的左右边缘和回答文字对齐 */
.composer {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 6px 10px 8px 16px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.composer:focus-within {
  border-color: var(--color-primary-light-7);
  box-shadow: 0 0 0 3px var(--color-primary-soft), var(--shadow-card);
}

.composer :deep(.el-form-item) {
  margin-bottom: 0;
}

/* 去掉 Element Plus 文本域自带的边框，让输入框和卡片融为一体 */
.composer :deep(.el-textarea__inner) {
  padding: 8px 0;
  border: 0;
  background: transparent;
  box-shadow: none !important;
  font-size: 15px;
  line-height: 1.6;
  resize: none;
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.composer-hint {
  font-size: 12px;
  color: var(--color-text-faint);
}

.send-button {
  min-width: 84px;
}

.composer-note {
  max-width: 1200px;
  margin: 8px auto 0;
  font-size: 11px;
  color: var(--color-text-faint);
  text-align: center;
}

/* ---------- 窄屏：会话列表横排在上方 ---------- */
@media (max-width: 900px) {
  .chat-page {
    flex-direction: column;
    gap: 12px;
  }

  .message-column {
    padding: 0 16px;
  }

  .composer-wrap {
    padding: 8px 14px 12px;
  }
}
</style>
