/** 浏览器同源消息通道；只负责收发未知值，不读取登录或调用接口。 */
export interface TabChannel {
  post: (message: unknown) => boolean
  close: () => void
}

// 做什么：安全创建可选浏览器通道，不支持或被策略禁止时显式返回 null
// 入参：通道名称及未知消息回调
// 返回：通道适配器或 null，调用方保留可见校准和轮询兜底
export function openTabChannel(name: string, receive: (message: unknown) => void): TabChannel | null {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return null
  try {
    const channel = new window.BroadcastChannel(name)
    channel.onmessage = (event: MessageEvent<unknown>) => receive(event.data)
    return { post: postTabMessage.bind(null, channel), close: channel.close.bind(channel) }
  } catch {
    // 可选能力不可用，不伪装成已建立通道，由调用方使用服务器校准。
    return null
  }
}

// 做什么：尽力发送通知，失败返回状态，不影响正在进行的业务请求
// 入参：浏览器通道及不透明消息
// 返回：成功 true，已关闭或发送失败 false
function postTabMessage(channel: BroadcastChannel, message: unknown): boolean {
  try {
    channel.postMessage(message)
    return true
  } catch {
    return false
  }
}
