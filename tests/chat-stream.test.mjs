import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/utils/chatStream.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { createEventDecoder } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

// 做什么：确认历史裁剪通知是普通提示事件，不是失败或终结事件
// 入参：无
// 返回：拒绝合法通知或修改其字段时失败
test('decodes context truncation notice before normal answer events', () => {
  const events = []
  const append = createEventDecoder(events.push.bind(events))
  append('event: context\ndata: {"message":"本次仅携带最近 2 轮","retained_rounds":2,"latest_round_omitted":false}\n\n')
  append('event: delta\ndata: {"content":"正常回答"}\n\n')
  assert.equal(events[0].event, 'context')
  assert.equal(events[0].payload.retained_rounds, 2)
  assert.equal(events[1].event, 'delta')
})

// 做什么：拒绝历史裁剪提示中不合法的轮数和互相矛盾的标记
// 入参：无
// 返回：坏字段通过验证时失败
test('rejects invalid context notice fields', () => {
  const payloads = [
    { message: '提示', retained_rounds: -1, latest_round_omitted: false },
    { message: '提示', retained_rounds: 1.5, latest_round_omitted: false },
    { message: '提示', retained_rounds: 2, latest_round_omitted: true },
  ]
  for (const payload of payloads) {
    const append = createEventDecoder(() => undefined)
    assert.throws(() => append(`event: context\ndata: ${JSON.stringify(payload)}\n\n`))
  }
})

// 做什么：验证中文、跨网络包和多个连续帧不会丢字
// 入参：Node 内置测试上下文
// 返回：断言失败时测试报错
test('decodes fragmented Chinese frames and multiple events', () => {
  const events = []
  const append = createEventDecoder(events.push.bind(events))
  append('event: delta\r')
  append('\ndata: {"content":"你')
  append('好"}\r\n\r\nevent: completed\ndata: {"assistant_id":2,"finish_reason":"stop"}\n\n')
  assert.equal(events.length, 2)
  assert.equal(events[0].payload.content, '你好')
  assert.equal(events[1].event, 'completed')
})

// 做什么：确认注释心跳不会变成消息
// 入参：无
// 返回：断言失败时测试报错
test('ignores comment frames and accepts protocol heartbeat', () => {
  const events = []
  const append = createEventDecoder(events.push.bind(events))
  append(': transport heartbeat\n\nevent: ping\ndata: {}\n\n')
  assert.deepEqual(events, [{ event: 'ping', payload: {} }])
})

// 做什么：拒绝供应商或代理返回的畸形业务事件
// 入参：无
// 返回：未抛异常则测试失败
test('rejects invalid event fields and unknown events', () => {
  const append = createEventDecoder(() => undefined)
  assert.throws(() => append('event: delta\ndata: {"content":7}\n\n'), /格式异常/)
  const another = createEventDecoder(() => undefined)
  assert.throws(() => another('event: tool\ndata: {}\n\n'), /格式异常/)
})

// 做什么：限制没有分隔符或过长的恶意帧
// 入参：无
// 返回：未限制时测试失败
test('bounds unterminated frame size', () => {
  const append = createEventDecoder(() => undefined)
  assert.throws(() => append('z'.repeat(100001)), /长度限制/)
})

