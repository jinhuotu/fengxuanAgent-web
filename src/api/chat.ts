/** 普通接口复用 axios；流式 POST 通过 fetch 读取响应正文。 */
import http from '@/api/http'
import type { ApiResponse } from '@/types/api'
import type { ChatClearResult, ChatDeleteResult, ChatEvent, ChatHistory, ChatPage, ChatSession, ChatRequestResult } from '@/types/chat'
import { createEventDecoder } from '@/utils/chatStream'
import { getToken } from '@/utils/token'

const CHAT_SESSIONS_PATH = '/chat/sessions'
const API_PREFIX = '/api'
const PAGE_SIZE = 20
const STREAM_TIMEOUT_MILLISECONDS = 90000
const RESULT_TIMEOUT_MILLISECONDS = 10000

export class ChatRequestError extends Error {
  status: number
  code?: number

  // 做什么：保留错误的 HTTP 状态，供页面区分登录失效
  // 入参：安全错误提示和 HTTP 状态
  // 返回：错误对象，不保存请求凭证
  constructor(message: string, status: number, code?: number) {
    super(message)
    this.status = status
    this.code = code
  }
}

// 做什么：创建本人新会话
// 入参：无，凭证由统一请求封装提供
// 返回：新会话；错误由拦截器提示并抛出
export async function createChatSession(): Promise<ChatSession> {
  const response = await http.post<ApiResponse<ChatSession>>(CHAT_SESSIONS_PATH)
  return response.data.data
}

// 做什么：分页读取本人的会话列表
// 入参：页码，从一开始
// 返回：会话分页；错误由拦截器提示并抛出
export async function getChatSessions(page: number): Promise<ChatPage<ChatSession>> {
  const response = await http.get<ApiResponse<ChatPage<ChatSession>>>(CHAT_SESSIONS_PATH, { params: { page, page_size: PAGE_SIZE } })
  return response.data.data
}

// 做什么：永久删除本人一条会话，生成中的会话由后端拒绝
// 入参：会话编号
// 返回：删除结果；409 表示正在生成，404 表示已不存在
export async function deleteChatSession(sessionId: number): Promise<ChatDeleteResult> {
  const response = await http.delete<ApiResponse<ChatDeleteResult>>(`${CHAT_SESSIONS_PATH}/${sessionId}`)
  return response.data.data
}

// 做什么：一次性清空本人全部会话，任一条在生成时整批拒绝
// 入参：无
// 返回：删除的会话与消息条数
export async function clearChatSessions(): Promise<ChatClearResult> {
  const response = await http.delete<ApiResponse<ChatClearResult>>(CHAT_SESSIONS_PATH)
  return response.data.data
}

// 做什么：分页读取本人会话的历史，第一页是最新消息
// 入参：会话编号和页码
// 返回：按时间正序排列的当前页消息；失败抛异常
export async function getChatHistory(sessionId: number, page: number): Promise<ChatHistory> {
  const response = await http.get<ApiResponse<ChatHistory>>(`${CHAT_SESSIONS_PATH}/${sessionId}/messages`, { params: { page, page_size: PAGE_SIZE } })
  return response.data.data
}

// 做什么：把普通 HTTP 错误转换成页面可识别的安全异常
// 入参：非成功的 fetch 响应
// 返回：永不正常返回；JSON 不合法时使用通用文案
async function rejectResponse(response: Response): Promise<never> {
  let message = '对话请求失败，请稍后重试'
  let code: number | undefined
  const body: unknown = await response.json().catch(() => null)
  if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string') {
    message = body.message
  }
  if (typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'number') code = body.code
  throw new ChatRequestError(message, response.status, code)
}

// 新手注意：流式像收听广播，一段到达就显示，不必等完整录音。
// 做什么：读取字节流，正确处理跨字节中文和跨网络包 SSE 帧
// 入参：成功响应、取消信号与事件回调
// 返回：完整读取结束；断线、无结束事件或协议错误抛异常
async function readEvents(response: Response, signal: AbortSignal, onEvent: (event: ChatEvent) => void): Promise<void> {
  if (!response.body) throw new Error('当前浏览器无法读取流式响应')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let terminalReceived = false
  const append = createEventDecoder((event) => {
    if (['completed', 'error', 'interrupted'].includes(event.event)) terminalReceived = true
    if (!signal.aborted) onEvent(event)
  })
  try {
    while (!signal.aborted) {
      const chunk = await reader.read()
      if (chunk.done) break
      append(decoder.decode(chunk.value, { stream: true }))
    }
    append(decoder.decode())
    if (!signal.aborted && !terminalReceived) throw new Error('连接已中断，回答未完整生成')
  } finally {
    await reader.cancel().catch(() => undefined) // 网络已关闭时无需再次取消，原读取错误继续抛出。
    reader.releaseLock()
  }
}

// 做什么：发送问题并逐段读取回答，不经过普通 JSON 响应拦截器
// 入参：会话、请求编号、问题、取消信号和事件回调
// 返回：流结束；HTTP 或流错误交给页面统一展示
export async function streamChat(sessionId: number, requestId: string, content: string, signal: AbortSignal,
                                  onEvent: (event: ChatEvent) => void, retryOfRequestId?: string): Promise<void> {
  const streamSignal = AbortSignal.any([signal, AbortSignal.timeout(STREAM_TIMEOUT_MILLISECONDS)])
  const response = await fetch(`${API_PREFIX}${CHAT_SESSIONS_PATH}/${sessionId}/messages`, {
    method: 'POST', signal: streamSignal,
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ request_id: requestId, content, retry_of_request_id: retryOfRequestId }),
  })
  if (!response.ok) await rejectResponse(response)
  if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('服务器未返回流式响应')
  await readEvents(response, streamSignal, onEvent)
}

// 做什么：离开页面时发送短中断通知，keepalive 尽力让页面关闭后的请求完成
// 入参：会话和请求编号
// 返回：通知完成；发送失败抛异常，后端仍通过流断开及过期恢复兜底
export async function interruptChat(sessionId: number, requestId: string): Promise<void> {
  const response = await fetch(`${API_PREFIX}${CHAT_SESSIONS_PATH}/${sessionId}/requests/${requestId}/interrupt`, {
    method: 'POST', keepalive: true, headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!response.ok) await rejectResponse(response)
}

// 做什么：安静查询一轮已提交结果，404 由恢复流程判断，不弹全局提示
// 入参：会话、原请求编号和取消信号
// 返回：已保存结果；HTTP、超时或格式异常抛给调用方，不调用模型
export async function getChatRequest(sessionId: number, requestId: string, signal: AbortSignal): Promise<ChatRequestResult> {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(RESULT_TIMEOUT_MILLISECONDS)])
  const response = await fetch(`${API_PREFIX}${CHAT_SESSIONS_PATH}/${sessionId}/requests/${requestId}`, {
    signal: requestSignal, headers: { Authorization: `Bearer ${getToken()}` }, cache: 'no-store',
  })
  if (!response.ok) await rejectResponse(response)
  const body: ApiResponse<ChatRequestResult> = await response.json()
  return body.data
}

// 做什么：只查询本人会话当前占用与版本，不提交生成或停止请求
// 入参：会话编号和观察取消信号
// 返回：服务端会话状态；异常交给观察流程，避免直接改变生成结果
export async function getChatSessionState(sessionId: number, signal: AbortSignal): Promise<ChatSession> {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(RESULT_TIMEOUT_MILLISECONDS)])
  const response = await fetch(`${API_PREFIX}${CHAT_SESSIONS_PATH}/${sessionId}/state`, {
    signal: requestSignal, headers: { Authorization: `Bearer ${getToken()}` }, cache: 'no-store',
  })
  if (!response.ok) await rejectResponse(response)
  const body: ApiResponse<ChatSession> = await response.json()
  return body.data
}

