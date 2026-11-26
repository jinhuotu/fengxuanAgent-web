import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/utils/knowledgeStatus.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { documentStatusLabel, formatDocumentCount, formatChunkSpan, formatChunkCount, countKnowledgeCharacters } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

// 做什么：验证四个处理中状态各有文案且保持弱化样式
// 入参：状态编号一到四
// 返回：任何编号的文字或颜色不符时断言失败
test('maps all processing statuses to the pending tone', () => {
  assert.deepEqual([1, 2, 3, 4].map(documentStatusLabel), [
    { text: '待切分', tone: 'pending' },
    { text: '解析中', tone: 'pending' },
    { text: '切分中', tone: 'pending' },
    { text: '建索引中', tone: 'pending' },
  ])
})

// 做什么：区分可检索和处理失败
// 入参：状态编号五和六
// 返回：文案或颜色不符时断言失败
test('maps ready and failed to distinct labels and tones', () => {
  assert.deepEqual(documentStatusLabel(5), { text: '可检索', tone: 'ready' })
  assert.deepEqual(documentStatusLabel(6), { text: '处理失败', tone: 'failed' })
})

// 做什么：检查未知状态能够继续渲染
// 入参：零、大于已知范围的值和负数
// 返回：抛异常或返回错误的默认文案时断言失败
test('keeps unknown status values readable', () => {
  for (const status of [0, 7, -1]) {
    assert.deepEqual(documentStatusLabel(status), { text: '未知状态', tone: 'pending' })
  }
})

// 做什么：检查空库和有文档的库均展示篇数单位
// 入参：零篇和三篇
// 返回：数量文案不符时断言失败
test('formats counts with the document unit', () => {
  assert.equal(formatDocumentCount(0), '0 篇')
  assert.equal(formatDocumentCount(3), '3 篇')
})

// 做什么：验证原文偏移以区间形式展示
// 入参：起点非零且结束位置较大的切片
// 返回：区间文案不符时断言失败
test('formats a regular chunk span', () => {
  assert.equal(formatChunkSpan({ char_start: 450, char_end: 950 }), '字符 450–950')
})

// 做什么：确认首段可以从字符零开始
// 入参：起点为零的有效区间
// 返回：把零当作异常时断言失败
test('keeps a zero-based chunk span', () => {
  assert.equal(formatChunkSpan({ char_start: 0, char_end: 568 }), '字符 0–568')
})

// 做什么：确认无效偏移有可读文案
// 入参：相同位置、逆序和负数区间
// 返回：抛出异常或文案不符时断言失败
test('labels invalid chunk spans', () => {
  assert.equal(formatChunkSpan({ char_start: 1, char_end: 1 }), '字符区间异常')
  assert.equal(formatChunkSpan({ char_start: 2, char_end: 1 }), '字符区间异常')
  assert.equal(formatChunkSpan({ char_start: -1, char_end: 1 }), '字符区间异常')
  assert.equal(formatChunkSpan({ char_start: 0, char_end: -1 }), '字符区间异常')
})

// 做什么：验证抽屉标题对空文档和多段文档的段数文案
// 入参：零段和十二段
// 返回：段数或单位不符时断言失败
test('formats the total chunk count', () => {
  assert.equal(formatChunkCount(0), '共 0 段')
  assert.equal(formatChunkCount(12), '共 12 段')
})

// 做什么：确认字数按完整字符计数，占两个位置的字符不会被算成两个字
// 入参：空文本、纯中文、带表情和带扩展区汉字的文本
// 返回：计数与肉眼看到的字符数不一致时断言失败
test('counts characters instead of UTF-16 code units', () => {
  assert.equal(countKnowledgeCharacters(''), 0)
  assert.equal(countKnowledgeCharacters('知识库'), 3)
  assert.equal(countKnowledgeCharacters('简历😀'), 3)
  assert.equal(countKnowledgeCharacters('古文𠀀'), 3)
})
