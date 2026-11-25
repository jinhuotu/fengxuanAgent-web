import type { ChatMessage, ChatReference } from '@/types/chat'

// 做什么：为助手消息选择它这一轮的参考资料
// 入参：当前消息、实时引用和实时请求编号
// 返回：优先返回历史快照，其次返回同轮的实时引用，否则返回空列表
export function resolveMessageReferences(
  message: ChatMessage, liveReferences: ChatReference[], liveRequestId: string,
): ChatReference[] {
  if (message.role !== 'assistant') return []
  if (message.references?.length) return message.references
  return message.request_id === liveRequestId ? liveReferences : []
}
