/** 每个会话独立保存消息和生成任务，切换会话不取消后台流。 */
import type { AxiosError } from 'axios'
import { reactive } from 'vue'
import { ChatRequestError, clearChatSessions, createChatSession, deleteChatSession, getChatSessions, interruptChat, streamChat } from '@/api/chat'
import type { ChatEvent, ChatMessage, ChatReference, ChatSession } from '@/types/chat'
import { getToken } from '@/utils/token'
import { confirmRequest, createRecoveryState, latestRetryRequestId, submissionWasRejected, validateManualRetry } from '@/composables/chatRecovery'
import { discardRejectedTurn, invalidateHistorySync, refreshConversationHistory } from '@/composables/chatHistory'
import { connectChatTabs } from '@/composables/chatTabSync'
import { updateKnowledgeBase } from '@/composables/chatKnowledge'
import type { ChatTabSync } from '@/composables/chatTabSync'

const FIRST_PAGE = 1
const MAX_INPUT_LENGTH = 4000

interface ActiveRequest {
  sessionId: number
  requestId: string
  controller: AbortController
  stopping: boolean
  retryOfRequestId?: string
  confirmAfterStream?: boolean
}

// 做什么：创建一个会话的独立草稿、消息和任务状态
// 入参：会话编号，零表示尚未选中
// 返回：普通状态对象，由页面统一转成响应式
function createConversation(sessionId: number) {
  return {
    sessionId, messages: [] as ChatMessage[], draft: '', error: '', contextNotice: '',
    references: [] as ChatReference[], referencesRequestId: '',
    historyPage: FIRST_PAGE, historyTotal: 0, historyVersion: 0,
    loadingHistory: false, syncingHistory: false, historySyncError: '', sending: false, active: null as ActiveRequest | null,
    ...createRecoveryState(),
  }
}

export type ConversationState = ReturnType<typeof createConversation>

// 做什么：建立页面状态，每个会话拥有独立任务，当前会话只是展示入口
// 入参：无
// 返回：响应式状态，不发请求
function createChatState() {
  // 新手注意：会话状态像多个工作台，切换只是换座位，其他桌上的任务继续执行。
  return reactive({
    sessions: [] as ChatSession[], selectedId: 0,
    conversations: {} as Record<number, ConversationState>, current: createConversation(0),
    sessionPage: FIRST_PAGE, sessionTotal: 0, loading: false, creating: false,
    disposed: false, accountToken: getToken(), unauthorized: false, accountChanged: false,
    tabSync: null as ChatTabSync | null,
  })
}

export type ChatState = ReturnType<typeof createChatState>

// 做什么：确认异步响应仍属于当前页面和账号
// 入参：页面状态
// 返回：页面未销毁且账号未变化时返回 true
function pageIsCurrent(state: ChatState): boolean {
  return !state.disposed && state.accountToken === getToken()
}

// 做什么：展示请求错误并区分登录失效，后台错误只写回所属会话
// 入参：页面状态、异常和所属会话
// 返回：无；401 标记退出，其余错误留在对应会话
function recordError(state: ChatState, error: unknown, conversation = state.current): void {
  if (!pageIsCurrent(state)) return
  const status = error instanceof ChatRequestError ? error.status : (error as AxiosError)?.response?.status
  state.unauthorized = status === 401 || state.unauthorized
  conversation.error = error instanceof Error ? error.message : '操作失败，请稍后重试'
}

// 做什么：读取会话列表，下一页时追加，刷新时替换
// 入参：页面状态和是否追加
// 返回：无；失败显示错误，过期账号响应被忽略
async function loadSessions(state: ChatState, append = false): Promise<void> {
  if (state.loading) return
  state.loading = true
  const page = append ? state.sessionPage + 1 : FIRST_PAGE
  try {
    const result = await getChatSessions(page)
    if (!pageIsCurrent(state)) return
    const knownIds = new Set(state.sessions.map((session) => session.id))
    const additional = result.items.filter((session) => !knownIds.has(session.id))
    state.sessions = append ? [...state.sessions, ...additional] : result.items
    state.sessionTotal = result.total
    state.sessionPage = page
  } catch (error) {
    recordError(state, error)
  } finally {
    state.loading = false
  }
}

// 做什么：读取所属会话历史，完成后的后台校准不禁用输入
// 入参：页面状态、所属会话和分页/后台选项
// 返回：读取结束；账号、版本检查和错误展示由统一历史模块处理
async function loadConversationHistory(state: ChatState, conversation: ConversationState, older = false, background = false): Promise<void> {
  await refreshConversationHistory(conversation, pageIsCurrent.bind(null, state),
    (error) => recordError(state, error, conversation), older, background)
}

// 做什么：为当前会话加载历史，生成过程中保留本地实时正文
// 入参：页面状态和是否加载更早消息
// 返回：无；无会话或正在生成时不发请求
async function loadHistory(state: ChatState, older = false): Promise<void> {
  if (!state.selectedId || state.current.sending || state.current.pendingRequestId || state.current.confirming) return
  await loadConversationHistory(state, state.current, older)
}

// 做什么：找到本次请求对应的助手消息
// 入参：所属会话和请求编号
// 返回：助手消息；不存在时返回 undefined
function findAssistant(conversation: ConversationState, requestId: string): ChatMessage | undefined {
  return conversation.messages.find((message) => message.request_id === requestId && message.role === 'assistant')
}

// 做什么：停止指定会话的生成，其他会话继续执行
// 入参：页面状态和所属会话，默认当前会话
// 返回：无；通知失败保留提示，断线清理和到期恢复兜底
async function stopGeneration(state: ChatState, conversation = state.current): Promise<void> {
  if (state.accountToken !== getToken()) {
    conversation.active?.controller.abort()
    return
  }
  conversation.recoveryController?.abort()
  restorePendingControl(conversation)
  const active = conversation.active
  if (!active || active.stopping) return
  active.stopping = true
  active.controller.abort()
  const assistant = findAssistant(conversation, active.requestId)
  if (assistant?.status === 'generating') assistant.status = 'interrupted'
  try {
    await interruptChat(active.sessionId, active.requestId)
    state.tabSync?.notify(active.sessionId, active.requestId)
  } catch (error) {
    recordError(state, error, conversation)
  } finally {
    if (conversation.active?.requestId === active.requestId) {
      conversation.active = null
      conversation.sending = false
    }
    if (pageIsCurrent(state)) await loadConversationHistory(state, conversation)
  }
}

// 做什么：停止按钮只操作点击时选中的会话，忽略界面事件参数
// 入参：页面状态
// 返回：停止请求的完成结果；错误由停止流程展示
async function stopCurrentGeneration(state: ChatState): Promise<void> {
  await stopGeneration(state, state.current)
}

// 做什么：切换展示会话，原会话的生成、草稿和错误均保留
// 入参：页面状态和目标会话编号
// 返回：无；生成中会话直接展示本地实时正文
async function selectSession(state: ChatState, sessionId: number): Promise<void> {
  if (!pageIsCurrent(state) || state.selectedId === sessionId) return
  if (!state.conversations[sessionId]) state.conversations[sessionId] = createConversation(sessionId)
  state.selectedId = sessionId
  state.current = state.conversations[sessionId]!
  if (!state.current.sending) await loadHistory(state)
  void state.tabSync?.refresh()
}

// 做什么：创建独立上下文的新会话，不中断其他任务
// 入参：页面状态
// 返回：无；失败显示错误且允许再次操作
async function newSession(state: ChatState): Promise<void> {
  if (state.creating || state.loading) return
  state.creating = true
  try {
    const session = await createChatSession()
    if (!pageIsCurrent(state)) return
    state.sessions.unshift(session)
    state.sessionTotal += 1
    state.tabSync?.notify(session.id, null)
    await selectSession(state, session.id)
  } catch (error) {
    recordError(state, error)
  } finally {
    state.creating = false
  }
}

// 做什么：把展示位退回空态，不新建服务端会话
// 入参：页面状态
// 返回：无；已选会话编号归零
function resetWorkspace(state: ChatState): void {
  state.selectedId = 0
  state.current = createConversation(0)
}

// 做什么：判断一条会话是否正在生成，本页任务先判，服务端占用兜底
// 入参：页面状态和会话编号
// 返回：发送中或仍持有活动请求时返回 true
function sessionIsBusy(state: ChatState, sessionId: number): boolean {
  const conversation = state.conversations[sessionId]
  const listed = state.sessions.find((session) => session.id === sessionId)
  return Boolean(conversation?.sending || conversation?.active || listed?.active_request_id)
}

// 做什么：永久删除一条会话，生成中拒绝；删除当前会话后自动切到相邻一条
// 入参：页面状态和会话编号
// 返回：删除成功返回 true；生成中或接口失败返回 false
async function deleteSession(state: ChatState, sessionId: number): Promise<boolean> {
  if (!pageIsCurrent(state) || sessionId <= 0 || sessionIsBusy(state, sessionId)) return false
  try {
    await deleteChatSession(sessionId)
  } catch (error) {
    recordError(state, error)
    return false
  }
  if (!pageIsCurrent(state)) return true
  delete state.conversations[sessionId]
  const index = state.sessions.findIndex((session) => session.id === sessionId)
  state.sessions = state.sessions.filter((session) => session.id !== sessionId)
  state.sessionTotal = Math.max(0, state.sessionTotal - 1)
  if (state.selectedId === sessionId) {
    // 新手注意：优先落到原来的下一条，没有就取新的最后一条，避免删完停在空白但地址栏还挂着旧编号
    const next = state.sessions[Math.min(index, state.sessions.length - 1)]
    if (next) await selectSession(state, next.id)
    else resetWorkspace(state)
  }
  void loadSessions(state)
  return true
}

// 做什么：一次性清空全部会话，任一条在生成时整批拒绝
// 入参：页面状态
// 返回：清空成功返回 true；有生成任务或接口失败返回 false
async function clearSessions(state: ChatState): Promise<boolean> {
  if (!pageIsCurrent(state)) return false
  const busy = state.sessions.some((session) => session.active_request_id)
    || Object.values(state.conversations).some((conversation) => conversation.sending || conversation.active)
  if (busy) return false
  try {
    await clearChatSessions()
  } catch (error) {
    recordError(state, error)
    return false
  }
  if (!pageIsCurrent(state)) return true
  state.conversations = {}
  state.sessions = []
  state.sessionTotal = 0
  state.sessionPage = FIRST_PAGE
  resetWorkspace(state)
  return true
}

// 做什么：立即展示本轮问题和助手占位
// 入参：所属会话、请求编号和问题
// 返回：无；临时编号由后续历史校准
function appendPendingMessages(conversation: ConversationState, requestId: string, content: string): void {
  const createdAt = new Date().toISOString()
  const common = { request_id: requestId, model: null, finish_reason: null, error_code: null, created_at: createdAt }
  conversation.messages.push({ ...common, id: -Date.now(), role: 'user', content, status: 'completed' })
  conversation.messages.push({ ...common, id: -Date.now() - 1, role: 'assistant', content: '', status: 'generating' })
  conversation.historyTotal += 2
}

// 做什么：将流事件写入所属会话，后台事件不能污染当前展示会话
// 入参：页面状态、所属会话、活动请求和事件
// 返回：无；旧账号、旧请求或已取消任务的事件被忽略
function applyEvent(state: ChatState, conversation: ConversationState, active: ActiveRequest, event: ChatEvent): void {
  if (!pageIsCurrent(state) || conversation.active?.requestId !== active.requestId || active.controller.signal.aborted) return
  const assistant = findAssistant(conversation, active.requestId)
  if (!assistant) return
  if (event.event === 'context') conversation.contextNotice = event.payload.message
  if (event.event === 'references') {
    conversation.references = event.payload.items
    conversation.referencesRequestId = active.requestId
  }
  if (event.event === 'started') {
    assistant.id = event.payload.assistant_id
    state.tabSync?.notify(conversation.sessionId, active.requestId)
  }
  if (event.event === 'delta') assistant.content += event.payload.content
  if (event.event === 'completed') {
    assistant.status = 'completed'
    assistant.finish_reason = event.payload.finish_reason
  }
  if (event.event === 'error') {
    assistant.status = 'failed'
    conversation.error = event.payload.message
    active.confirmAfterStream = event.payload.code === 5000
    const question = conversation.messages.find((message) => message.request_id === active.requestId && message.role === 'user')
    if (question && !conversation.draft) conversation.draft = question.content
  }
  if (event.event === 'interrupted') assistant.status = 'interrupted'
}

// 做什么：执行一个会话的流式请求，错误不影响其他会话
// 入参：页面状态、所属会话、活动请求和问题
// 返回：无；网络异常中断该请求，取消不作为普通失败展示
async function runRequest(state: ChatState, conversation: ConversationState, active: ActiveRequest, content: string): Promise<void> {
  try {
    await streamChat(active.sessionId, active.requestId, content, active.controller.signal,
      applyEvent.bind(null, state, conversation, active), active.retryOfRequestId)
    if (active.confirmAfterStream) await recoverConversation(state, conversation, active.requestId)
  } catch (error) {
    if (active.controller.signal.aborted) return
    recordError(state, error, conversation)
    if (submissionWasRejected(error)) {
      restoreDraft(conversation, content)
      discardRejectedTurn(conversation, active.requestId)
      return
    }
    conversation.ownsPendingRequest = true
    await recoverConversation(state, conversation, active.requestId)
  }
}

// 做什么：流结束后只清理本请求，并从 MySQL 校准所属会话
// 入参：页面状态、所属会话和活动请求
// 返回：无；停止通知尚未确认时由停止流程负责校准
async function finishRequest(state: ChatState, conversation: ConversationState, active: ActiveRequest): Promise<void> {
  if (active.stopping || conversation.active?.requestId !== active.requestId) return
  conversation.active = null
  conversation.sending = false
  if (!pageIsCurrent(state)) return
  state.tabSync?.notify(conversation.sessionId, active.requestId)
  if (!conversation.pendingRequestId && conversation.recoveredRequestId !== active.requestId) await loadConversationHistory(state, conversation, false, true)
  await loadSessions(state)
}

// 做什么：发送当前会话的问题，其他会话可以同时发送
// 入参：页面状态
// 返回：无；同会话生成中、停止中或读取历史时不重复发送
async function sendConversation(state: ChatState, conversation: ConversationState, content: string, retryOfRequestId?: string): Promise<void> {
  if (!pageIsCurrent(state) || !conversation.sessionId || conversation.sending || conversation.loadingHistory || conversation.confirming || conversation.pendingRequestId) return
  if (!content || content.length > MAX_INPUT_LENGTH) return
  const active = { sessionId: conversation.sessionId, requestId: crypto.randomUUID(), controller: new AbortController(), stopping: false, retryOfRequestId }
  conversation.active = active
  invalidateHistorySync(conversation)
  conversation.sending = true
  conversation.ownsPendingRequest = true
  conversation.error = ''
  conversation.contextNotice = ''
  Object.assign(conversation, { references: [], referencesRequestId: '' })
  if (!retryOfRequestId || conversation.draft === content) conversation.draft = ''
  appendPendingMessages(conversation, active.requestId, content)
  try {
    await runRequest(state, conversation, active, content)
  } finally {
    await finishRequest(state, conversation, active)
  }
}

// 做什么：发送当前会话经过表单校验的问题
// 入参：页面状态
// 返回：流结束；忙、确认中或结果未知时不发送
async function sendMessage(state: ChatState): Promise<void> {
  await sendConversation(state, state.current, state.current.draft.trim())
}

// 做什么：将原请求结果恢复到所属会话，不重复调用模型
// 入参：页面状态、所属会话和原请求编号
// 返回：确认流程结束；结果未知时保留查询入口
async function recoverConversation(state: ChatState, conversation: ConversationState, requestId: string): Promise<void> {
  invalidateHistorySync(conversation)
  await confirmRequest(conversation, requestId, pageIsCurrent.bind(null, state),
    (error) => recordError(state, error, conversation))
}

// 做什么：用户主动再次查询当前会话尚未确认的请求
// 入参：页面状态
// 返回：本轮有限查询结束，不触发重新生成
async function checkResult(state: ChatState): Promise<void> {
  const conversation = state.current
  if (conversation.pendingRequestId) await recoverConversation(state, conversation, conversation.pendingRequestId)
}

// 做什么：查询最近失败问题的当前资格，再创建新请求重试
// 入参：页面状态和页面候选请求编号
// 返回：流结束；过期候选、重复点击或未知结果不创建生成
async function retryRequest(state: ChatState, requestId: string): Promise<void> {
  const conversation = state.current
  if (conversation.sending || conversation.confirming || conversation.pendingRequestId || conversation.loadingHistory) return
  if (latestRetryRequestId(conversation) !== requestId) return
  invalidateHistorySync(conversation)
  const result = await validateManualRetry(conversation, requestId, pageIsCurrent.bind(null, state),
    (error) => recordError(state, error, conversation))
  if (result) await sendConversation(state, conversation, result.question.content, requestId)
}

// 做什么：用户主动重新校准已保存历史，不生成新回答
// 入参：页面状态
// 返回：本次校准结束；生成中、未知或重复校准时不发请求
async function syncHistory(state: ChatState): Promise<void> {
  const conversation = state.current
  if (conversation.sending || conversation.confirming || conversation.pendingRequestId || conversation.loadingHistory || conversation.syncingHistory) return
  await loadConversationHistory(state, conversation, false, true)
}

// 做什么：明确拒绝接收时恢复问题，不覆盖已有未发送草稿
// 入参：所属会话和本轮问题
// 返回：无；已有草稿时保持原值
function restoreDraft(conversation: ConversationState, content: string): void {
  if (!conversation.draft) conversation.draft = content
}

// 做什么：离开页面时也能中断本页面发起但结果未知的原请求
// 入参：所属会话
// 返回：无；不接管其他页面或标签页发起的任务
function restorePendingControl(conversation: ConversationState): void {
  if (conversation.active || !conversation.ownsPendingRequest || !conversation.pendingRequestId) return
  conversation.active = { sessionId: conversation.sessionId, requestId: conversation.pendingRequestId,
    controller: new AbortController(), stopping: false }
}

// 做什么：恢复指定会话或选中最近会话
// 入参：页面状态和地址栏会话编号
// 返回：无；无历史时展示新建入口
async function initialize(state: ChatState, initialSessionId: number): Promise<void> {
  await loadSessions(state)
  if (!pageIsCurrent(state) || state.unauthorized) return
  const selectedId = initialSessionId || state.sessions[0]?.id
  if (selectedId) await selectSession(state, selectedId)
}

// 做什么：页面销毁时立即中断所有会话任务，不等待浏览器卸载
// 入参：页面状态
// 返回：无；可重复调用，停止流程保留异常处理
function dispose(state: ChatState): void {
  if (state.disposed) return
  state.tabSync?.close()
  state.tabSync = null
  state.disposed = true
  stopAllGenerations(state)
}

// 做什么：浏览器离开时中断本页面全部任务，保留后退缓存恢复能力
// 入参：页面状态
// 返回：无；各会话分别处理停止失败
function stopAllGenerations(state: ChatState): void {
  for (const conversation of Object.values(state.conversations)) void stopGeneration(state, conversation)
}

// 做什么：向视图提供页面状态和操作
// 入参：地址栏恢复用的初始会话编号
// 返回：状态及操作，不持久化浏览器聊天记录
export function useChat(initialSessionId: number) {
  const state = createChatState()
  return {
    state, initialize: initialize.bind(null, state, initialSessionId),
    newSession: newSession.bind(null, state), selectSession: selectSession.bind(null, state),
    deleteSession: deleteSession.bind(null, state), clearSessions: clearSessions.bind(null, state),
    loadSessions: loadSessions.bind(null, state), loadHistory: loadHistory.bind(null, state),
    sendMessage: sendMessage.bind(null, state), stopGeneration: stopCurrentGeneration.bind(null, state),
    checkResult: checkResult.bind(null, state), retryRequest: retryRequest.bind(null, state),
    syncHistory: syncHistory.bind(null, state),
    // 做什么：将所选知识库保存到当前会话
    // 入参：知识库编号；null 表示清除
    // 返回：保存完成；失败交给页面
    updateKnowledgeBase: (knowledgeBaseId: number | null) => updateKnowledgeBase(state, knowledgeBaseId, pageIsCurrent.bind(null, state)),
    startTabSync: connectChatTabs.bind(null, state, loadSessions.bind(null, state)),
    // 做什么：主动请求当前页面状态校准
    // 入参：无
    // 返回：校准完成；未启用观察时无操作
    refreshTabs: () => state.tabSync?.refresh(),
    stopAllGenerations: stopAllGenerations.bind(null, state),
    dispose: dispose.bind(null, state),
  }
}
