/** 原请求结果确认：只查询，不自动重新生成。 */
import { ChatRequestError, getChatRequest } from '@/api/chat'
import type { ChatMessage, ChatRequestResult } from '@/types/chat'

const CONFIRMATION_ATTEMPTS = 4
const CONFIRMATION_INTERVAL_MILLISECONDS = 1000
const UNKNOWN_RESULT_MESSAGE = '结果尚未确认，请再次查询结果；系统不会自动重新生成。'
// 仅项目明确在创建轮次前抛出的业务错误，不能把代理的 HTTP 4xx 一概视为未接收。
const REJECTED_SUBMISSION_CODES = new Set([1000, 1002, 1003, 1004, 2001, 3001, 3002, 3004, 3005, 3006, 3007, 5002, 5011, 5012])

// 做什么：创建每个会话独立的结果确认状态
// 入参：无
// 返回：状态对象，不创建定时器或网络请求
export function createRecoveryState() {
  return {
    confirming: false, pendingRequestId: null as string | null,
    recoveryController: null as AbortController | null, recoveredRequestId: null as string | null,
    ownsPendingRequest: false,
    remoteRequestId: null as string | null, serverHistoryVersion: 0, remoteSyncError: '',
  }
}

export interface RecoveryConversation extends ReturnType<typeof createRecoveryState> {
  sessionId: number
  messages: ChatMessage[]
  draft: string
  error: string
  historyTotal: number
}

// 做什么：区分明确拒绝接收与结果不确定的错误
// 入参：流式发送抛出的异常
// 返回：明确拒绝返回 true；重复编号及网络、服务端错误需要查询原结果
export function submissionWasRejected(error: unknown): boolean {
  return error instanceof ChatRequestError && error.code !== undefined && REJECTED_SUBMISSION_CODES.has(error.code)
}

// 做什么：用服务端该轮结果替换本地占位，保留其他轮次
// 入参：所属会话和服务端结果
// 返回：结果已终结返回 true，仍生成时返回 false
export function applyRequestResult(conversation: RecoveryConversation, result: ChatRequestResult): boolean {
  if (typeof result.history_version === 'number' && result.history_version < conversation.serverHistoryVersion) return false
  if (typeof result.history_version === 'number') conversation.serverHistoryVersion = result.history_version
  const previousPosition = conversation.messages.findIndex((message) => message.request_id === result.request_id)
  const previous = conversation.messages.filter((message) => message.request_id !== result.request_id)
  const insertionPosition = previousPosition < 0 ? previous.length : Math.min(previousPosition, previous.length)
  // 尚未校准的用户消息带临时负编号，按编号排序会拆散多轮问答。
  previous.splice(insertionPosition, 0, result.question, result.answer)
  conversation.messages = previous
  if (result.answer.status === 'generating') {
    if (!conversation.ownsPendingRequest) conversation.remoteRequestId = result.active_request_id ?? result.request_id
    return false
  }
  conversation.pendingRequestId = null
  conversation.ownsPendingRequest = false
  conversation.recoveredRequestId = result.request_id
  conversation.error = result.answer.status === 'completed' ? '' : '该次生成已失败或中断，可手动重试最近的问题。'
  if (result.answer.status === 'completed' && conversation.draft === result.question.content) conversation.draft = ''
  if (result.can_retry && !conversation.draft) conversation.draft = result.question.content
  conversation.remoteRequestId = result.active_request_id ?? null
  if (conversation.remoteRequestId) conversation.pendingRequestId = conversation.remoteRequestId
  return true
}

// 做什么：等待下一次查询，页面关闭时立即结束等待
// 入参：本轮结果确认的取消信号
// 返回：等待完成或取消后正常返回，不遗留定时器
async function waitForConfirmation(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    // 做什么：结束一次等待并释放定时器及监听器
    // 入参：无
    // 返回：无；重复调用不改变结果
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, CONFIRMATION_INTERVAL_MILLISECONDS)
    signal.addEventListener('abort', finish, { once: true })
  })
}

// 做什么：查询一次结果，未找到只表示当前尚未查到已提交记录
// 入参：所属会话、请求编号和取消信号
// 返回：结果或暂未查到时的 null；其他错误继续抛出
async function lookupRequest(conversation: RecoveryConversation, requestId: string, signal: AbortSignal): Promise<ChatRequestResult | null> {
  try {
    return await getChatRequest(conversation.sessionId, requestId, signal)
  } catch (error) {
    if (error instanceof ChatRequestError && error.status === 404) return null
    throw error
  }
}

// 做什么：有限确认原请求，生成中和未找到均不触发重新生成
// 入参：所属会话、原请求编号、取消信号和页面有效性检查
// 返回：终结结果返回 true；取消或用尽次数返回 false
async function pollRequest(conversation: RecoveryConversation, requestId: string, signal: AbortSignal,
                           isCurrent: () => boolean): Promise<boolean> {
  for (let attempt = 0; attempt < CONFIRMATION_ATTEMPTS; attempt += 1) {
    if (signal.aborted || !isCurrent()) return false
    const result = await lookupRequest(conversation, requestId, signal)
    if (signal.aborted || !isCurrent()) return false
    if (result && result.request_id !== requestId) throw new Error('请求结果编号不一致')
    if (result && applyRequestResult(conversation, result)) return true
    if (attempt + 1 < CONFIRMATION_ATTEMPTS) await waitForConfirmation(signal)
  }
  return false
}

// 做什么：托管会话结果确认，查询失败保留未知状态，允许再次查询
// 入参：所属会话、原请求编号、有效性检查和错误报告回调
// 返回：是否获得终结结果；错误或取消不会自动重新发送
export async function confirmRequest(conversation: RecoveryConversation, requestId: string, isCurrent: () => boolean,
                                     reportError: (error: unknown) => void): Promise<boolean> {
  if (conversation.confirming || !isCurrent()) return false
  const controller = new AbortController()
  conversation.recoveryController = controller
  conversation.pendingRequestId = requestId
  conversation.confirming = true
  try {
    const confirmed = await pollRequest(conversation, requestId, controller.signal, isCurrent)
    if (!confirmed && !controller.signal.aborted && isCurrent()) conversation.error = UNKNOWN_RESULT_MESSAGE
    return confirmed
  } catch (error) {
    if (!controller.signal.aborted && isCurrent()) {
      reportError(error)
      conversation.error = UNKNOWN_RESULT_MESSAGE
    }
    return false
  } finally {
    conversation.confirming = false
    conversation.recoveryController = null
  }
}

// 做什么：定位已展示历史中最近失败或中断的问题
// 入参：所属会话
// 返回：符合本地候选条件的请求编号；最终资格仍由后端验证
export function latestRetryRequestId(conversation: RecoveryConversation): string | null {
  const latest = conversation.messages.at(-1)
  if (latest?.role !== 'assistant' || !['failed', 'interrupted'].includes(latest.status)) return null
  const question = conversation.messages.find((message) => message.role === 'user' && message.request_id === latest.request_id)
  return question ? latest.request_id : null
}

// 做什么：手动重试前读取最新资格，不把旧状态直接当作重新生成的依据
// 入参：所属会话、候选编号、有效性检查及错误报告回调
// 返回：允许重试的原结果；不符合条件、异常或取消返回 null
export async function validateManualRetry(conversation: RecoveryConversation, requestId: string, isCurrent: () => boolean,
                                          reportError: (error: unknown) => void): Promise<ChatRequestResult | null> {
  if (conversation.confirming || !isCurrent()) return null
  const controller = new AbortController()
  conversation.recoveryController = controller
  conversation.confirming = true
  try {
    const result = await getChatRequest(conversation.sessionId, requestId, controller.signal)
    if (controller.signal.aborted || !isCurrent()) return null
    if (result.request_id !== requestId) throw new Error('请求结果编号不一致')
    applyRequestResult(conversation, result)
    if (result.can_retry) return result
    if (result.answer.status === 'completed') return null
    if (result.answer.status === 'generating') conversation.pendingRequestId = requestId
    conversation.error = '该请求已完成、仍在生成或已不是最近失败问题，请查看最新结果。'
    return null
  } catch (error) {
    if (!controller.signal.aborted && isCurrent()) {
      reportError(error)
      conversation.pendingRequestId = requestId
    }
    return null
  } finally {
    conversation.confirming = false
    conversation.recoveryController = null
  }
}
