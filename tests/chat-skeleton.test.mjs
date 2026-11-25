import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as vue from 'vue'
import * as serverRenderer from 'vue/server-renderer'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'

const [tableSource, historySource] = await Promise.all([
  readFile(new URL('../src/components/SkeletonTable.vue', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/ChatHistorySkeleton.vue', import.meta.url), 'utf8'),
])

// 做什么：把单文件组件编译成可在 Node 里渲染的组件
// 入参：源码与测试用 id
// 返回：组件定义
function loadComponent(source, id) {
  const compiled = compileScript(parse(source).descriptor,
    { id, inlineTemplate: true, templateOptions: { ssr: true } })
  const exported = {}
  new Function('require', 'exports', ts.transpileModule(compiled.content,
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(
    (name) => ({ vue, 'vue/server-renderer': serverRenderer })[name], exported)
  return exported.default
}

// 做什么：用 SSR 渲染组件
// 入参：组件与属性
// 返回：HTML
function render(component, props) {
  return serverRenderer.renderToString(vue.createSSRApp({ render: () => vue.h(component, props) }))
}

// 做什么：确认骨架表按行列数画出占位，并有读屏文案
// 入参：自定 4 行 3 列
// 返回：行数不对或缺 aria-label 时失败
test('renders the requested number of skeleton rows', async () => {
  const html = await render(loadComponent(tableSource, 'skeleton-table-test'), { rows: 4, columns: 3 })
  assert.match(html, /role="status"/)
  assert.match(html, /aria-label="正在加载列表"/)
  assert.equal((html.match(/class="skeleton-row/g) || []).length, 5)
  assert.equal((html.match(/wide skeleton-cell|skeleton-cell wide/g) || []).length, 4)
})

// 做什么：确认对话骨架按回答组数画头像和横条
// 入参：3 组
// 返回：组数不对或缺少无障碍文案时失败
test('renders chat history skeleton groups', async () => {
  const html = await render(loadComponent(historySource, 'history-skeleton-test'), { groups: 3 })
  assert.match(html, /aria-label="正在加载历史消息"/)
  assert.equal((html.match(/class="skeleton-group"/g) || []).length, 3)
  assert.equal((html.match(/skeleton-line[ "]/g) || []).length, 9)
})
