// 做什么：创建可独立推进的浏览器事件和定时器，不依赖真实网络或时钟
// 入参：可选的共享通道总线
// 返回：窗口、文档、定时器及触发函数
export function tabBrowser(bus = null) {
  const window = new EventTarget()
  const document = new EventTarget()
  document.visibilityState = 'visible'
  const timers = new Map()
  let sequence = 0
  window.setTimeout = (callback, delay) => {
    timers.set(++sequence, { callback, delay })
    return sequence
  }
  window.clearTimeout = (timer) => timers.delete(timer)
  if (bus) window.BroadcastChannel = bus.Channel
  return { window, document, timers,
    fire: (name, values = {}) => window.dispatchEvent(Object.assign(new Event(name), values)),
    visible: (value) => {
      document.visibilityState = value
      document.dispatchEvent(new Event('visibilitychange'))
    },
    tick: () => {
      const first = timers.entries().next().value
      if (!first) return false
      timers.delete(first[0])
      first[1].callback()
      return true
    },
  }
}

// 做什么：模拟多个窗口共享的原生广播通道，保存实际广播负载用于安全断言
// 入参：无
// 返回：通道类、已发通知和仍然打开的通道集合
export function tabBus() {
  const channels = new Set()
  const notices = []
  class Channel {
    // 做什么：登记同名通道
    // 入参：通道名称
    // 返回：独立端点
    constructor(name) {
      this.name = name
      channels.add(this)
    }
    // 做什么：向其他同名端点派发克隆后的消息
    // 入参：通知对象
    // 返回：无；不会回送给发送端
    postMessage(notice) {
      notices.push(structuredClone(notice))
      for (const channel of channels) {
        if (channel !== this && channel.name === this.name) channel.onmessage?.({ data: structuredClone(notice) })
      }
    }
    // 做什么：移除通道
    // 入参：无
    // 返回：无；可重复关闭
    close() {
      channels.delete(this)
    }
  }
  return { Channel, channels, notices }
}

// 做什么：推进 Promise 回调，使单次观察完成，不推进模拟定时器
// 入参：无
// 返回：当前事件循环的异步操作完成
export async function settle() {
  await new Promise((resolve) => setImmediate(resolve))
}
