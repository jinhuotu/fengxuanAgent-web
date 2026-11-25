import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/utils/knowledgePages.ts', import.meta.url), 'utf8')
const module = {}
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(module)
const { loadKnowledgeBasePages, shouldLoadNextPage } = module

// 做什么：造一个按页返回固定数据的假分页接口
// 入参：总数、每页应返回的条数
// 返回：取数函数与调用记录
function fakeLoader(total, itemsPerPage) {
  const calls = []
  const loader = async (page, pageSize) => {
    calls.push([page, pageSize])
    const start = (page - 1) * pageSize
    const count = Math.max(0, Math.min(itemsPerPage, total - start))
    return { items: Array.from({ length: count }, (_, index) => ({ id: start + index + 1, name: `库${start + index + 1}` })), total }
  }
  return { loader, calls }
}

// 做什么：确认一页就取完时不再多翻
// 入参：总数小于每页条数
// 返回：调用次数不为 1 或标记被截断时断言失败
test('loads a single page without extra requests', async () => {
  const { loader, calls } = fakeLoader(3, 50)
  const result = await loadKnowledgeBasePages(loader, 50, 4)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], [1, 50])
  assert.equal(result.items.length, 3)
  assert.equal(result.truncated, false)
})

// 做什么：确认按 total 翻到最后一页为止
// 入参：总数 120、每页 50
// 返回：少取或多取一页时断言失败
test('pages until the total is covered', async () => {
  const { loader, calls } = fakeLoader(120, 50)
  const result = await loadKnowledgeBasePages(loader, 50, 4)
  assert.equal(calls.length, 3)
  assert.equal(result.items.length, 120)
  assert.equal(result.truncated, false)
})

// 做什么：确认超过页数上限时停止并标记未完整展示
// 入参：总数 500、每页 50、上限 4 页
// 返回：取到第 5 页或漏标记时断言失败
test('stops at the page cap and flags truncation', async () => {
  const { loader, calls } = fakeLoader(500, 50)
  const result = await loadKnowledgeBasePages(loader, 50, 4)
  assert.equal(calls.length, 4)
  assert.deepEqual(calls.map((call) => call[0]), [1, 2, 3, 4])
  assert.equal(result.items.length, 200)
  assert.equal(result.truncated, true)
})

// 做什么：确认后端返回空页时立即停止，不空转
// 入参：total 申报 60 但每页返回 0 条
// 返回：继续翻页或死循环时断言失败
test('stops on an empty page even if total claims more', async () => {
  const { loader, calls } = fakeLoader(60, 0)
  const result = await loadKnowledgeBasePages(loader, 50, 4)
  assert.equal(calls.length, 1)
  assert.equal(result.items.length, 0)
  assert.equal(result.truncated, true)
})

// 做什么：确认翻页判断本身在上限与总数两个条件上都生效
// 入参：两组边界数值
// 返回：任一条件被忽略时断言失败
test('should load next page respects total and page cap', () => {
  assert.equal(shouldLoadNextPage(50, 120, 2, 1, 4), true)
  assert.equal(shouldLoadNextPage(150, 500, 4, 1, 4), true)
  assert.equal(shouldLoadNextPage(120, 120, 2, 1, 4), false)
  assert.equal(shouldLoadNextPage(200, 500, 5, 1, 4), false)
})
