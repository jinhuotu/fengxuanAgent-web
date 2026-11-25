/**
 * 对话列表的滚动判断。
 *
 * 为什么要单独抽出来：流式回答每来一段文字都会触发一次"要不要跟着滚到底"的判断，
 * 这个判断必须足够便宜、且能单独测试，不适合塞在页面组件的模板旁边。
 */

/** 距底部多少像素以内算"还在看最新内容"；太小会导致流式输出时频繁丢失跟随 */
export const FOLLOW_THRESHOLD_PX = 160

export interface ScrollMetrics {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}

// 做什么：判断滚动容器是否停在底部附近
// 入参：容器的三围数值（不要直接传 DOM，方便测试），可选的阈值
// 返回：true 表示应当继续自动跟随新内容
export function isNearBottom(metrics: ScrollMetrics, threshold = FOLLOW_THRESHOLD_PX): boolean {
  // 内容还没超出可视区时，scrollHeight 与 clientHeight 相等，差值 0，自然也属于"在底部"
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold
}
