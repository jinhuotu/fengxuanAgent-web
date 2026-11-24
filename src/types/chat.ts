/** AI 对话的公开类型；与后端 schemas/chat.py 对齐。 */
export type ChatRole = 'user' | 'assistant'
export type ChatStatus = 'generating' | 'completed' | 'failed' | 'interrupted'

export interface ChatSession {
  id: number
  title: string
  created_at: string
  updated_at: string
  history_version: number
  active_request_id: string | null
  generation_expires_at: string | null
}

export interface ChatMessage {
  id: number
  request_id: string
  role: ChatRole
  content: string
  status: ChatStatus
  model: string | null
  finish_reason: string | null
  error_code: string | null
  created_at: string
}

export interface ChatPage<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface ChatHistory extends ChatPage<ChatMessage> {
  session: ChatSession
}

export interface ChatRequestResult {
  request_id: string
  question: ChatMessage
  answer: ChatMessage
  session_busy: boolean
  can_retry: boolean
  history_version: number
  active_request_id: string | null
}

export type ChatEvent =
  | { event: 'context'; payload: { message: string; retained_rounds: number; latest_round_omitted: boolean } }
  | { event: 'started'; payload: { request_id: string; assistant_id: number } }
  | { event: 'delta'; payload: { content: string } }
  | { event: 'completed'; payload: { assistant_id: number; finish_reason: string } }
  | { event: 'error'; payload: { code: number; message: string } }
  | { event: 'interrupted'; payload: { message: string } }
  | { event: 'ping'; payload: Record<string, never> }

