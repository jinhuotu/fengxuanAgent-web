/** 知识库与文档的公开响应和写入请求。 */
export interface KnowledgeBase {
  id: number
  name: string
  description: string | null
  document_count: number
  created_at: string
}

export interface KnowledgeDocument {
  id: number
  title: string
  char_count: number
  status: number
  created_at: string
}

export interface KnowledgePage<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface KnowledgeChunk {
  id: number
  chunk_index: number
  heading_path: string
  char_start: number
  char_end: number
  content: string
}

export type KnowledgeChunkPage = KnowledgePage<KnowledgeChunk>

export interface KnowledgeBaseDeleteResult {
  id: number
  deleted_documents: number
  deleted_chunks: number
  cleared_sessions: number
}

export interface KnowledgeDocumentDeleteResult {
  id: number
  deleted_chunks: number
}

export interface KnowledgeBaseCreate {
  name: string
  description: string | null
}

export interface KnowledgeDocumentCreate {
  title: string
  content: string
}
