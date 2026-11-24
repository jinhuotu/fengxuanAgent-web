import test from 'node:test'
import assert from 'node:assert/strict'
import { baseApi, loadChat, message, ChatRequestError } from './chat-support.mjs'
import { tabBrowser, tabBus, settle } from './tab-browser.mjs'

const REQUEST_ID = '11111111-1111-4111-8111-111111111111'
const NEW_REQUEST_ID = '22222222-2222-4222-8222-222222222222'

// 做什么：提供完整的会话状态和已保存结果边界
// 入参：可覆盖的 API
// 返回：隔离模拟 API
function remoteApi(overrides = {}) {
  return baseApi({
    getChatSessionState: async (id) => session(id),
    getChatHistory: async (id) => ({ session: session(id), items: [], total: 0 }),
    ...overrides,
  })
}

// 做什么：构造活动状态快照
// 入参：会话编号、活动 UUID 和版本
// 返回：不包含问题或回答的状态
function session(id = 1, active_request_id = null, history_version = 0) {
  return { id, title: '会话', active_request_id, history_version, generation_expires_at: null }
}

// 做什么：构造已落库的生成快照
// 入参：回答状态、当前有效活动 UUID 和历史版本
// 返回：原请求结果及最新会话标识
function result(status = 'generating', active_request_id = REQUEST_ID, history_version = 0) {
  return { request_id: REQUEST_ID, history_version, active_request_id, session_busy: Boolean(active_request_id), can_retry: false,
    question: { ...message('user', '服务器问题'), request_id: REQUEST_ID },
    answer: { ...message('assistant', '已保存的回答'), request_id: REQUEST_ID, status } }
}

// 做什么：初始化真实交互并开启当前账号的标签页观察
// 入参：模拟 API、窗口、身份读取函数及用户编号
// 返回：已选中会话的真实交互实例
async function observingChat(api, browser = tabBrowser(), getToken = () => 'owner-token', userId = 1) {
  const chat = loadChat(api, getToken, browser)
  await chat.initialize()
  chat.startTabSync(userId)
  return chat
}

test('observer reads saved progress, never acquires owner rights, and close sends no interrupt', async () => {
  const browser = tabBrowser()
  const interruptions = []
  const chat = await observingChat(remoteApi({
    getChatSessionState: async () => session(1, REQUEST_ID),
    getChatRequest: async () => result(),
    interruptChat: async (...parameters) => interruptions.push(parameters),
  }), browser)
  chat.state.current.draft = '保留草稿'
  await chat.refreshTabs()
  assert.equal(chat.state.current.remoteRequestId, REQUEST_ID)
  assert.equal(chat.state.current.ownsPendingRequest, false)
  assert.equal(chat.state.current.messages.at(-1).content, '已保存的回答')
  assert.equal(chat.state.current.draft, '保留草稿')
  assert.equal([...browser.timers.values()][0].delay, 2000)
  await chat.stopGeneration()
  chat.stopAllGenerations()
  chat.dispose()
  assert.deepEqual(interruptions, [])
  assert.equal(browser.timers.size, 0)
})

test('broadcast contains identifiers only and another tab confirms state from server', async () => {
  const bus = tabBus()
  const firstBrowser = tabBrowser(bus)
  const secondBrowser = tabBrowser(bus)
  let active = null
  let stream
  let queries = 0
  const shared = remoteApi({ getChatSessionState: async () => { queries++; return session(1, active) },
    getChatRequest: async () => result() })
  const owner = await observingChat({ ...shared, streamChat: (id, requestId, content, signal, onEvent) => new Promise((resolve) => {
    active = requestId
    stream = { signal, onEvent, resolve }
    onEvent({ event: 'started', payload: { assistant_id: 2 } })
    signal.addEventListener('abort', resolve, { once: true })
  }) }, firstBrowser)
  const observer = await observingChat({ ...shared, getChatRequest: async () => ({ ...result(), request_id: active,
    question: { ...message('user', '服务端问题'), request_id: active },
    answer: { ...message('assistant', '服务端进度'), request_id: active, status: 'generating' }, active_request_id: active }) }, secondBrowser)
  owner.state.current.draft = '私密问题'
  const sending = owner.sendMessage()
  assert.equal(bus.notices.length, 1)
  assert.deepEqual(Object.keys(bus.notices[0]).sort(), ['kind', 'request_id', 'session_id', 'source_id', 'user_id'])
  secondBrowser.tick()
  await settle()
  assert.ok(queries > 0)
  assert.equal(observer.state.current.remoteRequestId, active)
  observer.dispose()
  assert.equal(stream.signal.aborted, false)
  owner.dispose()
  await sending
  assert.equal(bus.channels.size, 0)
})

test('focus and visible fallback reconcile missed completion without BroadcastChannel', async () => {
  const browser = tabBrowser()
  let completed = false
  const chat = await observingChat(remoteApi({
    getChatSessionState: async () => session(1, completed ? null : REQUEST_ID, completed ? 1 : 0),
    getChatRequest: async () => result(),
    getChatHistory: async () => ({ session: session(1, null, completed ? 1 : 0), items: completed ? [result('completed', null, 1).answer] : [], total: completed ? 1 : 0 }),
  }), browser)
  await chat.refreshTabs()
  browser.visible('hidden')
  assert.equal(browser.timers.size, 0)
  completed = true
  browser.fire('focus')
  assert.equal(browser.timers.size, 0)
  browser.visible('visible')
  browser.tick()
  await settle()
  assert.equal(chat.state.current.remoteRequestId, null)
  assert.equal(chat.state.current.pendingRequestId, null)
  assert.equal(chat.state.current.messages.at(-1).status, 'completed')
  assert.equal([...browser.timers.values()][0].delay, 10000)
  chat.dispose()
})

test('old request completion preserves the newer active request UUID', async () => {
  const chat = await observingChat(remoteApi({ getChatSessionState: async () => session(1, REQUEST_ID),
    getChatRequest: async () => result('completed', NEW_REQUEST_ID, 1) }))
  await chat.refreshTabs()
  assert.equal(chat.state.current.remoteRequestId, NEW_REQUEST_ID)
  assert.equal(chat.state.current.pendingRequestId, NEW_REQUEST_ID)
  assert.equal(chat.state.current.ownsPendingRequest, false)
  chat.dispose()
})

test('late observer response cannot overwrite a newly started local SSE', async () => {
  let releaseState
  let stream
  const chat = await observingChat(remoteApi({
    getChatSessionState: () => new Promise((resolve) => { releaseState = resolve }),
    streamChat: (id, requestId, content, signal, onEvent) => new Promise((resolve) => {
      stream = { signal, onEvent }
      signal.addEventListener('abort', resolve, { once: true })
    }),
  }))
  const reading = chat.refreshTabs()
  await settle()
  chat.state.current.draft = '本地新问题'
  const sending = chat.sendMessage()
  stream.onEvent({ event: 'delta', payload: { content: '本地新回答' } })
  releaseState(session(1, REQUEST_ID))
  await reading
  assert.equal(chat.state.current.messages.at(-1).content, '本地新回答')
  assert.equal(chat.state.current.remoteRequestId, null)
  assert.equal(chat.state.current.ownsPendingRequest, true)
  chat.dispose()
  await sending
})

test('login storage change clears old content and aborts old work without using new token', async () => {
  const browser = tabBrowser()
  let token = 'old-token'
  let stream
  const interruptions = []
  const chat = await observingChat(remoteApi({
    interruptChat: async () => interruptions.push(token),
    streamChat: (id, requestId, content, signal, onEvent) => new Promise((resolve) => {
      stream = { signal, onEvent }
      signal.addEventListener('abort', resolve, { once: true })
    }),
  }), browser, () => token)
  chat.state.current.draft = '旧账号私密问题'
  const sending = chat.sendMessage()
  token = 'new-token'
  browser.fire('storage', { key: 'unrelated' })
  assert.equal(chat.state.accountChanged, false)
  browser.fire('storage', { key: 'fengxuan_token' })
  await sending
  stream.onEvent({ event: 'delta', payload: { content: '迟到的旧回答' } })
  assert.equal(stream.signal.aborted, true)
  assert.equal(chat.state.accountChanged, true)
  assert.deepEqual(chat.state.current.messages, [])
  assert.equal(chat.state.current.draft, '')
  assert.deepEqual(chat.state.sessions, [])
  assert.deepEqual(interruptions, [])
  assert.equal(token, 'new-token')
  assert.equal(browser.timers.size, 0)
})

test('hidden tab pauses observation but preserves local generation and visible calibrates again', async () => {
  const browser = tabBrowser()
  let signal
  let queries = 0
  const chat = await observingChat(remoteApi({
    getChatSessionState: async () => { queries++; return session() },
    streamChat: (id, requestId, content, requestSignal) => new Promise((resolve) => {
      signal = requestSignal
      signal.addEventListener('abort', resolve, { once: true })
    }),
  }), browser)
  chat.state.current.draft = '问题'
  const sending = chat.sendMessage()
  browser.visible('hidden')
  assert.equal(signal.aborted, false)
  assert.equal(browser.timers.size, 0)
  browser.visible('visible')
  browser.tick()
  await settle()
  assert.equal(queries, 0)
  assert.equal(signal.aborted, false)
  chat.dispose()
  await sending
})

test('observer failures remain separate and polling recovers on the next visible refresh', async () => {
  let failing = true
  const chat = await observingChat(remoteApi({ getChatSessionState: async () => {
    if (failing) throw new ChatRequestError('不可展示的响应正文', 503)
    return session()
  } }))
  await chat.refreshTabs()
  assert.ok(chat.state.current.remoteSyncError)
  assert.equal(chat.state.current.error, '')
  assert.equal(chat.state.current.remoteSyncError.includes('响应正文'), false)
  failing = false
  await chat.refreshTabs()
  assert.equal(chat.state.current.remoteSyncError, '')
  chat.dispose()
})

test('idle fallback refreshes the session list after a lost creation notice', async () => {
  const browser = tabBrowser()
  let calls = 0
  const chat = await observingChat(remoteApi({ getChatSessions: async () => {
    calls++
    return { items: calls >= 3 ? [session(2), session(1)] : [session(1)], total: calls >= 3 ? 2 : 1 }
  } }), browser)
  await chat.refreshTabs()
  browser.tick()
  await settle()
  assert.equal(chat.state.sessions[0].id, 2)
  chat.dispose()
})

test('late observer error from another selection does not contaminate the current conversation', async () => {
  let rejectState
  const chat = await observingChat(remoteApi({ getChatSessionState: () => new Promise((resolve, reject) => { rejectState = reject }) }))
  const reading = chat.refreshTabs()
  await settle()
  await chat.selectSession(2)
  rejectState(new Error('旧会话查询失败'))
  await reading
  assert.equal(chat.state.current.remoteSyncError, '')
  chat.dispose()
})

test('completion between state and result reads calibrates all saved history', async () => {
  let historyCalls = 0
  const chat = await observingChat(remoteApi({
    getChatSessionState: async () => session(1, REQUEST_ID),
    getChatRequest: async () => result('completed', null, 2),
    getChatHistory: async () => {
      historyCalls++
      return { session: session(1, null, 2), items: [message('assistant', '最新完整历史')], total: 1 }
    },
  }))
  // 初始历史使用同版本，仍需要在观察到终结时校准完整记录。
  chat.state.current.serverHistoryVersion = 0
  await chat.refreshTabs()
  assert.equal(historyCalls, 2)
  assert.equal(chat.state.current.messages.at(-1).content, '最新完整历史')
  chat.dispose()
})

test('notifications reject other users, own echoes, and extra content fields', async () => {
  const bus = tabBus()
  const browser = tabBrowser(bus)
  let calls = 0
  const chat = await observingChat(remoteApi({ getChatSessionState: async () => { calls++; return session() } }), browser)
  await chat.refreshTabs()
  chat.state.tabSync.notify(1, REQUEST_ID)
  const notice = bus.notices[0]
  const channel = [...bus.channels][0]
  for (const ignored of [notice, { ...notice, user_id: 2 }, { ...notice, source_id: 'other', content: '禁止传播' }]) {
    channel.onmessage({ data: ignored })
    assert.equal([...browser.timers.values()][0].delay, 10000)
  }
  channel.onmessage({ data: { ...notice, source_id: 'other' } })
  assert.equal([...browser.timers.values()][0].delay, 150)
  browser.tick()
  await settle()
  assert.equal(calls, 2)
  chat.dispose()
})

test('overlapping focus events coalesce queries and stale account lookup cannot refill content', async () => {
  const browser = tabBrowser()
  let token = 'original'
  let release
  let calls = 0
  let signal
  const chat = await observingChat(remoteApi({ getChatSessionState: (id, requestSignal) => {
    calls++
    signal = requestSignal
    return new Promise((resolve) => { release = resolve })
  } }), browser, () => token)
  const reading = chat.refreshTabs()
  await settle()
  browser.fire('focus')
  browser.tick()
  await chat.refreshTabs()
  assert.equal(calls, 1)
  token = ''
  browser.fire('storage', { key: null })
  assert.equal(signal.aborted, true)
  release(session(1, REQUEST_ID))
  await reading
  assert.equal(chat.state.accountChanged, true)
  assert.deepEqual(chat.state.current.messages, [])
  browser.fire('focus')
  assert.equal(browser.timers.size, 0)
})

test('visibility cancellation preserves ownership of an uncertain locally submitted request', async () => {
  const browser = tabBrowser()
  let signal
  const interruptions = []
  const chat = await observingChat(remoteApi({
    getChatRequest: (id, requestId, requestSignal) => new Promise((resolve, reject) => {
      signal = requestSignal
      requestSignal.addEventListener('abort', () => reject(new Error('已取消查询')), { once: true })
    }),
    interruptChat: async (id, requestId) => interruptions.push(requestId),
  }), browser)
  chat.state.current.pendingRequestId = REQUEST_ID
  chat.state.current.ownsPendingRequest = true
  const reading = chat.refreshTabs()
  await settle()
  browser.visible('hidden')
  await reading
  assert.equal(signal.aborted, true)
  assert.equal(chat.state.current.ownsPendingRequest, true)
  assert.equal(chat.state.current.confirming, false)
  chat.dispose()
  await settle()
  assert.deepEqual(interruptions, [REQUEST_ID])
})

test('blocked broadcast capability retains polling and page cache restoration', async () => {
  const browser = tabBrowser()
  browser.window.BroadcastChannel = class { constructor() { throw new Error('策略禁止通道') } }
  let calls = 0
  const chat = await observingChat(remoteApi({ getChatSessionState: async () => { calls++; return session() } }), browser)
  await chat.refreshTabs()
  browser.fire('pagehide')
  assert.equal(browser.timers.size, 0)
  browser.fire('pageshow')
  browser.tick()
  await settle()
  assert.equal(calls, 2)
  chat.dispose()
  browser.fire('pageshow')
  browser.fire('focus')
  assert.equal(browser.timers.size, 0)
})
