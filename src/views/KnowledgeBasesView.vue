<script setup lang="ts">
import { isAxiosError } from 'axios'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createKnowledgeBase, deleteKnowledgeBase, listKnowledgeBases } from '@/api/knowledge'
import KnowledgeTableCard from '@/components/KnowledgeTableCard.vue'
import { BASE_NOT_FOUND_CODE, knowledgeNotFoundCode, knowledgeRequestMessage, useKnowledgeDeletion } from '@/composables/knowledgeManagement'
import type { ApiResponse } from '@/types/api'
import type { KnowledgeBase } from '@/types/knowledge'
import { countKnowledgeCharacters, formatDocumentCount, formatKnowledgeTime } from '@/utils/knowledgeStatus'

const FIRST_PAGE = 1
const PAGE_SIZE = 20
const MAX_NAME_LENGTH = 50
const MAX_DESCRIPTION_LENGTH = 200
const router = useRouter()
const { confirmDelete, deletingIds } = useKnowledgeDeletion()
const currentPage = ref(FIRST_PAGE)
const knowledgeBases = ref<KnowledgeBase[]>([])
const totalCount = ref(0)
const loading = ref(false)
const loadError = ref('')
const createVisible = ref(false)
const creating = ref(false)
const createError = ref('')
const createFormRef = ref<FormInstance>()
const createForm = reactive({ name: '', description: '' })
const createRules: FormRules = {
  name: [{ type: 'string', required: true, whitespace: true, max: MAX_NAME_LENGTH,
    message: '请输入 1–50 字的名称', trigger: 'blur' }],
  description: [{ max: MAX_DESCRIPTION_LENGTH, message: '说明最多 200 字', trigger: 'blur' }],
}
let latestListRequest = 0

// 做什么：加载知识库的指定页，给失败保留重试入口
// 入参：页码，默认重试当前页
// 返回：无；过期分页结果被忽略，失败在卡片内展示
async function loadBases(page = currentPage.value): Promise<void> {
  const requestNumber = ++latestListRequest
  currentPage.value = page
  loading.value = true
  loadError.value = ''
  try {
    const result = await listKnowledgeBases(page, PAGE_SIZE, true)
    if (requestNumber !== latestListRequest) return
    // 删除可能让末页消失，用服务端总数定位上一张还有数据的页。
    const lastPage = Math.max(FIRST_PAGE, Math.ceil(result.total / PAGE_SIZE))
    if (page > lastPage) return await loadBases(lastPage)
    knowledgeBases.value = result.items
    totalCount.value = result.total
    currentPage.value = result.page
  } catch {
    if (requestNumber === latestListRequest) loadError.value = '加载知识库列表失败，请重试'
  } finally {
    if (requestNumber === latestListRequest) loading.value = false
  }
}

// 做什么：确认并删除一行知识库，按服务器总数刷新列表
// 入参：被点击的知识库及当前显示的文档数
// 返回：无；库不可见时提示并刷新，其他错误保留列表
async function removeKnowledgeBase(knowledgeBase: KnowledgeBase): Promise<void> {
  const { id, name, document_count: documentCount } = knowledgeBase
  const message = `确定删除知识库「${name}」？其下 ${documentCount} 篇文档与全部切片会一并删除，且不可恢复。`
  if (!await confirmDelete(id, message, '删除知识库')) return
  try {
    const result = await deleteKnowledgeBase(id)
    ElMessage.success(`已删除知识库，同时移除了 ${result.deleted_documents} 篇文档`)
    await loadBases()
  } catch (error) {
    if (knowledgeNotFoundCode(error) === BASE_NOT_FOUND_CODE) {
      ElMessage.error('知识库不存在或无权访问')
      await loadBases()
      return
    }
    ElMessage.error(knowledgeRequestMessage(error, '删除知识库失败，请重试'))
  } finally {
    deletingIds.delete(id)
  }
}

// 做什么：进入所选知识库的文档页
// 入参：库列表中的一行
// 返回：无；导航交给已有路由
function openDocuments(knowledgeBase: KnowledgeBase): void {
  void router.push({ name: 'knowledge-documents', params: { knowledgeBaseId: knowledgeBase.id } })
}

// 做什么：关闭弹窗后清除建库草稿和上次错误
// 入参：无，读取当前表单
// 返回：空表单和空错误提示
function resetCreateForm(): void {
  createFormRef.value?.resetFields()
  createError.value = ''
}

// 做什么：通过表单校验后建库，成功后刷新第一页
// 入参：无，使用当前名称和说明
// 返回：无；失败时保留输入并展示错误
async function submitCreate(): Promise<void> {
  if (creating.value || !createFormRef.value) return
  creating.value = true
  createError.value = ''
  try {
    const valid = await createFormRef.value.validate().catch(() => false)
    if (!valid) return
    await createKnowledgeBase({ name: createForm.name.trim(), description: createForm.description || null })
    createVisible.value = false
    ElMessage.success('知识库已创建')
    await loadBases(FIRST_PAGE)
  } catch (error) {
    const message = isAxiosError<ApiResponse<unknown>>(error) ? error.response?.data?.message : undefined
    createError.value = message || '创建知识库失败，请重试'
  } finally {
    creating.value = false
  }
}

onMounted(loadBases)
</script>

<template>
  <KnowledgeTableCard :loading="loading" :error="loadError" :current-page="currentPage"
    :page-size="PAGE_SIZE" :total="totalCount" :skeleton="loading && !knowledgeBases.length"
    @retry="loadBases()" @page-change="loadBases">
    <template #heading><h1>知识库</h1></template>
    <template #actions>
      <el-button type="primary" class="ink-button" :disabled="loading || creating" @click="createVisible = true">+ 新建知识库</el-button>
    </template>
    <el-table :data="knowledgeBases" row-key="id" class="data-table"
      empty-text="还没有知识库，点右上角新建一个" @row-click="openDocuments">
      <el-table-column prop="name" label="名称" min-width="160" show-overflow-tooltip class-name="is-primary" />
      <el-table-column label="说明" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.description?.trim() || '未填写' }}</template>
      </el-table-column>
      <el-table-column label="文档数" width="100">
        <template #default="{ row }">{{ formatDocumentCount(row.document_count) }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="170" class-name="is-faint">
        <template #default="{ row }">{{ formatKnowledgeTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="155">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="openDocuments(row)">查看文档</el-button>
          <el-button link type="danger" :loading="deletingIds.has(row.id)"
            @click.stop="removeKnowledgeBase(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </KnowledgeTableCard>

  <el-dialog v-model="createVisible" title="新建知识库" width="min(440px, calc(100% - 32px))"
    :show-close="!creating" :close-on-click-modal="!creating" :close-on-press-escape="!creating"
    @closed="resetCreateForm">
    <el-form ref="createFormRef" :model="createForm" :rules="createRules" :disabled="creating"
      label-position="top" @submit.prevent="submitCreate">
      <el-form-item label="名称" prop="name">
        <el-input v-model="createForm.name" :maxlength="MAX_NAME_LENGTH" :count-graphemes="countKnowledgeCharacters" />
      </el-form-item>
      <el-form-item label="说明（可选）" prop="description">
        <el-input v-model="createForm.description" type="textarea" :rows="2" :maxlength="MAX_DESCRIPTION_LENGTH"
          :count-graphemes="countKnowledgeCharacters" />
      </el-form-item>
      <p v-if="createError" class="form-error" role="alert">{{ createError }}</p>
      <el-button native-type="submit" type="primary" class="ink-button" :loading="creating">确认创建</el-button>
      <el-button :disabled="creating" @click="createVisible = false">取消</el-button>
    </el-form>
  </el-dialog>
</template>

<style scoped>
/* 整行都能点进文档页，鼠标移上去用手形提示 */
.data-table :deep(.el-table__body tr) {
  cursor: pointer;
}

.form-error {
  color: var(--color-danger);
  font-size: 13px;
}
</style>
