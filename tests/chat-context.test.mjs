import assert from 'node:assert/strict'
import test from 'node:test'
import { baseApi, ChatRequestError, loadChat, parallelChat } from './chat-support.mjs'

// 做什么：确认后台历史裁剪通知只显示在对应会话，不会当成错误或终结
// 入参：无
// 返回：通知串会话、被当失败或中断流时失败
test('context notice belongs to its own conversation and does not stop streams', async () => {
  const { chat, streams } = parallelChat()
  await chat.initialize()
  chat.state.current.draft = '问题一'
  const firstSending = chat.sendMessage()
  await chat.selectSession(2)
  chat.state.current.draft = '问题二'
  const secondSending = chat.sendMessage()
  streams.get(1).onEvent({ event: 'context', payload: { message: '历史一已裁剪', retained_rounds: 2, latest_round_omitted: false } })
  streams.get(1).onEvent({ event: 'delta', payload: { content: '继续回答一' } })
  assert.equal(chat.state.current.contextNotice, '')
  assert.equal(chat.state.current.error, '')
  await chat.selectSession(1)
  assert.equal(chat.state.current.contextNotice, '历史一已裁剪')
  assert.equal(chat.state.current.messages.at(-1).content, '继续回答一')
  assert.equal(chat.state.current.sending, true)
  assert.equal(streams.get(1).signal.aborted, false)
  chat.dispose()
  await Promise.all([firstSending, secondSending])
})

// 做什么：确认下一次发送清除上一次提示，不误报新请求也丢失历史
// 入参：无
// 返回：旧提示残留或新请求无法正常发送时失败
test('new submission resets previous context notice', async () => {
  const chat = loadChat(baseApi({ streamChat: async () => undefined }))
  await chat.initialize()
  chat.state.current.contextNotice = '上一轮历史提示'
  chat.state.current.draft = '新问题'
  await chat.sendMessage()
  assert.equal(chat.state.current.contextNotice, '')
})

// 做什么：确认接收前的预算错误保留输入，不进入未知结果查询
// 入参：无
// 返回：预算拒绝触发重复查询、丢失输入或假生成时失败
test('budget rejections preserve question without unknown-result recovery', async () => {
  for (const code of [5011, 5012]) {
    let lookups = 0
    const chat = loadChat(baseApi({
      streamChat: async () => { throw new ChatRequestError('输入或配置预算不足', 400, code) },
      getChatRequest: async () => { lookups += 1 },
    }))
    await chat.initialize()
    chat.state.current.draft = '保留原问题'
    await chat.sendMessage()
    assert.equal(chat.state.current.draft, '保留原问题')
    assert.equal(chat.state.current.pendingRequestId, null)
    assert.equal(lookups, 0)
  }
})
