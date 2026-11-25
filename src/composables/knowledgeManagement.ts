/** 知识库管理页共用的删除确认和错误提示。 */
import { isAxiosError } from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { reactive } from 'vue'
import type { ApiResponse } from '@/types/api'

export const BASE_NOT_FOUND_CODE = 4001
export const DOCUMENT_NOT_FOUND_CODE = 4002

// 做什么：在同一页面只打开一个删除确认，并跟踪正在删除的行
// 入参：无，每个调用页面持有独立状态
// 返回：确认函数与删除中的编号集合，页面在请求完成后移除编号
export function useKnowledgeDeletion() {
  // 新手注意：编号集合像一张正在办理的清单，同一行离开清单前不能重复提交。
  const deletingIds = reactive(new Set<number>())
  let confirmationOpen = false

  // 做什么：确认删除并为这行保留操作位置
  // 入参：目标编号、警告文案和弹窗标题
  // 返回：确认后登记编号并返回 true，取消或弹窗失败时返回 false
  async function confirmDelete(id: number, message: string, title: string): Promise<boolean> {
    if (confirmationOpen || deletingIds.has(id)) return false
    confirmationOpen = true
    try {
      await ElMessageBox.confirm(message, title, {
        type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
      })
      deletingIds.add(id)
      return true
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') ElMessage.error('无法打开确认提示，请重试')
      return false
    } finally {
      confirmationOpen = false
    }
  }

  return { confirmDelete, deletingIds }
}

// 做什么：识别知识库接口的不可见错误
// 入参：捕获的异常
// 返回：HTTP 404 对应的业务码，其他错误返回空值
export function knowledgeNotFoundCode(error: unknown): number | undefined {
  if (!isAxiosError<ApiResponse<unknown>>(error) || error.response?.status !== 404) return undefined
  return error.response.data?.code
}

// 做什么：整理管理请求失败时可展示的文案
// 入参：捕获的异常和页面提供的默认提示
// 返回：后端消息；网络异常或空消息时用默认提示
export function knowledgeRequestMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiResponse<unknown>>(error)) return error.response?.data?.message || fallback
  return error instanceof Error && error.message ? error.message : fallback
}
