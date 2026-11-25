import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/utils/chatScroll.ts', import.meta.url), 'utf8')
const exported = {}
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exported)
const { isNearBottom, FOLLOW_THRESHOLD_PX } = exported

// 做什么：确认停在底部时继续跟随新内容
// 入参：内容高度 1000、已滚到 400、可视高 600（差值 0）
// 返回：判定为未在底部时失败
test('treats the exact bottom as following', () => {
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 400, clientHeight: 600 }), true)
})

// 做什么：确认阈值内仍算跟随，超出阈值就停止跟随
// 入参：两组距离底部 150 与 300 的数值
// 返回：阈值边界判断错误时失败
test('follows within the threshold and stops beyond it', () => {
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 250, clientHeight: 600 }), true)
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 600 }), false)
  assert.equal(FOLLOW_THRESHOLD_PX, 160)
})

// 做什么：确认内容还没撑满可视区时也不会误判成"用户上翻了"
// 入参：内容高度等于可视高度的空对话
// 返回：判定为不跟随时失败
test('follows when the content is shorter than the viewport', () => {
  assert.equal(isNearBottom({ scrollHeight: 600, scrollTop: 0, clientHeight: 600 }), true)
})
