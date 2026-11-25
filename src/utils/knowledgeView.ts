/** 知识库下拉选项及引用标题。 */
import type { KnowledgeBase } from '@/types/knowledge'

// 做什么：生成带文档数的选项并识别已失效的选中库
// 入参：本人知识库列表及当前会话所选的库编号
// 返回：下拉选项与失效标记；无选择时不标记失效
export function buildKnowledgeOptions(bases: KnowledgeBase[], currentId: number | null | undefined) {
  const options = bases.map((base) => ({ value: base.id, label: `${base.name}（${base.document_count} 篇）` }))
  const orphan = currentId != null && !bases.some((base) => base.id === currentId)
  return { options, orphan }
}

// 做什么：格式化参考资料的数量标题
// 入参：当前回答的引用条数
// 返回：带中文括号的标题
export function referenceTitle(count: number): string {
  return `参考资料（${count}）`
}

// 做什么：格式化引用的原始相关度分数
// 入参：引用事件提供的分数
// 返回：小于一用三位有效数字，其余保留两位小数；无效分数返回破折号
export function referenceScoreLabel(score: number): string {
  if (!Number.isFinite(score) || score <= 0) return '—'
  return score < 1 ? score.toPrecision(3) : score.toFixed(2)
}
