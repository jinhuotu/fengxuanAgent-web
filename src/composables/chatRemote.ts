/** 其他页面任务的只读观察，唯一来源是本人服务器状态，不创建或停止任务。 */
import type { AxiosError } from 'axios'
import { ChatRequestError, getChatRequest, getChatSessionState } from '@/api/chat'
import type { ChatState, ConversationState } from '@/composables/useChat'
import { applyRequestResult, confirmRequest } from '@/composables/chatRecovery'
import { refreshConversationHistory } from '@/composables/chatHistory'

// 做什么：报告远端观察故障，不覆盖本地生成的成功或失败结果
// 入参：页面状态、异常及所属会话
// 返回：无；401 仍触发既有重新登录处理
export function reportRemoteError(state: ChatState, error: unknown, conversation = state.current): void {
  conversation.remoteSyncError = '暂时无法同步其他页面状态，可稍后再次同步。'
  const status = error instanceof ChatRequestError ? error.status : (error as AxiosError)?.response?.status
  if (status === 401) state.unauthorized = true
}

// 做什么：确认观察响应仍属于当前选中会话且没有被本地操作接管
// 入参：页面、所属会话、读取版本、取消信号及账号检查
// 返回：只有未取消、未切换、未启动本地请求时才允许写回
function canApplyRemote(state: ChatState, conversation: ConversationState, version: number, signal: AbortSignal,
                        isCurrent: () => boolean): boolean {
  return isCurrent() && !signal.aborted && state.current === conversation && !conversation.active &&
    !conversation.confirming && conversation.historyVersion === version
}

// 做什么：只读取远端活动请求的已保存进度，不接管 SSE 或停止权限
// 入参：页面、所属会话、目标编号、读取版本、信号及账号检查
// 返回：查询结束；迟到响应忽略，草稿和本地错误不被观察操作修改
async function observeRequest(state: ChatState, conversation: ConversationState, requestId: string, version: number,
                              signal: AbortSignal, isCurrent: () => boolean): Promise<void> {
  const result = await getChatRequest(conversation.sessionId, requestId, signal)
  if (!canApplyRemote(state, conversation, version, signal, isCurrent) || result.request_id !== requestId) return
  if (result.history_version < conversation.serverHistoryVersion) return
  const draft = conversation.draft
  const error = conversation.error
  conversation.ownsPendingRequest = false
  applyRequestResult(conversation, result)
  conversation.draft = draft
  conversation.error = error
  conversation.remoteRequestId = result.active_request_id ?? null
  conversation.pendingRequestId = conversation.remoteRequestId
  conversation.remoteSyncError = ''
  if (result.answer.status !== 'generating' && !conversation.remoteRequestId) {
    await refreshConversationHistory(conversation, isCurrent,
      (error) => reportRemoteError(state, error, conversation), false, true)
  }
}

// 做什么：远端已经空闲时刷新变更历史，不清除本页仍在确认的任务
// 入参：页面、所属会话、服务器版本及账号检查
// 返回：需要时完成后台历史校准，不触发模型生成
async function reconcileIdle(state: ChatState, conversation: ConversationState, serverVersion: number,
                             isCurrent: () => boolean): Promise<void> {
  const changed = serverVersion > conversation.serverHistoryVersion || Boolean(conversation.remoteRequestId || conversation.pendingRequestId)
  conversation.serverHistoryVersion = serverVersion
  conversation.remoteRequestId = null
  conversation.pendingRequestId = null
  conversation.ownsPendingRequest = false
  conversation.remoteSyncError = ''
  if (changed) await refreshConversationHistory(conversation, isCurrent,
    (error) => reportRemoteError(state, error, conversation), false, true)
}

// 做什么：主动校准本页未知请求，并将观察取消传递给本次有限确认
// 入参：页面、所属会话、观察信号及有效性检查
// 返回：确认结束；不取消其他后来发起的确认或本地 SSE
async function confirmOwnedRequest(state: ChatState, conversation: ConversationState, signal: AbortSignal,
                                   isCurrent: () => boolean): Promise<void> {
  const confirmation = confirmRequest(conversation, conversation.pendingRequestId!, isCurrent,
    (error) => reportRemoteError(state, error, conversation))
  const controller = conversation.recoveryController
  // 做什么：取消本轮确认控制器
  // 入参：无
  // 返回：无；不接管后来创建的其他控制器
  const cancel = () => controller?.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  try {
    await confirmation
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}

// 做什么：校准选中会话，保护本地流，只在主动校准时确认本页未知结果
// 入参：页面状态、观察信号、有效性检查和是否主动校准
// 返回：本轮状态查询结束，不接管其他页面任务
export async function reconcileSelectedSession(state: ChatState, signal: AbortSignal, isCurrent: () => boolean,
                                               checkOwned: boolean): Promise<void> {
  const conversation = state.current
  if (!state.selectedId || conversation.active || conversation.confirming || conversation.loadingHistory || conversation.syncingHistory) return
  if (conversation.pendingRequestId && conversation.ownsPendingRequest) {
    if (checkOwned) await confirmOwnedRequest(state, conversation, signal, isCurrent)
    return
  }
  const version = conversation.historyVersion
  const session = await getChatSessionState(conversation.sessionId, signal)
  if (!canApplyRemote(state, conversation, version, signal, isCurrent)) return
  if (session.id !== conversation.sessionId || session.history_version < conversation.serverHistoryVersion) return
  if (session.active_request_id) {
    conversation.remoteRequestId = session.active_request_id
    conversation.pendingRequestId = session.active_request_id
    conversation.ownsPendingRequest = false
    conversation.serverHistoryVersion = session.history_version
    await observeRequest(state, conversation, session.active_request_id, version, signal, isCurrent)
    return
  }
  await reconcileIdle(state, conversation, session.history_version, isCurrent)
}
