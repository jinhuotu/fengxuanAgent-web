/** SSE 解码只处理传输帧；不读取 token，不操作页面。 */
import type { ChatEvent } from '@/types/chat'

const MAX_FRAME_CHARACTERS = 100000

// 做什么：检查未知对象是否为可读取的字典
// 入参：从 JSON 解析得到的未知值
// 返回：普通非空对象返回 true，其他类型返回 false
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 做什么：校验不同 SSE 事件的必要字段
// 入参：事件名称和 JSON 对象
// 返回：合法时转换为事件类型，未知或不合法时抛明确异常
function validatedEvent(event: string, payload: unknown): ChatEvent {
  if (!isRecord(payload)) throw new Error('对话事件格式异常')
  if (event === 'context') return validatedContextNotice(payload)
  if (event === 'ping') return { event, payload: {} }
  if (event === 'delta' && typeof payload.content === 'string') return { event, payload: { content: payload.content } }
  if (event === 'started' && typeof payload.request_id === 'string' && typeof payload.assistant_id === 'number') {
    return { event, payload: { request_id: payload.request_id, assistant_id: payload.assistant_id } }
  }
  if (event === 'completed' && typeof payload.assistant_id === 'number' && typeof payload.finish_reason === 'string') {
    return { event, payload: { assistant_id: payload.assistant_id, finish_reason: payload.finish_reason } }
  }
  if (event === 'interrupted' && typeof payload.message === 'string') return { event, payload: { message: payload.message } }
  if (event === 'error' && typeof payload.code === 'number' && typeof payload.message === 'string') {
    return { event, payload: { code: payload.code, message: payload.message } }
  }
  throw new Error('对话事件格式异常')
}

// 做什么：校验历史裁剪提示，避免坏字段进入当前会话状态
// 入参：未知的上下文提示对象
// 返回：合法提示事件；字段缺失或矛盾时抛协议错误
function validatedContextNotice(payload: Record<string, unknown>): ChatEvent {
  if (typeof payload.message !== 'string' || typeof payload.retained_rounds !== 'number' ||
      !Number.isInteger(payload.retained_rounds) || payload.retained_rounds < 0 || typeof payload.latest_round_omitted !== 'boolean') {
    throw new Error('对话上下文提示格式异常')
  }
  if (payload.latest_round_omitted && payload.retained_rounds !== 0) throw new Error('对话上下文提示格式异常')
  return { event: 'context', payload: { message: payload.message, retained_rounds: payload.retained_rounds,
    latest_round_omitted: payload.latest_round_omitted } }
}

// 做什么：把一个完整 SSE 帧解析为已校验事件
// 入参：以空行分隔出来的一帧文本
// 返回：业务事件；纯注释返回 null，无效 JSON 或字段抛异常
function parseFrame(frame: string): ChatEvent | null {
  let eventName = ''
  const contentLines: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) eventName = line.slice('event:'.length).trim()
    if (line.startsWith('data:')) contentLines.push(line.slice('data:'.length).trimStart())
  }
  if (!contentLines.length) return null
  return validatedEvent(eventName, JSON.parse(contentLines.join('\n')) as unknown)
}

// 做什么：创建能处理半帧、连续帧和 Windows 换行的流式解码器
// 入参：收到完整事件后的回调
// 返回：文本追加函数；半帧会保留到下一次追加，超限时抛异常
export function createEventDecoder(onEvent: (event: ChatEvent) => void): (text: string) => void {
  let buffered = ''
  return (text: string): void => {
    buffered += text
    buffered = buffered.replace(/\r\n/g, '\n')
    let separator = buffered.indexOf('\n\n')
    while (separator >= 0) {
      const frame = buffered.slice(0, separator)
      if (frame.length > MAX_FRAME_CHARACTERS) throw new Error('对话事件超过长度限制')
      const event = parseFrame(frame)
      if (event) onEvent(event)
      buffered = buffered.slice(separator + '\n\n'.length)
      separator = buffered.indexOf('\n\n')
    }
    if (buffered.length > MAX_FRAME_CHARACTERS) throw new Error('对话事件超过长度限制')
  }
}

