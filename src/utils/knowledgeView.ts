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
