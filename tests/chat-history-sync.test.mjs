import assert from 'node:assert/strict'
import test from 'node:test'
import { baseApi, ChatRequestError, loadChat, loadRecovery, message } from './chat-support.mjs'

// 做什么：复现完成后的慢历史校准继续阻止用户发送下一问
// 入参：无
// 返回：校准阻塞发送或旧响应覆盖新轮次时失败
test('completed stream permits next submission while old history sync is pending', async () => {
  let historyCalls = 0
  let releaseOldHistory
  let submissions = 0
  let secondSignal
  const chat = loadChat(baseApi({
    getChatHistory: async () => {
      historyCalls += 1
      if (historyCalls !== 2) return { items: [], total: 0 }
      return new Promise((resolve) => { releaseOldHistory = resolve })
    },
    streamChat: async (sessionId, requestId, content, signal, onEvent) => {
      submissions += 1
      if (submissions === 1) onEvent({ event: 'completed', payload: { assistant_id: 2, finish_reason: 'stop' } })
      else {
        secondSignal = signal
        await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
      }
    },
  }))
  await verifySlowHistoryRace(chat, () => submissions, () => secondSignal, () => releaseOldHistory)
})

// 做什么：在旧历史未返回时提交新问题，再释放旧响应
// 入参：真实交互和测试状态读取函数
// 返回：无；新问题或发送状态被旧响应覆盖时失败
async function verifySlowHistoryRace(chat, submissions, secondSignal, oldHistory) {
  await chat.initialize()
  chat.state.current.draft = '第一问'
  const firstSending = chat.sendMessage()
  await new Promise((resolve) => setImmediate(resolve))
  chat.state.current.draft = '第二问'
  const secondSending = chat.sendMessage()
  assert.equal(submissions(), 2)
  oldHistory()({ items: [message('assistant', '迟到的旧回答')], total: 1 })
  await firstSending
  assert.equal(chat.state.current.messages.at(-2).content, '第二问')
  assert.equal(chat.state.current.sending, true)
  assert.equal(secondSignal().aborted, false)
  chat.dispose()
  await secondSending
}

// 做什么：确认多轮未校准的用户临时编号不会在结果恢复时被倒序排列
// 入参：无
// 返回：较早问答被拆散或重新排序时失败
test('result recovery preserves chronology of multiple uncalibrated turns', () => {
  const { applyRequestResult, createRecoveryState } = loadRecovery(baseApi())
  const messages = []
  for (let round = 1; round <= 3; round += 1) {
    messages.push({ ...message('user', `问题${round}`), id: -round, request_id: `request-${round}` })
    messages.push({ ...message('assistant', `回答${round}`), id: round * 2, request_id: `request-${round}` })
  }
  const conversation = { ...createRecoveryState(), sessionId: 1, messages, draft: '', error: '', historyTotal: 6 }
  applyRequestResult(conversation, {
    request_id: 'request-3', question: { ...messages[4], id: 5 }, answer: messages[5], session_busy: false, can_retry: false,
  })
  assert.deepEqual(conversation.messages.map((entry) => entry.content), ['问题1', '回答1', '问题2', '回答2', '问题3', '回答3'])
})

// 做什么：确认校准失败独立提示，重试同步只读取历史且保留下一问草稿
// 入参：无
// 返回：完成被改成失败、输入丢失或额外生成时失败
test('history sync failure preserves completed answer and draft for retry', async () => {
  let submitted = false
  let unavailable = true
  let submissions = 0
  const chat = loadChat(baseApi({
    getChatHistory: async () => {
      if (submitted && unavailable) throw new Error('历史服务暂不可用')
      return { items: submitted ? [message('user', '问题'), message('assistant', '已保存回答')] : [], total: submitted ? 2 : 0 }
    },
    streamChat: async (sessionId, requestId, content, signal, onEvent) => {
      submitted = true
      submissions += 1
      onEvent({ event: 'completed', payload: { assistant_id: 2, finish_reason: 'stop' } })
    },
  }))
  await verifySyncRetry(chat, () => { unavailable = false }, () => submissions)
})

// 做什么：验证历史同步重试保持完成结果及用户草稿
// 入参：真实交互、恢复服务的回调及提交计数读取函数
// 返回：无；同步被当成新生成时失败
async function verifySyncRetry(chat, recoverHistory, submissions) {
  await chat.initialize()
  chat.state.current.draft = '问题'
  await chat.sendMessage()
  assert.equal(chat.state.current.messages.at(-1).status, 'completed')
  assert.equal(chat.state.current.error, '')
  assert.match(chat.state.current.historySyncError, /历史暂未同步/)
  assert.equal(chat.state.current.loadingHistory, false)
  chat.state.current.draft = '下一问草稿'
  recoverHistory()
  await chat.syncHistory()
  assert.equal(chat.state.current.historySyncError, '')
  assert.equal(chat.state.current.draft, '下一问草稿')
  assert.equal(submissions(), 1)
}

// 做什么：确认后台校准时账号失效仍进入原有重新登录流程
// 入参：无
// 返回：401 被吞掉或完成状态被改写时失败
test('background sync still reports expired authentication', async () => {
  let submitted = false
  const chat = loadChat(baseApi({
    getChatHistory: async () => {
      if (submitted) throw new ChatRequestError('登录已失效', 401, 1002)
      return { items: [], total: 0 }
    },
    streamChat: async (sessionId, requestId, content, signal, onEvent) => {
      submitted = true
      onEvent({ event: 'completed', payload: { assistant_id: 2, finish_reason: 'stop' } })
    },
  }))
  await chat.initialize()
  chat.state.current.draft = '问题'
  await chat.sendMessage()
  assert.equal(chat.state.unauthorized, true)
  assert.equal(chat.state.current.messages.at(-1).status, 'completed')
})

// 做什么：确认接收前拒绝不保留虚假生成占位，不必等后台历史返回
// 入参：无
// 返回：历史仍在同步时出现假生成或问题丢失则失败
test('rejected temporary messages disappear before slow history sync returns', async () => {
  let historyCalls = 0
  let releaseHistory
  const chat = loadChat(baseApi({
    getChatHistory: async () => {
      historyCalls += 1
      if (historyCalls === 1) return { items: [], total: 0 }
      return new Promise((resolve) => { releaseHistory = resolve })
    },
    streamChat: async () => { throw new ChatRequestError('全站已满', 429, 3004) },
  }))
  await chat.initialize()
  chat.state.current.draft = '问题'
  const sending = chat.sendMessage()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(chat.state.current.syncingHistory, true)
  assert.equal(chat.state.current.loadingHistory, false)
  assert.deepEqual(chat.state.current.messages, [])
  assert.equal(chat.state.current.draft, '问题')
  releaseHistory({ items: [], total: 0 })
  await sending
})

// 做什么：确认未校准的临时用户编号与分页重叠记录不会造成重复消息
// 入参：无
// 返回：同请求同角色在列表中出现两次时失败
test('older history deduplicates stored messages against temporary ids', async () => {
  const storedQuestion = { ...message('user', '旧问题'), request_id: 'old-request' }
  const chat = loadChat(baseApi({
    getChatHistory: async (sessionId, page) => ({ items: page === 2 ? [storedQuestion] : [], total: 3 }),
  }))
  await chat.initialize()
  chat.state.current.messages = [
    { ...storedQuestion, id: -1 },
    { ...message('assistant', '旧回答'), request_id: 'old-request' },
  ]
  await chat.loadHistory(true)
  assert.equal(chat.state.current.messages.filter((entry) => entry.request_id === 'old-request' && entry.role === 'user').length, 1)
})
