/**
 * 给助手回答用的轻量 Markdown 渲染器（不引入第三方依赖）。
 *
 * 设计取舍：
 * 1. 先转义原文，再只生成下面这些固定标签：p、h1~h3、ul/ol/li、strong、em、code、pre、blockquote、hr、a。
 *    因为浏览器拿不到任何来自模型的尖括号，v-html 不会执行模型输出里的"标签"。
 * 2. 支持的语法刻意比通用 Markdown 少：标题最多三级、列表不嵌套、链接只允许 http/https。
 *    少支持一点，换来规则可穷举、好测试、出错时只是"没渲染"，不会渲染出奇怪结构。
 * 3. 流式输出时末尾可能是半截语法（例如只有开头一个 `**`），这里一律当普通文字处理，
 *    等下一段补齐后再变成粗体，不会出现整段消失。
 */

// 做什么：把一段模型输出转成可安全塞进 v-html 的 HTML
// 入参：原始文本；options.cursor 为 true 时在最后一个块内插入流式光标
// 返回：只含白名单标签的 HTML 字符串
export function renderMarkdown(source: string, options: { cursor?: boolean } = {}): string {
  const html = renderBlocks(String(source ?? '').replace(/\r\n?/g, '\n'))
  return options.cursor ? appendCursor(html) : html
}

// 做什么：逐行识别块级语法
// 入参：已统一换行的原文
// 返回：块级 HTML
function renderBlocks(text: string): string {
  const blocks: string[] = []
  let paragraph: string[] = []
  let listTag: 'ul' | 'ol' | null = null
  let listItems: string[] = []
  let quoteLines: string[] = []
  let fenceLines: string[] | null = null
  let fenceLanguage = ''

  const flushParagraph = (): void => {
    if (!paragraph.length) return
    blocks.push(`<p>${renderInline(paragraph.join('\n'))}</p>`)
    paragraph = []
  }

  const flushList = (): void => {
    if (!listTag) return
    blocks.push(`<${listTag}>${listItems.join('')}</${listTag}>`)
    listTag = null
    listItems = []
  }

  const flushQuote = (): void => {
    if (!quoteLines.length) return
    blocks.push(`<blockquote>${renderInline(quoteLines.join('\n'))}</blockquote>`)
    quoteLines = []
  }

  const flushAll = (): void => {
    flushParagraph()
    flushList()
    flushQuote()
  }

  for (const line of text.split('\n')) {
    // 代码块内部原样保留，直到遇到收尾的三反引号；没等到收尾也按代码块展示
    if (fenceLines !== null) {
      if (/^\s*```/.test(line)) {
        const code = escapeHtml(fenceLines.join('\n'))
        const language = fenceLanguage ? ` class="language-${fenceLanguage}"` : ''
        blocks.push(`<pre><code${language}>${code}</code></pre>`)
        fenceLines = null
        fenceLanguage = ''
      } else {
        fenceLines.push(line)
      }
      continue
    }

    const trimmed = line.trim()

    // 空行：结束当前段落、列表和引用
    if (!trimmed) {
      flushAll()
      continue
    }

    const fence = /^(```+)(.*)$/.exec(trimmed)
    if (fence) {
      flushAll()
      fenceLines = []
      // 语言名只留字母数字和 +#-.，避免拼进 class 时带出引号
      fenceLanguage = fence[2].trim().replace(/[^a-z0-9+#.-]/gi, '').toLowerCase()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushAll()
      const level = Math.min(heading[1].length, 3)
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      continue
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushAll()
      blocks.push('<hr>')
      continue
    }

    const quoted = /^>\s?(.*)$/.exec(trimmed)
    if (quoted) {
      flushParagraph()
      flushList()
      quoteLines.push(quoted[1])
      continue
    }

    const unordered = /^[-*+]\s+(.*)$/.exec(trimmed)
    const ordered = /^\d+\.\s+(.*)$/.exec(trimmed)
    if (unordered || ordered) {
      flushParagraph()
      flushQuote()
      const wanted: 'ul' | 'ol' = unordered ? 'ul' : 'ol'
      if (listTag && listTag !== wanted) flushList()
      listTag = wanted
      listItems.push(`<li>${renderInline((unordered ?? ordered)![1])}</li>`)
      continue
    }

    // 普通文字：先结束列表和引用，再并入当前段落
    flushList()
    flushQuote()
    paragraph.push(trimmed)
  }

  // 文本结束时：未收尾的代码块、段落、列表、引用都要落地
  if (fenceLines !== null) {
    const code = escapeHtml(fenceLines.join('\n'))
    const language = fenceLanguage ? ` class="language-${fenceLanguage}"` : ''
    blocks.push(`<pre><code${language}>${code}</code></pre>`)
  }
  flushAll()
  return blocks.join('\n')
}

// 做什么：处理段落内部的粗体、斜体、行内代码和链接
// 入参：一段已转义的纯文本（可能含换行）
// 返回：行内标签拼好的 HTML
function renderInline(text: string): string {
  const escaped = escapeHtml(text)
  const codes: string[] = []

  // 先把行内代码摘出来换成占位符，避免里面的 ** 被当成粗体
  let output = escaped.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    codes.push(code)
    return `\u0000${codes.length - 1}\u0000`
  })

  // 链接只接受 http/https；其他协议（javascript:、data:）保持原样文字
  output = output.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_match, label: string, url: string) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)

  output = output.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  output = output.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  // 段内单个换行在中文回答里通常表示"换行写"，保留成 <br> 更接近原样
  output = output.replace(/\n/g, '<br>')

  return output.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => `<code>${codes[Number(index)]}</code>`)
}

// 做什么：在最后一个块结束标签前插入流式光标
// 入参：已生成的 HTML
// 返回：插好光标的 HTML；空内容时只返回光标
function appendCursor(html: string): string {
  const cursor = '<span class="md-cursor" aria-hidden="true"></span>'
  const tail = /(<\/[a-z0-9]+>)\s*$/.exec(html)
  if (!tail) return html + cursor
  const position = html.lastIndexOf(tail[1])
  return `${html.slice(0, position)}${cursor}${html.slice(position)}`
}

// 做什么：转义 HTML 特殊字符
// 入参：任意文本
// 返回：可以安全放进 HTML 正文与属性值的文本
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
