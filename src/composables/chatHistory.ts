/** 历史读取与完成后的后台校准；版本变化后旧响应不得覆盖新消息。 */
import type { AxiosError } from 'axios'
import { ChatRequestError, getChatHistory } from '@/api/chat'
import type { ChatHistory } from '@/types/chat'
import type { RecoveryConversation } from '@/composables/chatRecovery'

const FIRST_PAGE = 1
const HISTORY_SYNC_ERROR = '本轮结果已保存，历史暂未同步；可稍后重试同步。'

export interface HistoryConversation extends RecoveryConversation {
  active: { requestId: string } | null
  historyPage: number
  historyVersion: number
  loadingHistory: boolean
  syncingHistory: boolean
  historySyncError: string
}

// 做什么：区分初次加载的阻塞状态与完成后的非阻塞校准
// 入参：所属会话和是否后台读取
// 返回：无；新读取接管加载状态并清除旧同步提示
function beginHistoryRead(conversation: HistoryConversation, background: boolean): void {
  // 新手注意：后台校准像事后核对账单，用户可以继续写下一问，旧账单不能盖住新内容。
  conversation.loadingHistory = !background
  conversation.syncingHistory = background
  conversation.historySyncError = ''
}

// 做什么：从已保存历史标记未知生成占用，或解除已结束轮次的未知状态
// 入参：所属会话
// 返回：无；没有对应结果时不猜测为未接收
function updatePendingFromHistory(conversation: HistoryConversation): void {
  const latest = conversation.messages.at(-1)
  if (latest?.role !== 'assistant') return
  if (!conversation.active && latest.status === 'generating') {
    if (conversation.pendingRequestId !== latest.request_id) conversation.ownsPendingRequest = false
    conversation.pendingRequestId = latest.request_id
  }
  if (latest.request_id === conversation.pendingRequestId && latest.status !== 'generating') conversation.pendingRequestId = null
}

// 做什么：将有效版本的历史应用到所属会话，不修改草稿或生成结果提示
// 入参：所属会话、服务端历史和是否追加较早消息
// 返回：无；调用方必须先验证账号与版本
function applyHistory(conversation: HistoryConversation, result: ChatHistory, older: boolean): void {
  const knownMessages = new Set(conversation.messages.map((message) => `${message.request_id}:${message.role}`))
  const earlier = result.items.filter((message) => !knownMessages.has(`${message.request_id}:${message.role}`))
  conversation.messages = older ? [...earlier, ...conversation.messages] : result.items
  conversation.historyTotal = result.total
  conversation.historyPage = result.page ?? FIRST_PAGE
  if (typeof result.session?.history_version === 'number') conversation.serverHistoryVersion = result.session.history_version
  updatePendingFromHistory(conversation)
}

// 做什么：历史校准失败只影响同步提示，身份失效仍交给原登录处理
// 入参：所属会话、异常、是否后台校准及错误报告回调
// 返回：无；不把完成消息改成失败，不清除用户输入
function reportHistoryError(conversation: HistoryConversation, error: unknown, background: boolean,
                            reportError: (error: unknown) => void): void {
  if (!background) {
    reportError(error)
    return
  }
  conversation.historySyncError = HISTORY_SYNC_ERROR
  const status = error instanceof ChatRequestError ? error.status : (error as AxiosError)?.response?.status
  if (status === 401) reportError(error)
}

// 做什么：读取历史，只有账号和读取版本仍有效时才写回
// 入参：所属会话、有效性检查、错误回调及分页/后台选项
// 返回：读取结束；后台失败独立提示，迟到响应直接忽略
export async function refreshConversationHistory(conversation: HistoryConversation, isCurrent: () => boolean,
                                                 reportError: (error: unknown) => void, older = false, background = false): Promise<void> {
  const version = ++conversation.historyVersion
  const page = older ? conversation.historyPage + 1 : FIRST_PAGE
  beginHistoryRead(conversation, background)
  try {
    const result = await getChatHistory(conversation.sessionId, page)
    if (!isCurrent() || version !== conversation.historyVersion) return
    if ((result.session?.history_version ?? conversation.serverHistoryVersion) < conversation.serverHistoryVersion) return
    applyHistory(conversation, { ...result, page }, older)
  } catch (error) {
    if (isCurrent() && version === conversation.historyVersion) reportHistoryError(conversation, error, background, reportError)
  } finally {
    if (version === conversation.historyVersion) {
      conversation.loadingHistory = false
      conversation.syncingHistory = false
    }
  }
}

// 做什么：新生成或主动结果查询接管状态，使旧历史响应失效
// 入参：所属会话
// 返回：无；清除旧校准状态，但不修改任何消息或草稿
export function invalidateHistorySync(conversation: HistoryConversation): void {
  conversation.historyVersion += 1
  conversation.syncingHistory = false
  conversation.historySyncError = ''
}

// 做什么：明确拒绝接收后删除本地临时轮次，不等待历史查询
// 入参：所属会话和被拒绝的新请求编号
// 返回：无；原有已保存轮次不受影响
export function discardRejectedTurn(conversation: HistoryConversation, requestId: string): void {
  const remaining = conversation.messages.filter((message) => message.request_id !== requestId)
  const removedCount = conversation.messages.length - remaining.length
  conversation.messages = remaining
  conversation.historyTotal = Math.max(0, conversation.historyTotal - removedCount)
}
