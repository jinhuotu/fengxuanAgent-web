import assert from 'node:assert/strict'
import test from 'node:test'
import { baseApi, ChatRequestError, loadChat, message, parallelChat } from './chat-support.mjs'

// 做什么：确认刷新时恢复会话，流结束后从服务器校准消息
// 入参：无
// 返回：断言失败时测试报错
test('restores persisted history after streaming completes', async () => {
  let sent = false
  const api = baseApi({
    getChatHistory: async () => ({ items: sent ? [message('user', '问题'), message('assistant', '已保存回答')] : [], total: sent ? 2 : 0 }),
    streamChat: async (sessionId, requestId, content, signal, onEvent) => {
      sent = true
      onEvent({ event: 'started', payload: { request_id: requestId, assistant_id: 2 } })
      onEvent({ event: 'delta', payload: { content: '已保存回答' } })
      onEvent({ event: 'completed', payload: { assistant_id: 2, finish_reason: 'stop' } })
    },
  })
  const chat = loadChat(api)
  await chat.initialize()
  chat.state.current.draft = '问题'
  await chat.sendMessage()
  assert.equal(chat.state.current.messages[1].content, '已保存回答')
  assert.equal(chat.state.current.sending, false)
  assert.equal(chat.state.current.active, null)
})

// 做什么：确认离开页面会取消流并提交中断通知
// 入参：无
// 返回：取消或通知缺失时测试失败
test('disposing page aborts stream and sends interrupt notification', async () => {
  let interrupted = 0
  let activeSignal
  const api = baseApi({
    interruptChat: async () => { interrupted += 1 },
    streamChat: async (sessionId, requestId, content, signal) => {
      activeSignal = signal
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
    },
  })
  const chat = loadChat(api)
  await chat.initialize()
  chat.state.current.draft = '问题'
  const sending = chat.sendMessage()
  chat.dispose()
  await sending
  assert.equal(activeSignal.aborted, true)
  assert.equal(interrupted, 1)
  assert.equal(chat.state.current.messages.at(-1).status, 'interrupted')
})

// 做什么：确认退出或切换账号后旧请求无法写入新页面
// 入参：无
// 返回：旧响应覆盖状态时测试失败
test('ignores history arriving after account changes', async () => {
  let token = 'owner-token'
  let releaseHistory
  const api = baseApi({ getChatHistory: () => new Promise((resolve) => { releaseHistory = resolve }) })
  const chat = loadChat(api, () => token)
  const initialization = chat.initialize()
  await new Promise((resolve) => setImmediate(resolve))
  token = 'another-account'
  releaseHistory({ items: [message('assistant', '不应显示')], total: 1 })
  await initialization
  assert.deepEqual(chat.state.current.messages, [])
})

// 做什么：复现流取消与中断通知到达时间不同导致的历史状态回退
// 入参：无
// 返回：停止通知完成后仍显示生成中则失败
test('refreshes interrupted state after stop acknowledgement', async () => {
  let initialized = false
  let interruptionSaved = false
  let releaseInterruption
  const api = baseApi({
    getChatHistory: async () => ({ items: initialized ? [{ ...message('assistant', '部分回答'), status: interruptionSaved ? 'interrupted' : 'generating' }] : [], total: 1 }),
    streamChat: async (sessionId, requestId, content, signal) => new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true })),
    interruptChat: async () => {
      await new Promise((resolve) => { releaseInterruption = resolve })
      interruptionSaved = true
    },
  })
  const chat = loadChat(api)
  await chat.initialize()
  initialized = true
  chat.state.current.draft = '问题'
  const sending = chat.sendMessage()
  const stopping = chat.stopGeneration()
  await sending
  releaseInterruption()
  await stopping
  assert.equal(chat.state.current.messages.at(-1).status, 'interrupted')
})

// 做什么：确认切换会话不会中断后台生成且不同会话可以并行
// 入参：无
// 返回：串流、串消息或误中断时失败
test('different sessions stream concurrently without cancelling on switch', async () => {
  const { chat, streams, interruptions } = parallelChat()
  await chat.initialize()
  chat.state.current.draft = '问题一'
  const firstSending = chat.sendMessage()
  await chat.selectSession(2)
  assert.equal(streams.get(1).signal.aborted, false)
  chat.state.current.draft = '问题二'
  const secondSending = chat.sendMessage()
  streams.get(1).onEvent({ event: 'delta', payload: { content: '回答一' } })
  streams.get(2).onEvent({ event: 'delta', payload: { content: '回答二' } })
  assert.equal(chat.state.current.messages.at(-1).content, '回答二')
  await chat.selectSession(1)
  assert.equal(chat.state.current.messages.at(-1).content, '回答一')
  assert.deepEqual(interruptions, [])
  chat.dispose()
  await Promise.all([firstSending, secondSending])
  assert.equal(streams.get(1).signal.aborted, true)
  assert.equal(streams.get(2).signal.aborted, true)
  assert.deepEqual(interruptions.sort(), [1, 2])
})

// 做什么：确认停止按钮只停止当前会话，不能误停后台任务
// 入参：无
// 返回：其他会话被取消或同会话重复发送时失败
test('stop affects only selected session and same session cannot send twice', async () => {
  const { chat, streams, interruptions } = parallelChat()
  await chat.initialize()
  chat.state.current.draft = '问题一'
  const firstSending = chat.sendMessage()
  chat.state.current.draft = '重复提交'
  await chat.sendMessage()
  assert.equal(streams.size, 1)
  await chat.selectSession(2)
  chat.state.current.draft = '问题二'
  const secondSending = chat.sendMessage()
  await chat.stopGeneration({ type: 'click' })
  await secondSending
  assert.equal(streams.get(2).signal.aborted, true)
  assert.equal(streams.get(1).signal.aborted, false)
  assert.deepEqual(interruptions, [2])
  chat.dispose()
  await firstSending
})

// 做什么：确认后台失败只修改所属会话的错误和草稿
// 入参：无
// 返回：后台错误污染当前会话时失败
test('background errors and drafts stay in their own session', async () => {
  const { chat, streams } = parallelChat()
  await chat.initialize()
  chat.state.current.draft = '问题一'
  const sending = chat.sendMessage()
  await chat.selectSession(2)
  chat.state.current.draft = '会话二未发送草稿'
  streams.get(1).onEvent({ event: 'error', payload: { code: 5005, message: '限流' } })
  assert.equal(chat.state.current.error, '')
  assert.equal(chat.state.current.draft, '会话二未发送草稿')
  await chat.selectSession(1)
  assert.equal(chat.state.current.error, '限流')
  assert.equal(chat.state.current.draft, '问题一')
  await chat.selectSession(2)
  assert.equal(chat.state.current.draft, '会话二未发送草稿')
  chat.dispose()
  await sending
})

// 做什么：确认创建会话不取消旧任务
// 入参：无
// 返回：新建会话中断后台流时失败
test('creating session preserves active generation', async () => {
  const { chat, streams } = parallelChat()
  await chat.initialize()
  chat.state.current.draft = '问题一'
  const sending = chat.sendMessage()
  await chat.newSession()
  assert.equal(chat.state.selectedId, 3)
  assert.equal(streams.get(1).signal.aborted, false)
  chat.dispose()
  await sending
})

// 做什么：确认后台完成不会解除当前会话的发送占用
// 入参：无
// 返回：另一会话完成使当前会话可重复发送时失败
test('background completion cannot clear foreground sending state', async () => {
  const { chat, streams } = parallelChat()
  await chat.initialize()
  chat.state.current.draft = '问题一'
  const firstSending = chat.sendMessage()
  await chat.selectSession(2)
  chat.state.current.draft = '问题二'
  const secondSending = chat.sendMessage()
  streams.get(1).onEvent({ event: 'completed', payload: { assistant_id: 2, finish_reason: 'stop' } })
  streams.get(1).resolve()
  await firstSending
  assert.equal(chat.state.selectedId, 2)
  assert.equal(chat.state.current.sending, true)
  assert.equal(streams.get(2).signal.aborted, false)
  chat.dispose()
  await secondSending
})

// 做什么：确认接收前满额拒绝会保留问题且不停止其他会话
// 入参：无
// 返回：丢失草稿、错误串会话或误取消其他任务时失败
test('capacity rejection preserves draft without cancelling another session', async () => {
  let firstSignal
  const chat = loadChat(baseApi({
    streamChat: async (sessionId, requestId, content, signal) => {
      if (sessionId === 2) throw new ChatRequestError('当前全站生成任务已满', 429, 3004)
      firstSignal = signal
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
    },
  }))
  await chat.initialize()
  chat.state.current.draft = '问题一'
  const sending = chat.sendMessage()
  await chat.selectSession(2)
  chat.state.current.draft = '被拒绝的问题'
  await chat.sendMessage()
  assert.equal(chat.state.current.draft, '被拒绝的问题')
  assert.equal(chat.state.current.error, '当前全站生成任务已满')
  assert.equal(chat.state.current.sending, false)
  assert.equal(firstSignal.aborted, false)
  chat.dispose()
  await sending
})

// 做什么：复现已落库回答因完成事件丢失被误认为失败
// 入参：无
// 返回：重复生成、误中断或没有恢复正文时失败
test('recovers saved answer when completion event is lost', async () => {
  let calls = 0
  let interruptions = 0
  const chat = loadChat(baseApi({
    interruptChat: async () => { interruptions += 1 },
    streamChat: async () => { calls += 1; throw new Error('连接断开') },
    getChatRequest: async (sessionId, requestId) => ({
      request_id: requestId, question: { ...message('user', '问题'), request_id: requestId },
      answer: { ...message('assistant', '已保存的完整回答'), request_id: requestId }, can_retry: false, session_busy: false,
    }),
  }))
  await chat.initialize()
  chat.state.current.draft = '问题'
  await chat.sendMessage()
  assert.equal(chat.state.current.messages.at(-1).content, '已保存的完整回答')
  assert.equal(chat.state.current.error, '')
  assert.equal(chat.state.current.draft, '')
  assert.equal(calls, 1)
  assert.equal(interruptions, 0)
})

