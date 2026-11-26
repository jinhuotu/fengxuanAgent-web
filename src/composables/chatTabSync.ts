/** 同源页面只广播变更提示，实际状态始终读取本人接口。 */
import { readAccountKey, TOKEN_KEY } from '@/utils/token'
import { openTabChannel } from '@/utils/tabChannel'
import type { TabChannel } from '@/utils/tabChannel'
import type { ChatState, ConversationState } from '@/composables/useChat'
import { reconcileSelectedSession, reportRemoteError } from '@/composables/chatRemote'

const CHANNEL_NAME = 'fengxuan-chat-state-v1'
const NOTICE_KIND = 'chat-changed'
const NOTICE_FIELDS = ['kind', 'user_id', 'session_id', 'request_id', 'source_id']
const NOTICE_DELAY_MILLISECONDS = 150
const ACTIVE_POLL_MILLISECONDS = 2000
const IDLE_POLL_MILLISECONDS = 10000
const MAX_SOURCE_ID_LENGTH = 100
const MAX_REQUEST_ID_LENGTH = 36

export interface ChatTabSync {
  userId: number | null
  notify: (sessionId: number, requestId: string | null) => void
  refresh: () => Promise<void>
  close: () => void
}

interface TabNotice {
  kind: string
  user_id: number
  session_id: number
  request_id: string | null
  source_id: string
}

// 做什么：只接受有界标识通知，拒绝正文、凭证和未知字段
// 入参：其他页面发来的未知对象
// 返回：合法通知或 null；通知不作为授权或生成状态依据
function validatedNotice(message: unknown): TabNotice | null {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return null
  const notice = message as Record<string, unknown>
  if (Object.keys(notice).some((key) => !NOTICE_FIELDS.includes(key))) return null
  if (notice.kind !== NOTICE_KIND || !Number.isSafeInteger(notice.user_id) || Number(notice.user_id) <= 0) return null
  if (!Number.isSafeInteger(notice.session_id) || Number(notice.session_id) <= 0) return null
  if (typeof notice.source_id !== 'string' || !notice.source_id || notice.source_id.length > MAX_SOURCE_ID_LENGTH) return null
  if (notice.request_id !== null && (typeof notice.request_id !== 'string' || notice.request_id.length > MAX_REQUEST_ID_LENGTH)) return null
  return { kind: NOTICE_KIND, user_id: Number(notice.user_id), session_id: Number(notice.session_id),
    request_id: notice.request_id as string | null, source_id: notice.source_id }
}

// 做什么：账号变化时立即清除旧会话并关闭旧连接，不使用新凭证发送旧中断请求
// 入参：旧账号的一个会话状态
// 返回：无；只取消本页控制器，不调用任何接口
function clearAccountConversation(conversation: ConversationState): void {
  conversation.recoveryController?.abort()
  conversation.active?.controller.abort()
  conversation.active = null
  conversation.sending = false
  conversation.confirming = false
  conversation.messages = []
  conversation.draft = ''
  conversation.error = ''
  conversation.contextNotice = ''
  conversation.pendingRequestId = null
  conversation.remoteRequestId = null
  conversation.ownsPendingRequest = false
  conversation.historyVersion += 1
  conversation.loadingHistory = false
  conversation.syncingHistory = false
  conversation.historySyncError = ''
  conversation.remoteSyncError = ''
}

// 做什么：撤销整个旧账号页面，迟到回调将被原有账号快照检查拒绝
// 入参：页面状态
// 返回：无；不删除或替换其他页面刚写入的新 token
function clearChangedAccount(state: ChatState): void {
  state.disposed = true
  for (const conversation of Object.values(state.conversations)) clearAccountConversation(conversation)
  clearAccountConversation(state.current)
  state.sessions = []
  state.conversations = {}
  state.selectedId = 0
  state.sessionTotal = 0
  state.accountChanged = true
}

class TabSyncController {
  readonly userId: number | null
  private readonly state: ChatState
  private readonly refreshSessions: () => Promise<void>
  private readonly sourceId = crypto.randomUUID()
  private channel: TabChannel | null
  private timer: number | null = null
  private controller: AbortController | null = null
  private running = false
  private closed = false
  private paused = false
  private fullPending = true
  private readonly onStorage = this.storageChanged.bind(this)
  private readonly onVisibility = this.visibilityChanged.bind(this)
  private readonly onFocus = this.focused.bind(this)
  private readonly onHide = this.hidden.bind(this)
  private readonly onShow = this.shown.bind(this)

  // 做什么：托管通道、页面可见性及登录变化监听，不接管任何本地生成
  // 入参：页面状态、已验证用户编号或 null、会话列表刷新回调
  // 返回：控制器，初始化只排入一次校准
  constructor(state: ChatState, userId: number | null, refreshSessions: () => Promise<void>) {
    this.state = state
    this.userId = userId
    this.refreshSessions = refreshSessions
    // 新手注意：通知像门铃，只提醒去查自己的账本，不把别页的消息直接当成事实。
    this.channel = openTabChannel(CHANNEL_NAME, this.receive.bind(this))
    window.addEventListener('storage', this.onStorage)
    window.addEventListener('focus', this.onFocus)
    window.addEventListener('pagehide', this.onHide)
    window.addEventListener('pageshow', this.onShow)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.schedule(0, true)
  }

  // 做什么：检查本页身份是否仍有效，变化立即关闭同步和旧页面
  // 入参：无
  // 返回：仍属原登录快照时为 true，否则 false；同账号续期凭证不算变化
  private isCurrent(): boolean {
    if (this.closed || this.state.disposed) return false
    if (readAccountKey() === this.state.accountToken) return true
    this.close()
    clearChangedAccount(this.state)
    return false
  }

  // 做什么：取消一个尚未执行的校准定时器
  // 入参：无
  // 返回：无；没有定时器时不操作
  private clearTimer(): void {
    if (this.timer !== null) window.clearTimeout(this.timer)
    this.timer = null
  }

  // 做什么：合并通知并安排一次校准，隐藏或关闭时不安排查询
  // 入参：延迟及是否需要刷新会话列表
  // 返回：无；不会同时创建多个轮询定时器
  private schedule(delay: number, full = false): void {
    this.fullPending = this.fullPending || full
    if (this.closed || this.paused || document.visibilityState === 'hidden') return
    this.clearTimer()
    this.timer = window.setTimeout(() => {
      this.timer = null
      void this.refresh(this.fullPending)
    }, delay)
  }

  // 做什么：按需刷新列表后校准选中会话，本地流由只读校准层保护
  // 入参：观察信号及是否主动/完整刷新
  // 返回：一次校准完成；正在加载列表时保留下一轮刷新需求
  private async performRefresh(signal: AbortSignal, full: boolean): Promise<void> {
    if (full && this.state.loading) this.fullPending = true
    if (full && !this.state.loading) await this.refreshSessions()
    if (signal.aborted || !this.isCurrent()) return
    await reconcileSelectedSession(this.state, signal, () => this.isCurrent() && !signal.aborted, full)
  }

  // 做什么：单飞执行状态查询，失败独立提示，结束后安排下一次观察
  // 入参：是否刷新会话列表，默认主动校准
  // 返回：本次查询结束；重复触发仅合并需求，不并行堆积请求
  async refresh(full = true): Promise<void> {
    if (!this.isCurrent() || this.paused || document.visibilityState === 'hidden') return
    this.fullPending = this.fullPending || full
    this.clearTimer()
    if (this.running) return
    this.running = true
    const controller = new AbortController()
    this.controller = controller
    const refreshList = this.fullPending
    this.fullPending = false
    const conversation = this.state.current
    try {
      await this.performRefresh(controller.signal, refreshList)
    } catch (error) {
      if (this.isCurrent() && !controller.signal.aborted && this.state.current === conversation) reportRemoteError(this.state, error, conversation)
    } finally {
      this.running = false
      if (this.controller === controller) this.controller = null
      const selected = this.state.current
      const observing = selected.remoteRequestId || (!selected.ownsPendingRequest && selected.pendingRequestId)
      const delay = this.fullPending || observing ? ACTIVE_POLL_MILLISECONDS : IDLE_POLL_MILLISECONDS
      this.schedule(delay, !observing)
    }
  }

  // 做什么：接收同账号提示，只触发服务器校准，不照抄广播状态
  // 入参：未知通知
  // 返回：无；其他账号、自身回声和坏消息全部忽略
  private receive(message: unknown): void {
    if (!this.isCurrent()) return
    const notice = validatedNotice(message)
    if (!notice || notice.source_id === this.sourceId || notice.user_id !== this.userId) return
    this.schedule(NOTICE_DELAY_MILLISECONDS, true)
  }

  // 做什么：广播本页操作导致的变更提示，不包含凭证或正文
  // 入参：会话及原请求编号，新会话时请求编号为 null
  // 返回：无；通道不可用时仍保留可见校准和服务器轮询
  notify(sessionId: number, requestId: string | null): void {
    if (!this.isCurrent() || this.userId === null) return
    const sent = this.channel?.post({ kind: NOTICE_KIND, user_id: this.userId, session_id: sessionId,
      request_id: requestId, source_id: this.sourceId })
    if (sent === false) {
      this.channel?.close()
      this.channel = null
    }
  }

  // 做什么：其他页面改变登录存储时立即检查身份
  // 入参：存储事件，不读取或传播事件里的 token 值
  // 返回：无；其他无关存储键不触发处理
  private storageChanged(event: StorageEvent): void {
    if (event.key === TOKEN_KEY || event.key === null) this.isCurrent()
  }

  // 做什么：隐藏时停止观察，重新可见时校准，不停止本地 SSE
  // 入参：无
  // 返回：无；本地任务继续运行
  private visibilityChanged(): void {
    if (!this.isCurrent()) return
    if (document.visibilityState === 'hidden') {
      this.clearTimer()
      this.controller?.abort()
      return
    }
    this.schedule(0, true)
  }

  // 做什么：重新获得焦点时兜底检查登录和服务器状态
  // 入参：无
  // 返回：无；重复可见通知由定时器合并
  private focused(): void {
    if (this.isCurrent()) this.schedule(0, true)
  }

  // 做什么：真正离开或进入后退缓存时只暂停观察
  // 入参：无
  // 返回：无；本地任务的中断仍由原 pagehide 回调负责
  private hidden(): void {
    this.paused = true
    this.clearTimer()
    this.controller?.abort()
  }

  // 做什么：从后退缓存恢复时重新校准
  // 入参：无
  // 返回：无；身份变化时撤销旧页面
  private shown(): void {
    this.paused = false
    if (this.isCurrent()) this.schedule(0, true)
  }

  // 做什么：移除通道、定时器和监听器，只取消观察请求
  // 入参：无
  // 返回：无；可重复关闭，不发送任何停止生成请求
  close(): void {
    if (this.closed) return
    this.closed = true
    this.clearTimer()
    this.controller?.abort()
    this.channel?.close()
    window.removeEventListener('storage', this.onStorage)
    window.removeEventListener('focus', this.onFocus)
    window.removeEventListener('pagehide', this.onHide)
    window.removeEventListener('pageshow', this.onShow)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }
}

// 做什么：为浏览器页面建立同步控制器，服务端渲染或测试无窗口时不启用
// 入参：页面、已验证用户编号或 null，以及会话列表刷新回调
// 返回：同步操作或 null，不会创建模型生成请求
export function createChatTabSync(state: ChatState, userId: number | null,
                                  refreshSessions: () => Promise<void>): ChatTabSync | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  const controller = new TabSyncController(state, userId, refreshSessions)
  return { userId, notify: controller.notify.bind(controller), refresh: controller.refresh.bind(controller), close: controller.close.bind(controller) }
}

// 做什么：身份确认后启用账号通知，重复挂载或暂未加载身份时不降级已有通道
// 入参：页面状态、列表刷新回调和已验证用户编号
// 返回：无；无浏览器时保持关闭，旧账号不重新启动
export function connectChatTabs(state: ChatState, refreshSessions: () => Promise<void>, userId: number | null = null): void {
  if (state.disposed || state.accountToken !== readAccountKey()) return
  if (state.tabSync && (userId === null || state.tabSync.userId === userId)) return
  state.tabSync?.close()
  state.tabSync = createChatTabSync(state, userId, refreshSessions)
}
