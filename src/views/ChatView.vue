<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { isAxiosError } from 'axios'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { listKnowledgeBases } from '@/api/knowledge'
import ChatKnowledgeSelect from '@/components/ChatKnowledgeSelect.vue'
import ChatSessionList from '@/components/ChatSessionList.vue'
import ChatEmptyState from '@/components/ChatEmptyState.vue'
import ChatHistorySkeleton from '@/components/ChatHistorySkeleton.vue'
import ChatMessageItem from '@/components/ChatMessageItem.vue'
import ChatReferenceDrawer from '@/components/ChatReferenceDrawer.vue'
import { useChat } from '@/composables/useChat'
import { useChatReferenceDrawer } from '@/composables/useChatReferenceDrawer'
import { latestRetryRequestId } from '@/composables/chatRecovery'
import { useAuthStore } from '@/stores/auth'
import type { ApiResponse } from '@/types/api'
import type { ChatMessage, ChatReference } from '@/types/chat'
import type { KnowledgeBase } from '@/types/knowledge'
import { resolveMessageReferences } from '@/utils/chatReferences'
import { isNearBottom } from '@/utils/chatScroll'
import { loadKnowledgeBasePages } from '@/utils/knowledgePages'
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const initialSessionId = Number(route.query.session) || 0
const chat = useChat(initialSessionId)
const { state } = chat
const { referencePreview, openReference } = useChatReferenceDrawer(() => state.selectedId, () => authStore.token)
const generatingSessionIds = computed(listGeneratingSessionIds)
const retryCandidate = computed(() => latestRetryRequestId(state.current))
const conversationBusy = computed(() => state.current.sending || state.current.confirming || state.current.pendingRequestId !== null)
const form = ref<FormInstance>()
const messageContainer = ref<HTMLElement>()
// 是否继续跟随新内容：用户往上翻看旧消息时置 false，出现"回到最新"按钮
const followingLatest = ref(true)
// 下一帧滚动的句柄，0 表示当前没有排队中的滚动
let scrollFrame = 0
// 空引用共用同一个数组，保证没有引用的消息在流式期间不会因新数组而重复渲染
const EMPTY_REFERENCES: ChatReference[] = []
const knowledgeBases = ref<KnowledgeBase[]>([])
const knowledgeLoading = ref(true)
const knowledgeLoadFailed = ref(false)
const knowledgeChanges = reactive(new Set<number>())
// 正在删除的会话编号，防止连点重复提交
const deletingIds = reactive(new Set<number>())
const clearingSessions = ref(false)
const knowledgeErrors = reactive<Record<number, string>>({})
const selectedKnowledgeBaseId = computed(currentKnowledgeBaseId)
const knowledgeTruncated = ref(false)
const KNOWLEDGE_PAGE_SIZE = 50
const KNOWLEDGE_MAX_PAGES = 4
const MAX_INPUT_LENGTH = 4000
// 引用列表只在流式内容变化时重算一次，模板按消息键取值
const messageReferences = computed(buildReferenceMap)
// 字数提示只在接近上限时出现，平时不占视线
const showInputCounter = computed(() => state.current.draft.length > MAX_INPUT_LENGTH * 0.8)
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

// 做什么：记录用户是否停在消息列表底部，用于决定要不要继续自动跟随
// 入参：无，读取滚动容器当前位置
// 返回：无；上翻查看旧消息时停止自动滚动，不再"抢"用户的滚动条
function handleListScroll(): void {
  const container = messageContainer.value
  if (!container) return
  followingLatest.value = isNearBottom(container)
}

// 做什么：在下一帧把列表贴到底部；同一帧内多次流式更新只执行一次
// 入参：无，读取消息容器
// 返回：无；用户已上翻时不打扰
function scheduleScrollToLatest(): void {
  if (!followingLatest.value || scrollFrame) return
  // requestAnimationFrame：把多次 delta 触发的滚动合并到浏览器绘制的下一帧，
  // 避免每来一个字就强制排版一次，这是流式输出卡顿的主要来源。
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const container = messageContainer.value
    if (!container || !followingLatest.value) return
    container.scrollTop = container.scrollHeight
  })
}

// 做什么：点击"回到最新"后恢复跟随并平滑滚到底部
// 入参：无
// 返回：无
function jumpToLatest(): void {
  followingLatest.value = true
  const container = messageContainer.value
  if (!container) return
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
}

// 做什么：把同一条消息的引用数组缓存起来，避免流式输出时每条消息都重算
// 入参：无，读取消息与实时引用
// 返回：以"请求编号-角色"为键的引用列表；空引用共用同一个常量数组
function buildReferenceMap(): Map<string, ChatReference[]> {
  const map = new Map<string, ChatReference[]>()
  for (const message of state.current.messages) {
    const resolved = resolveMessageReferences(message, state.current.references, state.current.referencesRequestId)
    map.set(messageKey(message), resolved.length ? resolved : EMPTY_REFERENCES)
  }
  return map
}

// 做什么：生成消息在列表中的稳定键
// 入参：一条消息
// 返回：同一轮同一角色固定不变
function messageKey(message: ChatMessage): string {
  return `${message.request_id}-${message.role}`
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

// 做什么：把选中会话写入地址栏，使刷新可以恢复
// 入参：新会话编号，0 表示空态
// 返回：无；回到空态时清掉旧的 session 参数
function rememberSession(sessionId: number): void {
  if (sessionId) void router.replace({ query: { session: String(sessionId) } })
  else if (route.query.session) void router.replace({ query: {} })
}

// 做什么：确认后永久删除一条会话，生成中直接拒绝
// 入参：会话编号
// 返回：无；取消确认或接口失败时列表保持不变
async function confirmDeleteSession(sessionId: number): Promise<void> {
  if (deletingIds.has(sessionId)) return
  if (generatingSessionIds.value.includes(sessionId)) {
    ElMessage.warning('这条会话正在生成回答，结束后才能删除')
    return
  }
  const title = state.sessions.find((session) => session.id === sessionId)?.title ?? '这条会话'
  try {
    await ElMessageBox.confirm(`“${title}”的全部消息将被永久删除，无法恢复。`, '删除会话', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  deletingIds.add(sessionId)
  try {
    // 新手注意：接口失败会把原因写进当前会话的 error，页面顶部已经有红色提示
    if (await chat.deleteSession(sessionId)) ElMessage.success('会话已删除')
  } finally {
    deletingIds.delete(sessionId)
  }
}

// 做什么：确认后清空本人全部会话，任一条在生成时整批拒绝
// 入参：无
// 返回：无；取消确认或接口失败时列表保持不变
async function confirmClearSessions(): Promise<void> {
  if (clearingSessions.value || !state.sessionTotal) return
  if (generatingSessionIds.value.length) {
    ElMessage.warning('有会话正在生成回答，结束后才能清空')
    return
  }
  try {
    await ElMessageBox.confirm(`全部 ${state.sessionTotal} 条对话和消息将被永久删除，无法恢复。`, '清空全部会话', {
      type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  clearingSessions.value = true
  try {
    if (await chat.clearSessions()) ElMessage.success('已清空全部会话')
  } finally {
    clearingSessions.value = false
  }
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

// 做什么：按后端会话列表取得当前所选知识库
// 入参：无，使用当前会话编号
// 返回：已保存的库编号；未选库时返回 null
function currentKnowledgeBaseId(): number | null {
  return state.sessions.find((session) => session.id === state.selectedId)?.knowledge_base_id ?? null
}

// 做什么：挂载后按页加载知识库，最多取满上限页数
// 入参：无，使用固定起始页码、每页条数与页数上限
// 返回：无；失败只在下拉显示提示，超出上限时标记为未完整展示
async function loadKnowledgeBases(): Promise<void> {
  try {
    const result = await loadKnowledgeBasePages(
      (page, pageSize) => listKnowledgeBases(page, pageSize), KNOWLEDGE_PAGE_SIZE, KNOWLEDGE_MAX_PAGES,
    )
    knowledgeBases.value = result.items
    knowledgeTruncated.value = result.truncated
  } catch {
    knowledgeLoadFailed.value = true
  } finally {
    knowledgeLoading.value = false
  }
}

// 做什么：保存下拉选择，并把失败提示留在发起请求的会话
// 入参：知识库编号或表示清除选择的 null
// 返回：无；失败时保留后端已有的选择
async function changeKnowledgeBase(knowledgeBaseId: number | null): Promise<void> {
  const sessionId = state.selectedId
  if (!sessionId || knowledgeChanges.has(sessionId)) return
  knowledgeChanges.add(sessionId)
  delete knowledgeErrors[sessionId]
  try {
    await chat.updateKnowledgeBase(knowledgeBaseId)
  } catch (error) {
    const message = isAxiosError<ApiResponse<unknown>>(error) ? error.response?.data?.message : undefined
    knowledgeErrors[sessionId] = message || '知识库选择保存失败，请稍后重试'
  } finally {
    knowledgeChanges.delete(sessionId)
  }
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
  void loadKnowledgeBases()
}

// 做什么：卸载时移除事件并中断仍在进行的请求
// 入参：无
// 返回：无；销毁操作可以重复执行
function unmountChat(): void {
  window.removeEventListener('pagehide', chat.stopAllGenerations)
  // 取消排队中的滚动帧，避免页面卸载后回调仍去碰已销毁的容器
  if (scrollFrame) {
    cancelAnimationFrame(scrollFrame)
    scrollFrame = 0
  }
  chat.dispose()
}

watch(() => state.selectedId, (sessionId) => {
  // 换会话时回到跟随状态：新会话打开就该看到最新消息
  followingLatest.value = true
  rememberSession(sessionId)
})
watch(() => state.current.messages.at(-1)?.content, scheduleScrollToLatest)
watch(() => state.current.messages.length, () => {
  // 自己刚发出问题时强制恢复跟随，否则上一次"上翻"会让新提问滚出视野
  if (state.current.messages.at(-1)?.role === 'user') followingLatest.value = true
  scheduleScrollToLatest()
})
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
      :loading="state.loading" :creating="state.creating" :clearing="clearingSessions"
      :generating-session-ids="generatingSessionIds" :deleting-session-ids="[...deletingIds]"
      @create="chat.newSession" @select="chat.selectSession" @more="chat.loadSessions(true)"
      @delete="confirmDeleteSession" @clearing="confirmClearSessions" />

    <!-- 右：白色对话面板 -->
    <section class="conversation-panel" aria-label="对话内容">
      <ChatKnowledgeSelect :bases="knowledgeBases" :selected-id="selectedKnowledgeBaseId" :truncated="knowledgeTruncated"
        :loading="knowledgeLoading" :failed="knowledgeLoadFailed" :error="knowledgeErrors[state.selectedId] ?? ''"
        :disabled="!state.selectedId || conversationBusy || generatingSessionIds.includes(state.selectedId) || knowledgeChanges.has(state.selectedId)"
        @change="changeKnowledgeBase" />
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

      <div ref="messageContainer" class="message-list" role="log" aria-label="消息记录" @scroll.passive="handleListScroll">
        <div class="message-column">
          <ChatHistorySkeleton v-if="state.current.loadingHistory && !state.current.messages.length" />

          <ChatEmptyState v-if="!state.selectedId || (!state.current.messages.length && !state.current.loadingHistory)"
            :has-session="state.selectedId > 0" :creating="state.creating"
            @create="chat.newSession" @pick="fillDraft" />

          <div v-if="state.current.loadingHistory && state.current.messages.length" class="load-older" aria-hidden="true">
            <span class="history-dots"><i></i><i></i><i></i></span>
          </div>

          <div v-if="state.current.messages.length < state.current.historyTotal" class="load-older">
            <el-button text :disabled="state.current.sending" @click="chat.loadHistory(true)">加载更早消息</el-button>
          </div>

          <ChatMessageItem v-for="message in state.current.messages" :key="messageKey(message)" :message="message"
            :references="messageReferences.get(messageKey(message)) ?? EMPTY_REFERENCES"
            :can-retry="message.role === 'assistant' && message.request_id === retryCandidate"
            :retry-disabled="conversationBusy || state.current.loadingHistory" @retry="chat.retryRequest" @open-reference="openReference" />
        </div>
      </div>
      <!-- 上翻查看旧内容时停止自动滚动，这里给一个回到最新位置的入口 -->
      <transition name="fade-up">
        <button v-if="!followingLatest && state.current.messages.length" type="button" class="jump-latest"
          aria-label="回到最新消息" @click="jumpToLatest">
          回到最新
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
        </button>
      </transition>
      <ChatReferenceDrawer v-bind="referencePreview" v-model:visible="referencePreview.visible" />
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
            <span class="composer-hint">
              Ctrl + Enter 发送
              <span v-if="showInputCounter" class="composer-count">{{ state.current.draft.length }} / {{ MAX_INPUT_LENGTH }}</span>
            </span>
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
  position: relative;
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
  /* 滚到边界时不让整页跟着弹动，对话区自己收住滚动 */
  overscroll-behavior: contain;
  padding: 28px 0 20px;
}

/*
 * 内容列：不再写死窄宽度，而是占满面板、只在两侧留内边距。
 * clamp(最小值, 随面板宽度变化的值, 最大值)：面板越宽留白越多，但最多 72px，避免大屏两侧大片空白。
 * max-width 1040px 是上限：一行约 60 个汉字，再宽读长回答会串行。
 */
.message-column {
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  padding: 0 clamp(24px, 5%, 72px);
}

.load-older {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
  text-align: center;
}

/* 历史加载中的三点提示：比整块 v-loading 遮罩轻，不会把已读内容盖住 */
.history-dots {
  display: inline-flex;
  gap: 5px;
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  background: var(--color-canvas);
}

.history-dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-text-faint);
  animation: dot-pulse 1.2s infinite;
}

.history-dots i:nth-child(2) {
  animation-delay: 0.2s;
}

.history-dots i:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dot-pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}

/* ---------- 回到最新：浮在输入区上方，不遮挡消息 ---------- */
.jump-latest {
  position: absolute;
  bottom: 148px;
  left: 50%;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  box-shadow: var(--shadow-float);
  color: var(--color-text-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transform: translateX(-50%);
  transition: color var(--transition-fast), box-shadow var(--transition-fast);
}

.jump-latest:hover {
  color: var(--color-primary);
}

.jump-latest svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.fade-up-enter-active,
.fade-up-leave-active {
  transition: opacity var(--transition-base), transform var(--transition-base);
}

.fade-up-enter-from,
.fade-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
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
  max-width: 1040px;
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

/* 接近上限才显示字数，颜色提醒"快到头了" */
.composer-count {
  margin-left: 6px;
  color: var(--color-warning);
  font-variant-numeric: tabular-nums;
}

.send-button {
  min-width: 84px;
}

.composer-note {
  max-width: 1040px;
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
