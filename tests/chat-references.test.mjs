import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as vue from 'vue'
import * as serverRenderer from 'vue/server-renderer'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ElButton } from 'element-plus'
import ts from 'typescript'

const [source, knowledgeSource, referenceResolverSource, markdownSource] = await Promise.all([
  readFile(new URL('../src/components/ChatMessageItem.vue', import.meta.url), 'utf8'),
  readFile(new URL('../src/utils/knowledgeView.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/utils/chatReferences.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/utils/markdown.ts', import.meta.url), 'utf8'),
])
const compiled = compileScript(parse(source).descriptor, {
  id: 'chat-references-test', inlineTemplate: true, templateOptions: { ssr: true },
})
const compilerOptions = { module: ts.ModuleKind.CommonJS }
const knowledgeModule = {}
new Function('exports', ts.transpileModule(knowledgeSource, { compilerOptions }).outputText)(knowledgeModule)
const referenceResolverModule = {}
new Function('exports', ts.transpileModule(referenceResolverSource, { compilerOptions }).outputText)(referenceResolverModule)
const { resolveMessageReferences } = referenceResolverModule
const markdownModule = {}
new Function('exports', ts.transpileModule(markdownSource, { compilerOptions }).outputText)(markdownModule)
const componentModule = {}
const modules = { vue, 'vue/server-renderer': serverRenderer, '@/utils/knowledgeView': knowledgeModule, '@/utils/markdown': markdownModule }
new Function('require', 'exports', ts.transpileModule(compiled.content, { compilerOptions }).outputText)(
  (name) => modules[name], componentModule,
)
const references = [
  { index: 1, chunk_id: 18, document_id: 3, heading_path: '工艺手册 > 第1段', char_start: 0, char_end: 12, score: 2.17 },
  { index: 2, chunk_id: 19, document_id: 4, heading_path: '操作规范 > 第3段', char_start: 12, char_end: 30, score: 1.25 },
]

// 做什么：用真实 Vue SSR 渲染指定角色的消息
// 入参：消息角色和可省略的引用条目
// 返回：和实际组件相同的 HTML
async function renderMessage(role, referenceItems) {
  const message = { id: 1, request_id: 'reference-test', role, content: '按段记录温度。',
    status: 'completed', model: null, finish_reason: 'stop', error_code: null, created_at: '2026-11-24T10:00:00' }
  const props = referenceItems ? { message, references: referenceItems } : { message }
  return serverRenderer.renderToString(vue.createSSRApp({
    // 做什么：把本用例的属性交给原消息组件
    // 入参：无
    // 返回：消息组件的虚拟节点
    render: () => vue.h(componentModule.default, props),
  }).component('ElButton', ElButton))
}

// 做什么：确认助手引用标题、章节和默认折叠状态
// 入参：两条可展示的引用
// 返回：缺字段、显示分数或初始展开时断言失败
test('renders the citation count and both heading paths for an assistant', async () => {
  const html = await renderMessage('assistant', references)
  assert.match(html, /参考资料（2）/)
  assert.ok(html.includes('[1] 工艺手册 &gt; 第1段'))
  assert.ok(html.includes('[2] 操作规范 &gt; 第3段'))
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /class="reference-list"[^>]*style="display:none;?"/)
  assert.doesNotMatch(html, /2\.17|1\.25/)
})

// 做什么：确认没有引用的助手消息不占用引用区域
// 入参：未传引用的助手消息
// 返回：出现引用按钮时断言失败
test('omits the citation area when references are not provided', async () => {
  assert.doesNotMatch(await renderMessage('assistant'), /参考资料|reference-list/)
})

// 做什么：确认引用区域只属于助手消息
// 入参：故意传入两条引用的用户消息
// 返回：错误展示引用时断言失败
test('omits references from user messages even if provided', async () => {
  assert.doesNotMatch(await renderMessage('user', references), /参考资料|工艺手册|操作规范/)
})

// 做什么：验证有历史快照时直接回读助手消息自己的引用
// 入参：自带两条快照的助手消息和空的实时引用
// 返回：快照没有优先展示或用户消息返回引用时断言失败
test('prefers an assistant message reference snapshot', () => {
  const message = { role: 'assistant', request_id: 'saved-turn', references }
  assert.deepEqual(resolveMessageReferences(message, [], ''), references)
  assert.deepEqual(resolveMessageReferences(message, [references[0]], 'saved-turn'), references)
  assert.deepEqual(resolveMessageReferences({ ...message, role: 'user' }, references, 'saved-turn'), [])
})

// 做什么：验证旧结构与流式占位消息只读取与自己同轮的实时引用
// 入参：没有快照字段的助手消息和实时请求编号
// 返回：同轮引用丢失或引用串到另一轮时断言失败
test('uses live references only for the matching request', () => {
  const message = { role: 'assistant', request_id: 'live-turn' }
  assert.deepEqual(resolveMessageReferences(message, references, 'live-turn'), references)
  assert.deepEqual(resolveMessageReferences(message, references, 'another-turn'), [])
})
