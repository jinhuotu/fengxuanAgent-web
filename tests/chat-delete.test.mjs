import assert from 'node:assert/strict'
import test from 'node:test'
import { baseApi, ChatRequestError, loadChat, message } from './chat-support.mjs'

// 做什么：构造一条服务端会话
// 入参：编号、标题和额外字段
// 返回：页面列表需要的会话形状
function session(id, title, extra = {}) {
  return { id, title, updated_at: '2026-11-23T12:00:00', ...extra }
}

// 做什么：让会话列表接口始终返回当前内存中的列表
// 入参：可变的会话数组
// 返回：符合分页形状的模拟实现
function pageOf(current) {
  return async () => {
    const items = current()
    return { items: [...items], total: items.length }
  }
}

// 做什么：确认删除当前会话后自动切到相邻一条，列表和总数一起减少
// 入参：无
// 返回：没有切换或没有发起删除请求时失败
test('deletes selected session and selects the neighbour', async () => {
  let sessions = [session(1, '第一'), session(2, '第二'), session(3, '第三')]
  const deleted = []
  const chat = loadChat(baseApi({
    getChatSessions: pageOf(() => sessions),
    getChatHistory: async (sessionId) => ({ items: sessionId === 2 ? [message('user', '问题'), message('assistant', '回答')] : [], total: 0 }),
    deleteChatSession: async (sessionId) => {
      deleted.push(sessionId)
      sessions = sessions.filter((item) => item.id !== sessionId)
      return { session_id: sessionId, deleted_messages: 2 }
    },
  }))
  await chat.initialize()
  assert.equal(chat.state.selectedId, 1)

  assert.equal(await chat.deleteSession(1), true)
  assert.deepEqual(deleted, [1])
  assert.deepEqual(chat.state.sessions.map((item) => item.id), [2, 3])
  assert.equal(chat.state.selectedId, 2)
  assert.equal(chat.state.sessionTotal, 2)
  assert.equal(chat.state.current.sessionId, 2)
  assert.equal(chat.state.current.messages.length, 2)
})

// 做什么：确认删掉唯一会话后回到空态，而不是停在已删会话上
// 入参：无
// 返回：会话残留或选中编号没有归零时失败
test('deleting the last session returns to empty state', async () => {
  let sessions = [session(1, '唯一')]
  const chat = loadChat(baseApi({
    getChatSessions: pageOf(() => sessions),
    deleteChatSession: async (sessionId) => {
      sessions = []
      return { session_id: sessionId, deleted_messages: 2 }
    },
  }))
  await chat.initialize()

  assert.equal(await chat.deleteSession(1), true)
  assert.deepEqual(chat.state.sessions, [])
  assert.equal(chat.state.sessionTotal, 0)
  assert.equal(chat.state.selectedId, 0)
  assert.equal(chat.state.current.sessionId, 0)
  assert.deepEqual(chat.state.current.messages, [])
  assert.equal(chat.state.conversations[1], undefined)
})

// 做什么：确认生成中的会话在前端就被拒绝删除，不发请求
// 入参：无
// 返回：请求已发出或返回成功时失败
test('refuses to delete a session while it is generating', async () => {
  let deletes = 0
  const chat = loadChat(baseApi({
    getChatSessions: async () => ({ items: [session(1, '生成中')], total: 1 }),
    streamChat: () => new Promise(() => {}),
    deleteChatSession: async () => { deletes += 1; return { session_id: 1, deleted_messages: 0 } },
  }))
  await chat.initialize()
  chat.state.current.draft = '问题'
  void chat.sendMessage()
  assert.equal(chat.state.current.sending, true)

  assert.equal(await chat.deleteSession(1), false)
  assert.equal(deletes, 0)
  assert.equal(chat.state.sessions.length, 1)
})

// 做什么：确认接口失败时不从列表移除，并把原因写进页面
// 入参：无
// 返回：本地先删或错误丢失时失败
test('keeps the session when the delete request fails', async () => {
  const chat = loadChat(baseApi({
    getChatSessions: async () => ({ items: [session(1, '保留'), session(2, '另一条')], total: 2 }),
    deleteChatSession: async () => { throw new ChatRequestError('会话不存在或无权访问', 404, 3001) },
  }))
  await chat.initialize()

  assert.equal(await chat.deleteSession(2), false)
  assert.deepEqual(chat.state.sessions.map((item) => item.id), [1, 2])
  assert.equal(chat.state.selectedId, 1)
  assert.equal(chat.state.current.error, '会话不存在或无权访问')
})

// 做什么：确认清空后列表、会话缓存、选中编号和总数全部重置
// 入参：无
// 返回：任一状态残留时失败
test('clears every session and resets the workspace', async () => {
  let sessions = [session(1, '第一'), session(2, '第二')]
  let clears = 0
  const chat = loadChat(baseApi({
    getChatSessions: pageOf(() => sessions),
    clearChatSessions: async () => {
      clears += 1
      sessions = []
      return { deleted_sessions: 2, deleted_messages: 4 }
    },
  }))
  await chat.initialize()
  await chat.selectSession(2)
  assert.equal(chat.state.selectedId, 2)

  assert.equal(await chat.clearSessions(), true)
  assert.equal(clears, 1)
  assert.deepEqual(chat.state.sessions, [])
  assert.deepEqual(chat.state.conversations, {})
  assert.equal(chat.state.sessionTotal, 0)
  assert.equal(chat.state.selectedId, 0)
  assert.equal(chat.state.current.sessionId, 0)
})

// 做什么：确认任一会话在生成时整批清空被前端拒绝
// 入参：无
// 返回：请求已发出或返回成功时失败
test('refuses to clear while any session is generating', async () => {
  let clears = 0
  const chat = loadChat(baseApi({
    getChatSessions: async () => ({ items: [session(1, '生成中'), session(2, '空闲')], total: 2 }),
    streamChat: () => new Promise(() => {}),
    clearChatSessions: async () => { clears += 1; return { deleted_sessions: 2, deleted_messages: 4 } },
  }))
  await chat.initialize()
  chat.state.current.draft = '问题'
  void chat.sendMessage()

  assert.equal(await chat.clearSessions(), false)
  assert.equal(clears, 0)
  assert.equal(chat.state.sessions.length, 2)
})
