import { getCurrentScope, ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { uploadKnowledgeDocumentFile } from '@/api/knowledge'
import { knowledgeRequestMessage } from '@/composables/knowledgeManagement'
import { isVideoFilename, VIDEO_FILE_EXTENSIONS } from '@/utils/knowledgeFileType'

// 新手注意：这里的后缀必须与后端已启用的通道保持一致，多写会被 415 拒绝。
const FILE_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx', '.pptx', '.xlsx', '.png', '.jpg', '.jpeg', ...VIDEO_FILE_EXTENSIONS]
const MAX_VIDEO_BYTES = 200 * 1024 * 1024
const MAX_FILE_BYTES = 10 * 1024 * 1024
const FILE_TYPE_MESSAGE = `当前可解析 ${FILE_EXTENSIONS.join('、')}`
const FILE_SIZE_MESSAGE = '文件不能超过 10 MB，请拆分后上传'
const VIDEO_SIZE_MESSAGE = '视频文件不能超过 200 MB，请拆分后上传'
export const KNOWLEDGE_FILE_ACCEPT = FILE_EXTENSIONS.join(',')

interface FileUploadContext {
  uploading: Ref<boolean>
  isCurrent: (baseId: number) => boolean
  refresh: () => Promise<void>
}

// 做什么：在提交前检查文件类型和大小
// 入参：用户从本机选择的文件
// 返回：可显示的拒绝原因，合法时返回空字符串
function fileValidationError(file: File): string {
  const filename = file.name.toLowerCase()
  if (!FILE_EXTENSIONS.some((extension) => filename.endsWith(extension))) return FILE_TYPE_MESSAGE
  const isVideo = isVideoFilename(filename)
  const maximumBytes = isVideo ? MAX_VIDEO_BYTES : MAX_FILE_BYTES
  if (file.size > maximumBytes) return isVideo ? VIDEO_SIZE_MESSAGE : FILE_SIZE_MESSAGE
  return ''
}

// 做什么：提交校验通过的文件，只让仍在该库的页面呈现结果
// 入参：库编号、所选文件和上传状态
// 返回：无；成功后刷新，失败显示后端原文
async function submitKnowledgeFile(baseId: number, file: File, context: FileUploadContext): Promise<void> {
  context.uploading.value = true
  try {
    await uploadKnowledgeDocumentFile(baseId, file)
    if (!context.isCurrent(baseId)) return
    ElMessage.success('文件已上传并完成解析')
    await context.refresh()
  } catch (error) {
    if (context.isCurrent(baseId)) ElMessage.error(knowledgeRequestMessage(error, '上传文件失败，请重试'))
  } finally {
    context.uploading.value = false
  }
}

// 做什么：管理单文件上传、提示和成功后的列表刷新
// 入参：读取当前库编号和刷新列表的函数
// 返回：是否正在上传、选择事件与直接提交函数（供拖拽复用）
export function useKnowledgeFileUpload(readBaseId: () => number, refresh: () => Promise<void>) {
  const fileUploading = ref(false)
  const scope = getCurrentScope()
  const context: FileUploadContext = {
    uploading: fileUploading, refresh, isCurrent: (baseId) => scope?.active !== false && readBaseId() === baseId,
  }

  // 做什么：校验并提交一个文件，供点击选择和拖拽共用
  // 入参：浏览器拿到的文件
  // 返回：是否通过了前端校验
  async function uploadFile(file: File): Promise<boolean> {
    const baseId = readBaseId()
    if (!baseId || fileUploading.value) return false
    const validationError = fileValidationError(file)
    if (validationError) {
      ElMessage.error(validationError)
      return false
    }
    await submitKnowledgeFile(baseId, file, context)
    return true
  }

  // 做什么：校验并提交所选文件，结束后允许再次选择同名文件
  // 入参：原生文件选择框的 change 事件
  // 返回：无，仍在原库时提示结果并刷新，失败显示后端文案
  async function selectKnowledgeFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.item(0)
    input.value = ''
    if (file) await uploadFile(file)
  }

  return { fileUploading, selectKnowledgeFile, uploadFile }
}
