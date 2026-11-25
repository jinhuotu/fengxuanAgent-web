/** 知识库下拉的分页加载：取完总数或取满页数上限为止。 */
import type { KnowledgeBase } from '@/types/knowledge'

export interface KnowledgePage {
  items: KnowledgeBase[]
  total: number
}

export type KnowledgePageLoader = (page: number, pageSize: number) => Promise<KnowledgePage>

// 做什么：判断是否还需要再取一页
// 入参：已加载条数、总数、下一页页码、起始页码与页数上限
// 返回：还能取到新数据且未超过页数上限时为真
export function shouldLoadNextPage(loaded: number, total: number, page: number, firstPage: number, maxPages: number): boolean {
  return loaded < total && page - firstPage < maxPages
}

// 做什么：按需翻页取知识库，直到取完或达到页数上限
// 入参：分页取数函数、每页条数与页数上限
// 返回：已加载的条目与“是否还有未展示的库”标记
export async function loadKnowledgeBasePages(
  loader: KnowledgePageLoader, pageSize: number, maxPages: number,
): Promise<{ items: KnowledgeBase[]; truncated: boolean }> {
  const items: KnowledgeBase[] = []
  let total = 0
  let page = 1
  let loadedPages = 0
  while (loadedPages < maxPages) {
    const result = await loader(page, pageSize)
    items.push(...result.items)
    total = result.total
    loadedPages += 1
    if (!result.items.length || !shouldLoadNextPage(items.length, total, page + 1, 1, maxPages)) break
    page += 1
  }
  return { items, truncated: items.length < total }
}
