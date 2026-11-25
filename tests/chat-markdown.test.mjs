import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/utils/markdown.ts', import.meta.url), 'utf8')
const exported = {}
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exported)
const { renderMarkdown } = exported

// 做什么：确认模型输出里的 HTML 不会进入页面结构
// 入参：包含 script 标签、属性注入和普通文字的原文
// 返回：出现真实标签或未转义尖括号时失败
test('escapes raw html from the model', () => {
  const html = renderMarkdown('<script>alert(1)</script><b onclick="x">粗</b>')
  assert.doesNotMatch(html, /<script|<b>|<b\s|<img/i)
  assert.match(html, /&lt;script&gt;/)
})

// 做什么：确认常用行内语法只产出白名单标签
// 入参：加粗、斜体、行内代码混排的一行
// 返回：标签缺失或出现其他标签时失败
test('renders bold, italic and inline code', () => {
  const html = renderMarkdown('结论是 **先做检索**，再写 *答案*，命令 `alembic current`。')
  assert.match(html, /<p>结论是 <strong>先做检索<\/strong>，再写 <em>答案<\/em>，命令 <code>alembic current<\/code>。<\/p>/)
})

// 做什么：确认行内代码里的星号不会被当粗体
// 入参：反引号包住的 ** 字符
// 返回：代码内容被渲染成 strong 时失败
test('keeps markdown characters inside inline code literal', () => {
  const html = renderMarkdown('输入 `**不要加粗**` 保持原样')
  assert.match(html, /<code>\*\*不要加粗\*\*<\/code>/)
  assert.doesNotMatch(html, /<strong>/)
})

// 做什么：确认标题、列表、引用和分隔线各自成块
// 入参：一段混合块级语法
// 返回：块级标签缺失或嵌套错误时失败
test('renders headings, lists, quote and rule', () => {
  const html = renderMarkdown('## 步骤\n\n1. 建库\n2. 上传文档\n\n- 注意事项\n\n> 引用一句原文\n\n---\n')
  assert.match(html, /<h2>步骤<\/h2>/)
  assert.match(html, /<ol><li>建库<\/li><li>上传文档<\/li><\/ol>/)
  assert.match(html, /<ul><li>注意事项<\/li><\/ul>/)
  assert.match(html, /<blockquote>引用一句原文<\/blockquote>/)
  assert.match(html, /<hr>/)
})

// 做什么：确认代码块原样保留并按语言标 class
// 入参：带语言名的 fenced code
// 返回：代码被转义为普通文本、行数丢失或语言越界时失败
test('renders fenced code blocks with language class', () => {
  const html = renderMarkdown('```py\nprint("<hi>")\n```')
  assert.match(html, /<pre><code class="language-py">print\(&quot;&lt;hi&gt;&quot;\)<\/code><\/pre>/)
})

// 做什么：确认流式输出中未闭合的代码块也能先展示
// 入参：只有开头的 fenced code
// 返回：内容丢失或残留反引号时失败
test('renders an unterminated fence during streaming', () => {
  const html = renderMarkdown('```js\nconst a = 1')
  assert.match(html, /<pre><code class="language-js">const a = 1<\/code><\/pre>/)
})

// 做什么：确认链接只接受 http/https
// 入参：一个正常链接和一个 javascript 链接
// 返回：危险协议被渲染成 a 标签时失败
test('only allows http and https links', () => {
  const html = renderMarkdown('[文档](https://example.com/a?b=1) 和 [坏链](javascript:alert(1))')
  assert.match(html, /<a href="https:\/\/example.com\/a\?b=1" target="_blank" rel="noopener noreferrer">文档<\/a>/)
  assert.doesNotMatch(html, /<a [^>]*javascript:/)
})

// 做什么：确认流式光标插在最后一个块内而不是掉到块外
// 入参：一句话加 cursor 选项
// 返回：光标不在段落内部时失败
test('injects the streaming cursor inside the last block', () => {
  const html = renderMarkdown('正在写', { cursor: true })
  assert.match(html, /正在写<span class="md-cursor" aria-hidden="true"><\/span><\/p>/)
  assert.doesNotMatch(renderMarkdown('写完', { cursor: false }), /md-cursor/)
})

// 做什么：确认半截粗体标记不会吞掉后面的文字
// 入参：只有一个 ** 开头、没有收尾的一行
// 返回：正文丢失或出现空 strong 时失败
test('leaves unclosed emphasis markers as plain text', () => {
  const html = renderMarkdown('结论 **还没写完')
  assert.match(html, /结论 \*\*还没写完/)
  assert.doesNotMatch(html, /<strong>/)
})
