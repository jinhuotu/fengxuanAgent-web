import assert from 'node:assert/strict'
import test from 'node:test'
import { baseApi, ChatRequestError, loadChat, message } from './chat-support.mjs'

// 做什么：构造同一请求的真实接口结果形状
// 入参：请求编号、助手状态和重试资格
// 返回：不含真实账号资料的测试结果
function requestResult(requestId, status = 'completed', canRetry = false) {
  return {
    request_id: requestId, question: { ...message('user', '问题'), request_id: requestId },
    answer: { ...message('assistant', '数据库中的回答'), request_id: requestId, status },
    session_busy: status === 'generating', can_retry: canRetry,
  }
}

// 做什么：确认生成中的请求继续查询到终态，不重复生成
// 入参：无
// 返回：重复调用模型或不能恢复终态时失败
test('polls original generating request until its saved result is terminal', async () => {
  let submissions = 0
  let lookups = 0
  const chat = loadChat(baseApi({
    streamChat: async () => { submissions += 1; throw new Error('断线') },
    getChatRequest: async (sessionId, requestId) => {
      lookups += 1
      return requestResult(requestId, lookups === 1 ? 'generating' : 'completed')
    },
  }))
  await chat.initialize()
  chat.state.current.draft = '问题'
  await chat.sendMessage()
  assert.equal(submissions, 1)
  assert.equal(lookups, 2)
  assert.equal(chat.state.current.messages.at(-1).status, 'completed')
  assert.equal(chat.state.current.pendingRequestId, null)
})

// 做什么：确认暂未找到不能被当成未接收而自动重发
// 入参：无
// 返回：无限轮询、未知状态允许发送或不能再次查询时失败
test('missing request stays unknown after bounded checks and can be checked again', async () => {
  let available = false
  let lookups = 0
  let submissions = 0
  const chat = loadChat(baseApi({
    streamChat: async () => { submissions += 1; throw new Error('提交结果未知') },
    getChatRequest: async (sessionId, requestId) => {
      lookups += 1
      if (!available) throw new ChatRequestError('尚未找到', 404, 3006)
      return requestResult(requestId)
    },
  }))
  await chat.initialize()
  chat.state.current.draft = '问题'
  await chat.sendMessage()
  assert.equal(lookups, 4)
  assert.ok(chat.state.current.pendingRequestId)
  chat.state.current.draft = '不应再次生成'
  await chat.sendMessage()
  assert.equal(submissions, 1)
  available = true
  await chat.checkResult()
  assert.equal(chat.state.current.pendingRequestId, null)
  assert.equal(chat.state.current.messages.at(-1).status, 'completed')
})

// 做什么：确认查询服务故障不会变成自动重发，后续仍可确认失败状态
// 入参：无
// 返回：重复生成或查询失败后丢失原编号时失败
test('lookup outage leaves a recoverable unknown result', async () => {
  let unavailable = true
  let submissions = 0
  const chat = loadChat(baseApi({
    streamChat: async () => { submissions += 1; throw new Error('断线') },
    getChatRequest: async (sessionId, requestId) => {
      if (unavailable) throw new ChatRequestError('查询暂不可用', 503)
      return requestResult(requestId, 'failed', true)
    },
  }))
  await chat.initialize()
  chat.state.current.draft = '问题'
  await chat.sendMessage()
  const original = chat.state.current.pendingRequestId
  assert.ok(original)
  assert.match(chat.state.current.error, /结果尚未确认/)
  unavailable = false
  await chat.checkResult()
  assert.equal(chat.state.current.messages.at(-1).request_id, original)
  assert.equal(chat.state.current.draft, '问题')
  assert.equal(submissions, 1)
})

// 做什么：确认失败候选只在后端再次验证后重试，并使用新编号
// 入参：无
// 返回：重复点击产生多个生成、编号复用或原记录丢失时失败
test('manual retry uses a fresh id and double clicks submit once', async () => {
  const failed = requestResult('original', 'failed', true)
  let sent
  const chat = loadChat(baseApi({
    getChatHistory: async () => ({ items: [failed.question, failed.answer], total: 2 }),
    getChatRequest: async () => failed,
    streamChat: async (sessionId, requestId, content, signal, onEvent, retryOf) => {
      sent = { requestId, content, retryOf }
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
    },
  }))
  await chat.initialize()
  const retrying = chat.retryRequest('original')
  await chat.retryRequest('original')
  await new Promise((resolve) => setImmediate(resolve))
  assert.notEqual(sent.requestId, 'original')
  assert.equal(sent.retryOf, 'original')
  assert.equal(sent.content, '问题')
  assert.equal(chat.state.current.messages.filter((entry) => entry.request_id === 'original').length, 2)
  chat.dispose()
  await retrying
})

// 做什么：确认后端已成功时重试按钮只恢复答案，不重新提交
// 入参：无
// 返回：旧失败状态导致重复调用时失败
test('manual retry restores newly completed result instead of regenerating', async () => {
  const failed = requestResult('original', 'failed', true)
  let submissions = 0
  const chat = loadChat(baseApi({
    getChatHistory: async () => ({ items: [failed.question, failed.answer], total: 2 }),
    getChatRequest: async () => requestResult('original'),
    streamChat: async () => { submissions += 1 },
  }))
  await chat.initialize()
  await chat.retryRequest('original')
  assert.equal(submissions, 0)
  assert.equal(chat.state.current.messages.at(-1).status, 'completed')
  assert.equal(chat.state.current.error, '')
})

// 做什么：确认已不是最新的失败候选不能提交
// 入参：无
// 返回：后端取消资格后仍生成时失败
test('manual retry respects changed server eligibility', async () => {
  const failed = requestResult('original', 'failed', true)
  let submissions = 0
  const chat = loadChat(baseApi({
    getChatHistory: async () => ({ items: [failed.question, failed.answer], total: 2 }),
    getChatRequest: async () => requestResult('original', 'failed', false),
    streamChat: async () => { submissions += 1 },
  }))
  await chat.initialize()
  await chat.retryRequest('original')
  assert.equal(submissions, 0)
  assert.match(chat.state.current.error, /不是最近失败问题/)
})

// 做什么：确认后台会话的状态确认不能覆盖前台会话
// 入参：无
// 返回：切换会话后发生串消息时失败
test('background recovery updates only its own conversation', async () => {
  let releaseLookup
  const chat = loadChat(baseApi({
    streamChat: async () => { throw new Error('断线') },
    getChatRequest: (sessionId, requestId) => new Promise((resolve) => {
      releaseLookup = () => resolve(requestResult(requestId))
    }),
  }))
  await chat.initialize()
  chat.state.current.draft = '问题'
  const sending = chat.sendMessage()
  await new Promise((resolve) => setImmediate(resolve))
  await chat.selectSession(2)
  releaseLookup()
  await sending
  assert.equal(chat.state.selectedId, 2)
  assert.deepEqual(chat.state.current.messages, [])
  assert.equal(chat.state.conversations[1].messages.at(-1).status, 'completed')
})

// 做什么：确认关闭页面取消查询且迟到结果不能写回
// 入参：无
// 返回：查询未取消、未中断原请求或旧结果回写时失败
test('disposing cancels lookup and ignores its late result', async () => {
  let releaseLookup
  let lookupSignal
  let interrupted = 0
  const chat = loadChat(baseApi({
    streamChat: async () => { throw new Error('断线') },
    interruptChat: async () => { interrupted += 1 },
    getChatRequest: (sessionId, requestId, signal) => new Promise((resolve) => {
      lookupSignal = signal
      releaseLookup = () => resolve(requestResult(requestId))
    }),
  }))
  await chat.initialize()
  chat.state.current.draft = '问题'
  const sending = chat.sendMessage()
  await new Promise((resolve) => setImmediate(resolve))
  chat.dispose()
  assert.equal(lookupSignal.aborted, true)
  releaseLookup()
  await sending
  assert.equal(interrupted, 1)
  assert.notEqual(chat.state.current.messages.at(-1).status, 'completed')
})

// 做什么：确认重复编号提示转入原请求查询，而不是重新生成
// 入参：无
// 返回：重复请求未恢复或重复提交时失败
test('duplicate submission queries the existing result', async () => {
  let submissions = 0
  const chat = loadChat(baseApi({
    streamChat: async () => { submissions += 1; throw new ChatRequestError('已提交', 409, 3003) },
    getChatRequest: async (sessionId, requestId) => requestResult(requestId),
  }))
  await chat.initialize()
  chat.state.current.draft = '问题'
  await chat.sendMessage()
  assert.equal(submissions, 1)
  assert.equal(chat.state.current.messages.at(-1).status, 'completed')
})

// 做什么：确认保存失败事件查询未知后，离开页面仍中断本页原请求
// 入参：无
// 返回：原请求控制权丢失或重新调用模型时失败
test('storage error is confirmed and pending owned request stops on page leave', async () => {
  let interrupted
  let original
  const chat = loadChat(baseApi({
    streamChat: async (sessionId, requestId, content, signal, onEvent) => {
      original = requestId
      onEvent({ event: 'error', payload: { code: 5000, message: '保存结果未知' } })
    },
    getChatRequest: async () => { throw new ChatRequestError('数据库不可用', 503) },
    interruptChat: async (sessionId, requestId) => { interrupted = requestId },
  }))
  await chat.initialize()
  chat.state.current.draft = '问题'
  await chat.sendMessage()
  assert.equal(chat.state.current.active, null)
  assert.equal(chat.state.current.pendingRequestId, original)
  chat.stopAllGenerations()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(interrupted, original)
})

// 做什么：确认手动重试遇到全站满额只保留原失败记录与输入
// 入参：无
// 返回：自动重试、覆盖原历史或丢失问题时失败
test('manual retry rejected by capacity keeps original history and question', async () => {
  const failed = requestResult('original', 'failed', true)
  let submissions = 0
  const chat = loadChat(baseApi({
    getChatHistory: async () => ({ items: [failed.question, failed.answer], total: 2 }),
    getChatRequest: async () => failed,
    streamChat: async () => { submissions += 1; throw new ChatRequestError('全站已满', 429, 3004) },
  }))
  await chat.initialize()
  await chat.retryRequest('original')
  assert.equal(submissions, 1)
  assert.equal(chat.state.current.messages.length, 2)
  assert.equal(chat.state.current.messages.at(-1).request_id, 'original')
  assert.equal(chat.state.current.draft, '问题')
  assert.equal(chat.state.current.error, '全站已满')
})

// 做什么：确认明确的未配置错误不查询不存在的轮次
// 入参：无
// 返回：错误进入未知状态或未恢复草稿时失败
test('known pre-submission configuration rejection preserves draft without lookup', async () => {
  let lookups = 0
  const chat = loadChat(baseApi({
    streamChat: async () => { throw new ChatRequestError('尚未配置模型 API Key', 503, 5002) },
    getChatRequest: async () => { lookups += 1 },
  }))
  await chat.initialize()
  chat.state.current.draft = '问题'
  await chat.sendMessage()
  assert.equal(lookups, 0)
  assert.equal(chat.state.current.pendingRequestId, null)
  assert.equal(chat.state.current.draft, '问题')
})

// 做什么：确认代理超时不能仅凭 HTTP 4xx 视为未提交
// 入参：无
// 返回：已保存结果未查询而直接允许重发时失败
test('unclassified HTTP timeout still queries original result', async () => {
  let lookups = 0
  const chat = loadChat(baseApi({
    streamChat: async () => { throw new ChatRequestError('代理超时', 408) },
    getChatRequest: async (sessionId, requestId) => { lookups += 1; return requestResult(requestId) },
  }))
  await chat.initialize()
  chat.state.current.draft = '问题'
  await chat.sendMessage()
  assert.equal(lookups, 1)
  assert.equal(chat.state.current.messages.at(-1).status, 'completed')
})
