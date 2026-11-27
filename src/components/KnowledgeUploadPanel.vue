<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listKnowledgeFileTypes } from '@/api/knowledge'
import { KNOWLEDGE_FILE_ACCEPT, useKnowledgeFileUpload } from '@/composables/useKnowledgeFileUpload'
import type { KnowledgeFileType } from '@/types/knowledge'

const props = defineProps<{ knowledgeBaseId: number; disabled?: boolean }>()
const emit = defineEmits<{ uploaded: [] }>()
const fileInput = ref<HTMLInputElement>()
const fileTypes = ref<KnowledgeFileType[]>([])
const typesError = ref('')
const dragging = ref(false)
const { fileUploading, selectKnowledgeFile, uploadFile } = useKnowledgeFileUpload(
  () => props.knowledgeBaseId, async () => { emit('uploaded') },
)

// 做什么：读取后端类型清单，让卡片与真实解析能力一致
// 入参：无
// 返回：无；失败时只提示，不挡手动选择文件
async function loadFileTypes(): Promise<void> {
  try {
    fileTypes.value = await listKnowledgeFileTypes()
  } catch {
    typesError.value = '文件类型清单加载失败，可直接选择已支持的文件'
  }
}

// 做什么：打开系统文件选择框
// 入参：无
// 返回：无；禁用或上传中不响应
function openPicker(): void {
  if (props.disabled || fileUploading.value) return
  fileInput.value?.click()
}

// 做什么：接收拖拽进来的第一个文件并走同一条上传链路
// 入参：原生 drop 事件
// 返回：无；多文件只取第一个
async function handleDrop(event: DragEvent): Promise<void> {
  dragging.value = false
  if (props.disabled || fileUploading.value) return
  const file = event.dataTransfer?.files?.item(0)
  if (file) await uploadFile(file)
}

onMounted(loadFileTypes)
</script>

<template>
  <section class="upload-panel">
    <div class="drop-zone" :class="{ 'is-dragging': dragging, 'is-busy': fileUploading || disabled }"
      role="button" tabindex="0" @click="openPicker" @keydown.enter.prevent="openPicker"
      @keydown.space.prevent="openPicker" @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false" @drop.prevent="handleDrop">
      <input ref="fileInput" type="file" :accept="KNOWLEDGE_FILE_ACCEPT" hidden @change="selectKnowledgeFile" />
      <p class="drop-title">{{ fileUploading ? '正在上传并解析…' : '把文件拖到这里，或点击选择' }}</p>
      <p class="drop-hint">单个文件不超过 10 MB；上传后先按内容识别真实类型，再按对应通道解析、分块并写入索引</p>
    </div>

    <p v-if="typesError" class="types-error">{{ typesError }}</p>
    <ul v-else class="type-grid">
      <li v-for="item in fileTypes" :key="item.kind" class="type-card" :class="{ 'is-disabled': !item.enabled }">
        <span class="type-name">{{ item.name }}</span>
        <span class="type-ext">{{ item.extensions.join(' · ') }}</span>
        <span v-if="item.enabled" class="type-ready">可解析</span>
        <span v-else class="type-note">{{ item.note }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.upload-panel {
  display: grid;
  gap: 14px;
  margin-bottom: 20px;
}

.drop-zone {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 30px 16px;
  border: 1.5px dashed var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  cursor: pointer;
  transition: border-color var(--transition-base), background var(--transition-base);
}

.drop-zone:hover,
.drop-zone.is-dragging {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.drop-zone.is-busy {
  cursor: not-allowed;
}

.drop-title {
  margin: 0;
  color: var(--color-ink);
  font-size: 16px;
  font-weight: 600;
}

.drop-hint {
  margin: 0;
  color: var(--color-text-faint);
  font-size: 12px;
  text-align: center;
}

.types-error {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.type-card {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
}

.type-card.is-disabled {
  background: var(--color-sidebar);
  border-style: dashed;
}

.type-name {
  color: var(--color-ink);
  font-size: 14px;
  font-weight: 600;
}

.type-ext {
  color: var(--color-text-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.type-ready {
  color: var(--color-accent);
  font-size: 12px;
}

.type-note {
  color: var(--color-text-faint);
  font-size: 12px;
}
</style>
