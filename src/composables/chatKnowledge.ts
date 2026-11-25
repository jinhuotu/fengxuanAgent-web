/** 只把保存成功的选库结果写回所属会话。 */
import { updateSessionKnowledgeBase } from '@/api/knowledge'
import type { ChatState } from '@/composables/useChat'

// 做什么：保存选库并就地更新原请求对应的会话
// 入参：页面状态、新库编号和页面身份检查函数
// 返回：保存完成；失败直接抛出，过期账号和页面响应不写回
export async function updateKnowledgeBase(
  state: ChatState, knowledgeBaseId: number | null, pageIsCurrent: () => boolean,
): Promise<void> {
  const sessionId = state.selectedId
  if (!pageIsCurrent() || !state.sessions.some((session) => session.id === sessionId)) return
  const savedSession = await updateSessionKnowledgeBase(sessionId, knowledgeBaseId)
  if (!pageIsCurrent()) return
  // 列表可能在请求期间被替换，也可能已经切换到别的会话。
  const session = state.sessions.find((item) => item.id === sessionId)
  if (session) session.knowledge_base_id = savedSession.knowledge_base_id
}
