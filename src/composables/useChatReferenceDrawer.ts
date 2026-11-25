/** 管理当前对话页的引用抽屉与请求顺序。 */
import { ElMessage } from 'element-plus'
import { onBeforeUnmount, reactive, watch } from 'vue'
import { getKnowledgeChunk } from '@/api/knowledge'
import { knowledgeNotFoundCode, knowledgeRequestMessage } from '@/composables/knowledgeManagement'
import type { ChatReference } from '@/types/chat'
import type { KnowledgeChunkDetail } from '@/types/knowledge'

const CHUNK_NOT_FOUND_CODE = 4003
type ReferencePreview = {
  visible: boolean
  loading: boolean
  error: string
  detail: KnowledgeChunkDetail | null
  score: number
}

// 做什么：清除旧内容并读取本次点击的切片
// 入参：抽屉状态、完整引用及请求是否还有效的判断函数
// 返回：无；失效引用提示后关闭，其他错误在抽屉中显示
async function loadReference(preview: ReferencePreview, reference: ChatReference, isCurrent: () => boolean): Promise<void> {
  preview.detail = null
  preview.error = ''
  preview.score = reference.score
  preview.loading = true
  preview.visible = true
  try {
    const detail = await getKnowledgeChunk(reference.chunk_id)
    if (isCurrent()) preview.detail = detail
  } catch (error) {
    if (!isCurrent()) return
    if (knowledgeNotFoundCode(error) === CHUNK_NOT_FOUND_CODE) {
      preview.loading = false
      preview.visible = false
      ElMessage.error('引用已失效或无权访问')
      return
    }
    preview.error = knowledgeRequestMessage(error, '加载引用原文失败，请稍后再试')
  } finally {
    if (isCurrent()) preview.loading = false
  }
}

// 做什么：给当前对话页创建引用抽屉，并在换会话或换账号时使旧请求失效
// 入参：读取当前会话编号与登录凭证的函数
// 返回：抽屉状态和打开动作；关闭或页面卸载后不接收旧结果
export function useChatReferenceDrawer(readSessionId: () => number, readToken: () => string | null) {
  const referencePreview = reactive<ReferencePreview>({ visible: false, loading: false, error: '', detail: null, score: 0 })
  let latestRequest = 0

  // 做什么：关闭抽屉、清空正文并使已发出的请求失效
  // 入参：无，使用当前页面的抽屉状态
  // 返回：无；关闭动作可以重复执行
  function closeReference(): void {
    latestRequest += 1
    Object.assign(referencePreview, { visible: false, loading: false, error: '', detail: null, score: 0 })
  }

  // 做什么：打开一条引用，只允许最新点击的响应写入抽屉
  // 入参：用户点击的完整引用
  // 返回：本次读取结束；过期结果会忽略
  function openReference(reference: ChatReference): Promise<void> {
    // 新手注意：请求序号像取件号，迟到的旧响应不能交给新的抽屉。
    const requestNumber = ++latestRequest
    return loadReference(referencePreview, reference, () => referencePreview.visible && requestNumber === latestRequest)
  }

  watch([readSessionId, readToken], closeReference, { flush: 'sync' })
  onBeforeUnmount(closeReference)
  return { referencePreview, openReference }
}
