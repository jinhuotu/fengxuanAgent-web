/** 本人知识库、文档与会话选库接口。 */
import http from '@/api/http'
import type { ApiResponse } from '@/types/api'
import type { ChatSession } from '@/types/chat'
import type {
  KnowledgeBase, KnowledgeBaseCreate, KnowledgeBaseDeleteResult, KnowledgeChunkDetail, KnowledgeChunkPage,
  KnowledgeDocument, KnowledgeDocumentCreate, KnowledgeDocumentDeleteResult, KnowledgeFileType, KnowledgePage,
} from '@/types/knowledge'

const KNOWLEDGE_BASES_PATH = '/knowledge-bases'
const KNOWLEDGE_CHUNKS_PATH = '/knowledge-chunks'
const CHAT_SESSIONS_PATH = '/chat/sessions'
const DOCUMENTS_PATH = '/documents'
const FILE_PATH = '/file'
const FILE_TYPES_PATH = '/file-types'
const CHUNKS_PATH = '/chunks'
const MANAGEMENT_REQUEST = { suppressErrorMessage: true, redirectOnUnauthorized: true }
const FILE_UPLOAD_TIMEOUT_MS = 60000

// 做什么：分页读取本人可用的知识库
// 入参：从一开始的页码、每页条数及是否在登录失效时统一跳转
// 返回：知识库分页；失败交给页面展示
export async function listKnowledgeBases(
  page: number, pageSize: number, redirectOnUnauthorized = false,
): Promise<KnowledgePage<KnowledgeBase>> {
  const response = await http.get<ApiResponse<KnowledgePage<KnowledgeBase>>>(KNOWLEDGE_BASES_PATH, {
    params: { page, page_size: pageSize }, suppressErrorMessage: true, redirectOnUnauthorized,
  })
  return response.data.data
}

// 做什么：读取后端真实支持的文件类型，供上传区渲染类型卡片
// 入参：无
// 返回：类型编号、名称、后缀、是否启用与未启用说明
export async function listKnowledgeFileTypes(): Promise<KnowledgeFileType[]> {
  const response = await http.get<ApiResponse<KnowledgeFileType[]>>(
    `${KNOWLEDGE_BASES_PATH}${FILE_TYPES_PATH}`, MANAGEMENT_REQUEST,
  )
  return response.data.data
}

// 做什么：建立一个本人的知识库
// 入参：已校验的名称和可空说明
// 返回：新库的公开字段；失败抛给页面
export async function createKnowledgeBase(payload: KnowledgeBaseCreate): Promise<KnowledgeBase> {
  const response = await http.post<ApiResponse<KnowledgeBase>>(KNOWLEDGE_BASES_PATH, payload, MANAGEMENT_REQUEST)
  return response.data.data
}

// 做什么：分页读取指定知识库的文档
// 入参：知识库编号、页码及每页条数
// 返回：文档分页；库不存在或请求失败时抛出错误
export async function listKnowledgeDocuments(
  id: number, page: number, pageSize: number,
): Promise<KnowledgePage<KnowledgeDocument>> {
  const response = await http.get<ApiResponse<KnowledgePage<KnowledgeDocument>>>(
    `${KNOWLEDGE_BASES_PATH}/${id}${DOCUMENTS_PATH}`,
    { ...MANAGEMENT_REQUEST, params: { page, page_size: pageSize } },
  )
  return response.data.data
}

// 做什么：把用户输入的纯文本交给后端保存与切分
// 入参：知识库编号、文档标题和原始正文
// 返回：已保存文档的公开字段；失败抛给页面
export async function uploadKnowledgeDocument(id: number, payload: KnowledgeDocumentCreate): Promise<KnowledgeDocument> {
  const response = await http.post<ApiResponse<KnowledgeDocument>>(
    `${KNOWLEDGE_BASES_PATH}/${id}${DOCUMENTS_PATH}`, payload, MANAGEMENT_REQUEST,
  )
  return response.data.data
}

// 做什么：将单个文件发给后端解析
// 入参：知识库编号和浏览器所选文件
// 返回：已入库的文档；请求错误交给上传入口展示
export async function uploadKnowledgeDocumentFile(id: number, file: File): Promise<KnowledgeDocument> {
  const body = new FormData()
  // 新手注意：FormData 像带标签的信封，浏览器根据字段自动设置 multipart 边界。
  body.append('file', file)
  const response = await http.post<ApiResponse<KnowledgeDocument>>(
    `${KNOWLEDGE_BASES_PATH}/${id}${DOCUMENTS_PATH}${FILE_PATH}`, body,
    { ...MANAGEMENT_REQUEST, timeout: FILE_UPLOAD_TIMEOUT_MS },
  )
  return response.data.data
}

// 做什么：删除本人的知识库并读取级联影响数量
// 入参：知识库编号
// 返回：删除文档和切片数及清空的会话数；失败抛给页面
export async function deleteKnowledgeBase(id: number): Promise<KnowledgeBaseDeleteResult> {
  const response = await http.delete<ApiResponse<KnowledgeBaseDeleteResult>>(
    `${KNOWLEDGE_BASES_PATH}/${id}`, MANAGEMENT_REQUEST,
  )
  return response.data.data
}

// 做什么：删除指定知识库的一篇文档及其切片
// 入参：知识库编号和文档编号
// 返回：文档编号和删除的切片数；失败抛给页面
export async function deleteKnowledgeDocument(id: number, documentId: number): Promise<KnowledgeDocumentDeleteResult> {
  const response = await http.delete<ApiResponse<KnowledgeDocumentDeleteResult>>(
    `${KNOWLEDGE_BASES_PATH}/${id}${DOCUMENTS_PATH}/${documentId}`, MANAGEMENT_REQUEST,
  )
  return response.data.data
}

// 做什么：分页读取文档的原文切片
// 入参：知识库编号、文档编号、页码和每页条数
// 返回：包含正文和偏移的切片页；失败抛给页面
export async function listKnowledgeDocumentChunks(
  id: number, documentId: number, page: number, pageSize: number,
): Promise<KnowledgeChunkPage> {
  const response = await http.get<ApiResponse<KnowledgeChunkPage>>(
    `${KNOWLEDGE_BASES_PATH}/${id}${DOCUMENTS_PATH}/${documentId}${CHUNKS_PATH}`,
    { ...MANAGEMENT_REQUEST, params: { page, page_size: pageSize } },
  )
  return response.data.data
}

// 做什么：按全局编号读取一条对话引用的原文
// 入参：引用的切片编号
// 返回：切片正文、文档标题及原文偏移；失败抛给页面处理
export async function getKnowledgeChunk(chunkId: number): Promise<KnowledgeChunkDetail> {
  const response = await http.get<ApiResponse<KnowledgeChunkDetail>>(
    `${KNOWLEDGE_CHUNKS_PATH}/${chunkId}`, MANAGEMENT_REQUEST,
  )
  return response.data.data
}

// 做什么：保存指定会话的知识库选择
// 入参：会话编号和知识库编号，null 表示清除
// 返回：后端确认的会话；失败抛给页面处理
export async function updateSessionKnowledgeBase(sessionId: number, knowledgeBaseId: number | null): Promise<ChatSession> {
  const response = await http.put<ApiResponse<ChatSession>>(
    `${CHAT_SESSIONS_PATH}/${sessionId}/knowledge-base`,
    { knowledge_base_id: knowledgeBaseId },
    { suppressErrorMessage: true },
  )
  return response.data.data
}
