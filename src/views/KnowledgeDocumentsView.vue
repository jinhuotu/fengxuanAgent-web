<script setup lang="ts">
import { isAxiosError } from 'axios'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  deleteKnowledgeDocument, listKnowledgeBases, listKnowledgeDocumentChunks, listKnowledgeDocuments, uploadKnowledgeDocument,
} from '@/api/knowledge'
import KnowledgeDocumentDrawer from '@/components/KnowledgeDocumentDrawer.vue'
import KnowledgeTableCard from '@/components/KnowledgeTableCard.vue'
import KnowledgeUploadPanel from '@/components/KnowledgeUploadPanel.vue'
import {
  BASE_NOT_FOUND_CODE, DOCUMENT_NOT_FOUND_CODE, knowledgeNotFoundCode, knowledgeRequestMessage, useKnowledgeDeletion,
} from '@/composables/knowledgeManagement'
import type { ApiResponse } from '@/types/api'
import type { KnowledgeBase, KnowledgeChunk, KnowledgeDocument } from '@/types/knowledge'
import {
  countKnowledgeCharacters, documentSourceLabel, documentStatusLabel, fileTypeLabel, formatDocumentCount,
  formatFileSize, formatKnowledgeTime,
} from '@/utils/knowledgeStatus'

const FIRST_PAGE = 1
const PAGE_SIZE = 20
const CHUNK_PAGE_SIZE = 10
const MAX_TITLE_LENGTH = 100
const MAX_CONTENT_LENGTH = 50000
const DOCUMENTS_ROUTE = 'knowledge-documents'
const BASES_ROUTE = 'knowledge'
const PROCESSING_ERROR_CODE = 5000
const statusTagType = { ready: 'success', pending: 'info', failed: 'danger' } as const
const route = useRoute()
const router = useRouter()
const { confirmDelete, deletingIds } = useKnowledgeDeletion()
const knowledgeBaseId = computed(readKnowledgeBaseId)
const knowledgeBase = ref<KnowledgeBase | null>(null)
const documents = ref<KnowledgeDocument[]>([])
const documentRows = computed(displayDocumentRows)
const currentPage = ref(FIRST_PAGE)
const totalCount = ref(0)
const loading = ref(false)
const loadError = ref('')
let latestListRequest = 0
let latestChunkRequest = 0
const preview = reactive({
  visible: false,
  document: null as KnowledgeDocument | null,
  items: [] as KnowledgeChunk[],
  total: 0,
  page: FIRST_PAGE,
  loading: false,
  error: '',
})

const uploadVisible = ref(false)
const uploading = ref(false)
const uploadError = ref('')
const uploadFormRef = ref<FormInstance>()
const uploadForm = reactive({ title: '', content: '' })
const uploadRules: FormRules = {
  title: [{ type: 'string', required: true, whitespace: true, max: MAX_TITLE_LENGTH,
    message: '请输入 1–100 字的标题', trigger: 'blur' }],
  content: [
    { required: true, message: '请输入纯文本正文', trigger: 'blur' },
    { asyncValidator: validateContent, trigger: 'blur' },
  ],
}

// 做什么：把链接中的参数转换成可查询的知识库编号
// 入参：无，读取当前路由参数
// 返回：合法编号；格式错误时返回零
function readKnowledgeBaseId(): number {
  const routeId = route.params.knowledgeBaseId
  if (typeof routeId !== 'string' || !/^\d+$/.test(routeId)) return 0
  const id = Number(routeId)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}

// 做什么：为每行文档预备状态、来源、类型与大小文案
// 入参：无，读取已加载的文档
// 返回：带可读标签和颜色的表格行
function displayDocumentRows() {
  return documents.value.map((document) => ({
    ...document,
    statusLabel: documentStatusLabel(document.status),
    typeLabel: fileTypeLabel(document.file_type),
    sourceLabel: documentSourceLabel(document.source_type),
    sizeText: formatFileSize(document.file_size),
  }))
}

// 做什么：检查空白和正文长度，保持提交原文可用
// 入参：表单规则及当前原始正文
// 返回：通过时正常完成；无实质文字或超长时给表单错误
async function validateContent(_rule: unknown, content: string): Promise<void> {
  if (!content.trim()) throw new Error('正文不能全为空白')
  if (countKnowledgeCharacters(content) > MAX_CONTENT_LENGTH) throw new Error('正文最多 50000 字')
}

// 做什么：判断响应是否属于仍在查看的文档页
// 入参：请求发出时的库编号及顺序编号
// 返回：仍是最新请求时为 true
function requestIsCurrent(baseId: number, requestNumber: number): boolean {
  return route.name === DOCUMENTS_ROUTE && baseId === knowledgeBaseId.value && requestNumber === latestListRequest
}

// 做什么：通过可见库列表查找元数据，包括首页以后的库
// 入参：库编号和本次加载的顺序编号
// 返回：列表中的所选库；遍历结束或请求过期时返回 null
async function findKnowledgeBase(baseId: number, requestNumber: number): Promise<KnowledgeBase | null> {
  let page = FIRST_PAGE
  while (requestIsCurrent(baseId, requestNumber)) {
    const result = await listKnowledgeBases(page, PAGE_SIZE, true)
    const match = result.items.find((item) => item.id === baseId)
    if (match) return match
    if (!result.items.length || result.page * result.page_size >= result.total) return null
    page = result.page + 1
  }
  return null
}

// 做什么：识别库被删、找不到或不属于本人时的统一接口错误
// 入参：捕获到的请求异常
// 返回：符合 404/4001 时为 true
function isMissingBase(error: unknown): boolean {
  return knowledgeNotFoundCode(error) === BASE_NOT_FOUND_CODE
}

// 做什么：对不可见或不存在的库显示提示并返回库列表
// 入参：无，使用统一提示文案
// 返回：完成路由切换
async function returnToKnowledgeBases(): Promise<void> {
  ElMessage.error('知识库不存在或无权访问')
  await router.replace({ name: BASES_ROUTE })
}

// 做什么：加载指定页文档，需要时先获取库名及文档数
// 入参：请求页码、是否刷新库元数据、需要保留的页码
// 返回：无；不可见时返回库列表，其他失败保留重试
async function loadDocuments(page = currentPage.value, refreshBase = false, preferredPage = page): Promise<void> {
  const baseId = knowledgeBaseId.value
  const requestNumber = ++latestListRequest
  currentPage.value = page
  loading.value = true
  loadError.value = ''
  try {
    if (!baseId) return await returnToKnowledgeBases()
    if (refreshBase || !knowledgeBase.value) {
      const match = await findKnowledgeBase(baseId, requestNumber)
      if (!requestIsCurrent(baseId, requestNumber)) return
      if (!match) return await returnToKnowledgeBases()
      knowledgeBase.value = match
    }
    const result = await listKnowledgeDocuments(baseId, page, PAGE_SIZE)
    if (!requestIsCurrent(baseId, requestNumber)) return
    const lastPage = Math.max(FIRST_PAGE, Math.ceil(result.total / PAGE_SIZE))
    const nextPage = Math.min(preferredPage, lastPage)
    if (nextPage !== page) return await loadDocuments(nextPage)
    documents.value = result.items
    totalCount.value = result.total
    currentPage.value = result.page
  } catch (error) {
    if (!requestIsCurrent(baseId, requestNumber)) return
    if (isMissingBase(error)) return await returnToKnowledgeBases()
    loadError.value = '加载知识库文档失败，请重试'
  } finally {
    if (requestNumber === latestListRequest) loading.value = false
  }
}

// 做什么：进入新库时清除旧库的表格和草稿，再从第一页加载
// 入参：路由库编号变化
// 返回：无；离开文档页时不再发请求
function openKnowledgeBase(): void {
  if (route.name !== DOCUMENTS_ROUTE) return
  knowledgeBase.value = null
  documents.value = []
  totalCount.value = 0
  uploadVisible.value = false
  preview.visible = false
  void loadDocuments(FIRST_PAGE, true)
}

// 做什么：确认后删除文档，同时刷新所在库的篇数
// 入参：被点击的文档行
// 返回：无；库不可见时回库列表，文档不可见时刷新当前表格
async function removeDocument(document: KnowledgeDocument): Promise<void> {
  const baseId = knowledgeBaseId.value
  const message = `确定删除文档「${document.title}」？其切片会一并删除，且不可恢复。`
  if (!await confirmDelete(document.id, message, '删除文档')) return
  try {
    if (baseId !== knowledgeBaseId.value) return
    const result = await deleteKnowledgeDocument(baseId, document.id)
    if (baseId !== knowledgeBaseId.value) return
    ElMessage.success(`已删除文档，同时移除 ${result.deleted_chunks} 个切片`)
    await loadDocuments(FIRST_PAGE, true, currentPage.value)
  } catch (error) {
    if (baseId !== knowledgeBaseId.value) return
    if (isMissingBase(error)) return await returnToKnowledgeBases()
    if (knowledgeNotFoundCode(error) === DOCUMENT_NOT_FOUND_CODE) {
      ElMessage.error('文档不存在或已删除')
      await loadDocuments(FIRST_PAGE, true, currentPage.value)
      return
    }
    ElMessage.error(knowledgeRequestMessage(error, '删除文档失败，请重试'))
  } finally {
    deletingIds.delete(document.id)
  }
}

// 做什么：打开指定文档的抽屉并重新请求第一页
// 入参：待查看的文档行
// 返回：无；加载状态和失败提示均在抽屉里显示
function openDocumentPreview(document: KnowledgeDocument): void {
  preview.document = document
  preview.total = 0
  preview.visible = true
  void loadDocumentChunks(FIRST_PAGE)
}

// 做什么：判断原文分页响应能否更新当前抽屉
// 入参：请求时的库编号和请求序号
// 返回：抽屉仍打开且请求仍属于当前文档时为 true
function chunkRequestIsCurrent(baseId: number, requestNumber: number): boolean {
  // 新手注意：请求编号像取件号，旧文档迟到的响应不能交给新开的抽屉。
  return preview.visible && baseId === knowledgeBaseId.value && requestNumber === latestChunkRequest
}

// 做什么：加载当前文档的一页原文切片
// 入参：目标页码，重试时使用上次请求的页码
// 返回：无；过期响应忽略，失败后保留抽屉并显示重试
async function loadDocumentChunks(page = preview.page): Promise<void> {
  const baseId = knowledgeBaseId.value
  if (!preview.document || !preview.visible) return
  const requestNumber = ++latestChunkRequest
  preview.page = page
  preview.loading = true
  preview.error = ''
  try {
    const result = await listKnowledgeDocumentChunks(baseId, preview.document.id, page, CHUNK_PAGE_SIZE)
    if (!chunkRequestIsCurrent(baseId, requestNumber)) return
    preview.items = result.items
    preview.total = result.total
    preview.page = result.page
  } catch (error) {
    if (chunkRequestIsCurrent(baseId, requestNumber)) {
      preview.error = knowledgeRequestMessage(error, '加载原文失败，请重试')
    }
  } finally {
    if (chunkRequestIsCurrent(baseId, requestNumber)) preview.loading = false
  }
}

// 做什么：关闭上传弹窗后清空上次草稿和错误提示
// 入参：无，读取当前表单
// 返回：纯空白表单，等待下一次上传
function resetUploadForm(): void {
  uploadFormRef.value?.resetFields()
  uploadError.value = ''
}

// 做什么：把后端切分错误映射成可操作的文案
// 入参：上传异常
// 返回：切分失败提示、后端提示或默认文案
function uploadFailureMessage(error: unknown): string {
  if (isAxiosError<ApiResponse<unknown>>(error)) {
    const response = error.response
    if (response?.status === 500 && response.data?.code === PROCESSING_ERROR_CODE) {
      return '正文不能为空白或处理失败，请修改后重试'
    }
    if (response?.data?.message) return response.data.message
  }
  return '上传文档失败，请重试'
}

// 做什么：通过表单校验后上传原文，并刷新文档列表和篇数
// 入参：无，使用当时选中的库及表单数据
// 返回：无；失败保留原文与标题供用户修改
async function submitUpload(): Promise<void> {
  if (uploading.value || !uploadFormRef.value || !knowledgeBase.value) return
  const baseId = knowledgeBaseId.value
  uploading.value = true
  uploadError.value = ''
  try {
    const valid = await uploadFormRef.value.validate().catch(() => false)
    if (!valid || baseId !== knowledgeBaseId.value) return
    await uploadKnowledgeDocument(baseId, { title: uploadForm.title.trim(), content: uploadForm.content })
    if (baseId !== knowledgeBaseId.value) return
    uploadVisible.value = false
    ElMessage.success('已上传并完成切分')
    await loadDocuments(FIRST_PAGE, true)
  } catch (error) {
    if (baseId !== knowledgeBaseId.value) return
    if (isMissingBase(error)) return await returnToKnowledgeBases()
    uploadError.value = uploadFailureMessage(error)
  } finally {
    uploading.value = false
  }
}

watch(knowledgeBaseId, openKnowledgeBase, { immediate: true })
</script>

<template>
  <KnowledgeTableCard :loading="loading" :error="loadError" :current-page="currentPage" :page-size="PAGE_SIZE"
    :total="totalCount" :skeleton="loading && !documents.length"
    @retry="loadDocuments(currentPage, true)" @page-change="loadDocuments">
    <template #heading>
      <RouterLink :to="{ name: BASES_ROUTE }" class="back-to-knowledge">← 知识库</RouterLink>
      <h1>{{ knowledgeBase?.name ?? '知识库文档' }}</h1>
      <p v-if="knowledgeBase">{{ formatDocumentCount(knowledgeBase.document_count) }}</p>
    </template>
    <template #actions>
      <el-button type="primary" class="ink-button" :disabled="!knowledgeBase || loading || uploading"
        @click="uploadVisible = true">粘贴正文</el-button>
    </template>
    <KnowledgeUploadPanel :knowledge-base-id="knowledgeBaseId" :disabled="!knowledgeBase || loading || uploading"
      @uploaded="loadDocuments(FIRST_PAGE, true)" />
    <el-table :data="documentRows" row-key="id" class="data-table" empty-text="这个知识库还没有文档，先上传一篇">
      <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip class-name="is-primary" />
      <el-table-column label="来源" width="110">
        <template #default="{ row }">{{ row.sourceLabel }}</template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }">{{ row.typeLabel }}</template>
      </el-table-column>
      <el-table-column label="大小" width="100" class-name="is-faint">
        <template #default="{ row }">{{ row.sizeText }}</template>
      </el-table-column>
      <el-table-column label="字数" width="100">
        <template #default="{ row }">{{ row.char_count }} 字</template>
      </el-table-column>
      <el-table-column label="状态" width="130">
        <template #default="{ row }">
          <el-tag :type="statusTagType[row.statusLabel.tone as keyof typeof statusTagType]">
            {{ row.statusLabel.text }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="170" class-name="is-faint">
        <template #default="{ row }">{{ formatKnowledgeTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="155">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDocumentPreview(row)">查看原文</el-button>
          <el-button link type="danger" :loading="deletingIds.has(row.id)" @click="removeDocument(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </KnowledgeTableCard>

  <KnowledgeDocumentDrawer v-model="preview.visible" :title="preview.document?.title ?? ''"
    :chunks="preview.items" :total="preview.total" :page="preview.page" :page-size="CHUNK_PAGE_SIZE"
    :loading="preview.loading" :error="preview.error" @page-change="loadDocumentChunks" @retry="loadDocumentChunks()" />

  <el-dialog v-model="uploadVisible" title="上传文档" width="min(640px, calc(100% - 32px))"
    :show-close="!uploading" :close-on-click-modal="!uploading" :close-on-press-escape="!uploading"
    @closed="resetUploadForm">
    <el-form ref="uploadFormRef" :model="uploadForm" :rules="uploadRules" :disabled="uploading"
      label-position="top" @submit.prevent="submitUpload">
      <el-form-item label="标题" prop="title">
        <el-input v-model="uploadForm.title" :maxlength="MAX_TITLE_LENGTH" :count-graphemes="countKnowledgeCharacters" />
      </el-form-item>
      <el-form-item label="正文" prop="content">
        <el-input v-model="uploadForm.content" type="textarea" :autosize="{ minRows: 6, maxRows: 12 }"
          :maxlength="MAX_CONTENT_LENGTH" :count-graphemes="countKnowledgeCharacters" show-word-limit />
      </el-form-item>
      <p v-if="uploadError" class="upload-error" role="alert">{{ uploadError }}</p>
      <el-button native-type="submit" type="primary" class="ink-button" :loading="uploading">确认上传</el-button>
      <el-button :disabled="uploading" @click="uploadVisible = false">取消</el-button>
    </el-form>
  </el-dialog>
</template>

<style scoped>
.back-to-knowledge {
  display: inline-block;
  margin-bottom: 10px;
  color: var(--color-text-muted);
  font-size: 13px;
}

.back-to-knowledge:hover {
  color: var(--color-text);
}

.upload-error {
  color: var(--color-danger);
  font-size: 13px;
}
</style>
