import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/utils/knowledgeView.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { buildKnowledgeOptions, referenceTitle } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

const knowledgeBases = [
  { id: 3, name: '工艺标准', description: null, document_count: 12, created_at: '2026-11-24T10:00:00' },
  { id: 4, name: '工艺备忘', description: null, document_count: 0, created_at: '2026-11-24T10:00:00' },
]

// 做什么：验证下拉同时显示库名与包括零在内的文档数
// 入参：两条库记录和仍可用的选中编号
// 返回：选项不符时断言失败
test('builds knowledge options with document counts', () => {
  assert.deepEqual(buildKnowledgeOptions(knowledgeBases, 3), {
    options: [{ value: 3, label: '工艺标准（12 篇）' }, { value: 4, label: '工艺备忘（0 篇）' }],
    orphan: false,
  })
})

// 做什么：识别当前选中的库已不在可用列表
// 入参：两条库记录和未知库编号
// 返回：失效标记不符时断言失败
test('marks a missing selection as orphaned', () => {
  assert.equal(buildKnowledgeOptions(knowledgeBases, 99).orphan, true)
  assert.deepEqual(buildKnowledgeOptions([], 99), { options: [], orphan: true })
})

// 做什么：区分尚无可选库与已经选择过却失效的库
// 入参：空列表和没有选择的会话
// 返回：出现选项或误报失效时断言失败
test('keeps an empty library list unselected', () => {
  assert.deepEqual(buildKnowledgeOptions([], null), { options: [], orphan: false })
})

// 做什么：检查参考资料数量标题
// 入参：零条和三条引用
// 返回：文案或标点不符时断言失败
test('formats reference titles with the citation count', () => {
  assert.equal(referenceTitle(0), '参考资料（0）')
  assert.equal(referenceTitle(3), '参考资料（3）')
})
