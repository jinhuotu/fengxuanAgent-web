/** 知识库表格使用的状态与文案。 */
type DocumentStatusTone = 'ready' | 'pending' | 'failed'
type DocumentStatusLabel = { text: string; tone: DocumentStatusTone }

const documentStatuses: Partial<Record<number, DocumentStatusLabel>> = {
  1: { text: '待切分', tone: 'pending' },
  2: { text: '解析中', tone: 'pending' },
  3: { text: '切分中', tone: 'pending' },
  4: { text: '建索引中', tone: 'pending' },
  5: { text: '可检索', tone: 'ready' },
  6: { text: '处理失败', tone: 'failed' },
}

// 做什么：把后端数字状态转成可读文字和展示颜色
// 入参：文档的数字状态
// 返回：状态文字和颜色；未知值使用弱化样式
export function documentStatusLabel(status: number): DocumentStatusLabel {
  return documentStatuses[status] ?? { text: '未知状态', tone: 'pending' }
}

// 做什么：为库的文档数加上单位
// 入参：文档数量
// 返回：带篇数单位的文案
export function formatDocumentCount(count: number): string {
  return `${count} 篇`
}

// 做什么：为原文切片显示字符起止位置
// 入参：切片的起点和终点
// 返回：字符区间文案；负数、非整数或终点未超出起点时显示异常
export function formatChunkSpan(chunk: { char_start: number; char_end: number }): string {
  const { char_start: start, char_end: end } = chunk
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
    return '字符区间异常'
  }
  return `字符 ${start}–${end}`
}

// 做什么：格式化原文抽屉的切片总数
// 入参：接口返回的总段数
// 返回：带段数单位的文案
export function formatChunkCount(count: number): string {
  return `共 ${count} 段`
}

// 做什么：显示服务器返回的日期和小时分钟
// 入参：服务器的 ISO 时间字符串
// 返回：日期加空格和时分
export function formatKnowledgeTime(isoTime: string): string {
  return isoTime.replace('T', ' ').slice(0, 16)
}

// 做什么：按 Unicode 字符计算已经输入的长度
// 入参：需要计数的原文，包含空白
// 返回：字符数，不修改原文
export function countKnowledgeCharacters(content: string): number {
  // 新手注意：按完整字符计数，表情不会因占两个 UTF-16 位置而算成两个字。
  return Array.from(content).length
}
