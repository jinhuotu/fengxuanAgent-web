/**
 * 登录后的会话计时。
 * 做两件事：凭证签发满半小时自动换一张新的；连续两小时没有任何操作就退出登录。
 * 挂在登录后共用的外壳布局上，整个登录期间只需要启动一次。
 */
import type { AxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'

import { logoutQuietly, refreshLogin } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { decideSessionAction, SESSION_CHECK_INTERVAL_MILLISECONDS } from '@/utils/sessionPolicy'
import { getToken, getTokenIssuedAt, LAST_ACTIVITY_KEY, readAccountKey } from '@/utils/token'
import type { LoginData } from '@/types/api'

// 这些动作都算"有人在用"。鼠标移动最频繁，所以落盘有节流，不会一直写存储
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const
const ACTIVITY_WRITE_INTERVAL_MILLISECONDS = 30 * 1000
// 凭证已失效或账号被停用、删除：续不回来了，直接结束会话
const SESSION_ENDED_HTTP_STATUSES = new Set([401, 403])
const IDLE_LOGOUT_MESSAGE = '连续两小时没有操作，已自动退出登录'
const SESSION_EXPIRED_MESSAGE = '登录已失效，请重新登录'
const LOGIN_PATH = '/login'

/** 计时器用到的浏览器能力；单独列出来是为了测试时可以换成假的时钟和存储 */
export interface SessionEnvironment {
  window: Window
  document: Document
  storage: Storage
  now: () => number
}

export interface SessionWatch {
  /** 立即检查一次，页面重新可见时也会用到 */
  check: () => Promise<void>
  /** 停止计时并移除监听，退出登录或页面卸载时调用 */
  stop: () => void
}

// 做什么：读取其他标签页或上次打开页面记下的操作时间
// 入参：共享存储和当前时间
// 返回：上次操作的毫秒时间戳；没有记录或记录损坏时从现在开始算
function readStoredActivity(storage: Storage, now: number): number {
  const rawValue = storage.getItem(LAST_ACTIVITY_KEY)
  if (rawValue === null) return now
  const storedAt = Number(rawValue)
  return Number.isFinite(storedAt) && storedAt > 0 ? storedAt : now
}

class SessionWatchController {
  private readonly authStore = useAuthStore()
  private readonly router = useRouter()
  private timer: number | null = null
  private refreshing = false
  private stopped = false
  private readonly environment: SessionEnvironment
  private lastActivityAt: number
  private lastActivityWrittenAt = 0
  private readonly recordActivity = (): void => {
    const now = this.environment.now()
    this.lastActivityAt = now
    if (now - this.lastActivityWrittenAt >= ACTIVITY_WRITE_INTERVAL_MILLISECONDS) this.persistActivity(now)
  }
  private readonly visibilityChanged = (): void => {
    if (this.environment.document.visibilityState !== 'visible') return
    this.recordActivity()
    void this.check()
  }

  // 做什么：接住浏览器环境和计时规则，记下已知的上次操作时间
  // 入参：浏览器环境（窗口、文档、存储、时钟）
  // 返回：尚未启动的控制器
  constructor(environment: SessionEnvironment) {
    this.environment = environment
    this.lastActivityAt = readStoredActivity(environment.storage, environment.now())
  }

  // 做什么：开始监听操作并定时检查，启动时先检查一次
  // 入参：无
  // 返回：无
  start(): void {
    for (const eventName of ACTIVITY_EVENTS) {
      this.environment.window.addEventListener(eventName, this.recordActivity, { capture: true, passive: true })
    }
    this.environment.document.addEventListener('visibilitychange', this.visibilityChanged)
    this.timer = this.environment.window.setInterval(() => void this.check(), SESSION_CHECK_INTERVAL_MILLISECONDS)
    void this.check()
  }

  // 做什么：把内存里的最新操作时间写进共享存储，其他标签页据此判断是否有人在使用
  // 入参：无
  // 返回：无
  private persistActivity(at: number): void {
    this.lastActivityWrittenAt = this.environment.now()
    this.environment.storage.setItem(LAST_ACTIVITY_KEY, String(at))
  }

  // 做什么：做一轮检查：太久没操作就退出，凭证够老就续期
  // 入参：无
  // 返回：检查结束后返回；已停止或已退出时不做任何事
  async check(): Promise<void> {
    if (this.stopped || !getToken()) return
    // 操作可能发生在别的标签页，先取共享存储里更新的那个时间，后台页才不会误判为无人操作
    const now = this.environment.now()
    this.lastActivityAt = Math.max(this.lastActivityAt, readStoredActivity(this.environment.storage, now))
    this.persistActivity(this.lastActivityAt)
    const action = decideSessionAction(now, this.lastActivityAt, getTokenIssuedAt())
    if (action === 'logout') await this.finish(IDLE_LOGOUT_MESSAGE)
    else if (action === 'refresh') await this.refresh()
  }

  // 做什么：换一张新凭证；同一时刻只发一个续期请求
  // 入参：无
  // 返回：无；凭证已失效时结束会话，网络失败则等下一轮再试
  // 为什么只把请求放进 try：保存新凭证出错不是"网络抖动"，不该被悄悄吞掉后每分钟重来一遍
  private async refresh(): Promise<void> {
    if (this.refreshing) return
    const requestKey = readAccountKey()
    this.refreshing = true
    let loginResult: LoginData
    try {
      loginResult = await refreshLogin()
    } catch (error) {
      const status = (error as AxiosError).response?.status
      if (!this.stopped && status !== undefined && SESSION_ENDED_HTTP_STATUSES.has(status)) {
        await this.finish(SESSION_EXPIRED_MESSAGE)
      }
      return
    } finally {
      this.refreshing = false
    }
    // 请求期间换了账号或已退出时，丢弃这张为旧账号签发的凭证
    if (!this.stopped && readAccountKey() === requestKey) this.authStore.replaceToken(loginResult.access_token)
  }

  // 做什么：结束会话：请后端作废凭证，清理本地登录状态并回到登录页
  // 入参：展示给用户的提示
  // 返回：无；作废请求失败也继续清理，因为凭证可能早已过期
  private async finish(message: string): Promise<void> {
    this.stop()
    try {
      await logoutQuietly()
    } catch {
      // 凭证已过期或网络不通时作废会失败，本地状态照常清理，不再提示
    }
    this.authStore.logout()
    ElMessage.warning(message)
    await this.router.replace(LOGIN_PATH)
  }

  // 做什么：停止计时并移除全部监听
  // 入参：无
  // 返回：无；可重复调用
  stop(): void {
    if (this.stopped) return
    this.stopped = true
    if (this.timer !== null) this.environment.window.clearInterval(this.timer)
    this.timer = null
    for (const eventName of ACTIVITY_EVENTS) {
      this.environment.window.removeEventListener(eventName, this.recordActivity, { capture: true })
    }
    this.environment.document.removeEventListener('visibilitychange', this.visibilityChanged)
  }
}

// 做什么：为登录后的页面建立会话计时
// 入参：可选的浏览器环境，默认使用当前窗口、文档和本地存储
// 返回：已经启动的计时器；页面卸载时调用 stop
export function startSessionWatch(environment?: SessionEnvironment): SessionWatch {
  const target = environment ?? {
    window, document, storage: window.localStorage, now: () => Date.now(),
  }
  const controller = new SessionWatchController(target)
  controller.start()
  return { check: controller.check.bind(controller), stop: controller.stop.bind(controller) }
}
