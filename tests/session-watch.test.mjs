import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

import { createMemoryStorage, fakeToken, loadTokenModule } from './token-module.mjs'

const MINUTE = 60 * 1000
const START = 1_700_000_000_000

const policySource = await readFile(new URL('../src/utils/sessionPolicy.ts', import.meta.url), 'utf8')
const watchSource = await readFile(new URL('../src/composables/useSessionWatch.ts', import.meta.url), 'utf8')
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const policy = {}
new Function('require', 'exports', compile(policySource))((name) => { throw new Error(`时长规则不应依赖其他模块：${name}`) }, policy)

// 做什么：构造可控的时钟、存储、窗口和定时器，不依赖真实浏览器
// 入参：存储初始内容和凭证签发距今的分钟数
// 返回：环境对象、凭证工具，以及推进时间和触发操作的函数
function environment(stored = {}, tokenAgeMinutes = 0) {
  const clock = { now: START }
  const storage = createMemoryStorage(stored)
  if (tokenAgeMinutes !== null) {
    storage.setItem('fengxuan_token', fakeToken(7))
    storage.setItem('fengxuan_token_issued_at', String(START - tokenAgeMinutes * MINUTE))
  }
  const token = loadTokenModule(storage)
  const window = new EventTarget()
  const document = new EventTarget()
  document.visibilityState = 'visible'
  const timers = []
  let timerSequence = 0
  window.setInterval = (callback, delay) => { timers.push({ id: ++timerSequence, callback, delay }); return timerSequence }
  window.clearInterval = (id) => {
    const index = timers.findIndex((timer) => timer.id === id)
    if (index >= 0) timers.splice(index, 1)
  }
  return {
    clock, storage, token, timers,
    environment: { window, document, storage, now: () => clock.now },
    activity: (name = 'pointerdown') => window.dispatchEvent(new Event(name)),
    advance: (minutes) => { clock.now += minutes * MINUTE },
  }
}

// 做什么：用模拟的身份仓库、路由和接口加载真实的会话计时
// 入参：环境、接口模拟
// 返回：计时器、调用记录和提示消息
function startWatch(setup, api = {}) {
  const calls = []
  const messages = []
  const redirects = []
  const store = {
    replaceToken: (value) => { calls.push(['replace', value]); setup.token.saveToken(value, setup.clock.now) },
    logout: () => { calls.push(['logout']); setup.token.clearToken() },
  }
  const defaultApi = {
    refreshLogin: async () => { calls.push(['refresh']); return { access_token: fakeToken(7), expires_in: 3600 } },
    logoutQuietly: async () => { calls.push(['revoke']); return null },
  }
  const modules = {
    'element-plus': { ElMessage: { warning: (message) => messages.push(message) } },
    'vue-router': { useRouter: () => ({ replace: async (path) => { redirects.push(path) } }) },
    '@/api/auth': { ...defaultApi, ...api },
    '@/stores/auth': { useAuthStore: () => store },
    '@/utils/sessionPolicy': policy,
    '@/utils/token': setup.token,
  }
  const exported = {}
  new Function('require', 'exports', compile(watchSource))((name) => {
    if (!(name in modules)) throw new Error(`未预期的依赖：${name}`)
    return modules[name]
  }, exported)
  const watch = exported.startSessionWatch(setup.environment)
  return { watch, calls, messages, redirects }
}

const unauthorized = () => Object.assign(new Error('unauthorized'), { response: { status: 401 } })

// 做什么：验证三种时间条件下的判断顺序
// 入参：无
// 返回：结果与规则不符时失败
test('session policy orders idle logout before token refresh', () => {
  const { decideSessionAction, TOKEN_REFRESH_AFTER_MILLISECONDS, IDLE_LOGOUT_MILLISECONDS } = policy
  assert.equal(TOKEN_REFRESH_AFTER_MILLISECONDS, 30 * MINUTE)
  assert.equal(IDLE_LOGOUT_MILLISECONDS, 120 * MINUTE)
  assert.equal(decideSessionAction(START, START, START - 29 * MINUTE), 'none')
  assert.equal(decideSessionAction(START, START, START - 30 * MINUTE), 'refresh')
  assert.equal(decideSessionAction(START, START, null), 'none')
  assert.equal(decideSessionAction(START, START - 119 * MINUTE, START - 30 * MINUTE), 'refresh')
  // 两小时没操作时优先退出，哪怕凭证也该续期
  assert.equal(decideSessionAction(START, START - 120 * MINUTE, START - 30 * MINUTE), 'logout')
})

// 做什么：验证凭证满半小时自动续期，新凭证写回后不再重复请求
// 入参：无
// 返回：未续期、重复续期或没保存新凭证时失败
test('token is refreshed once after thirty minutes and the new one is stored', async () => {
  const setup = environment({}, 29)
  const { watch, calls } = startWatch(setup)
  await watch.check()
  assert.deepEqual(calls, [])
  setup.advance(1)
  await Promise.all([watch.check(), watch.check()])
  assert.deepEqual(calls.map((call) => call[0]), ['refresh', 'replace'])
  assert.equal(setup.token.getTokenIssuedAt(), START + 1 * MINUTE)
  await watch.check()
  assert.equal(calls.filter((call) => call[0] === 'refresh').length, 1)
  watch.stop()
})

// 做什么：验证有人操作时不会退出，操作时间会写到共享存储供其他标签页使用
// 入参：无
// 返回：提前退出或没记录操作时间时失败
test('user activity keeps the session and is shared through storage', async () => {
  const setup = environment()
  const { watch, calls } = startWatch(setup)
  setup.advance(110)
  setup.activity('keydown')
  setup.advance(9)
  await watch.check()
  assert.equal(setup.storage.getItem('fengxuan_last_activity'), String(START + 110 * MINUTE))
  assert.equal(calls.some((call) => call[0] === 'logout'), false)
  // 凭证已经用了 119 分钟，这一轮同时会把凭证续期
  assert.deepEqual(calls.map((call) => call[0]), ['refresh', 'replace'])
  watch.stop()
})

// 做什么：验证连续两小时没有操作时退出：作废凭证、清本地状态、提示并回登录页
// 入参：无
// 返回：未退出、没有提示或仍保留计时器时失败
test('two idle hours end the session', async () => {
  const setup = environment()
  const { watch, calls, messages, redirects } = startWatch(setup)
  setup.advance(120)
  await watch.check()
  assert.deepEqual(calls.map((call) => call[0]), ['revoke', 'logout'])
  assert.equal(messages.length, 1)
  assert.match(messages[0], /两小时/)
  assert.deepEqual(redirects, ['/login'])
  assert.equal(setup.token.getToken(), '')
  assert.equal(setup.storage.getItem('fengxuan_last_activity'), null)
  assert.equal(setup.timers.length, 0)
  await watch.check()
  assert.equal(calls.length, 2)
})

// 做什么：验证后台标签页不会被误判为无人操作，以共享存储里更新的操作时间为准
// 入参：无
// 返回：别的标签页一直在用时后台页仍退出则失败
test('activity in another tab prevents idle logout in a background tab', async () => {
  const setup = environment()
  const { watch, calls } = startWatch(setup)
  setup.advance(130)
  // 另一个标签页在两分钟前刚操作过
  setup.storage.setItem('fengxuan_last_activity', String(setup.clock.now - 2 * MINUTE))
  await watch.check()
  assert.equal(calls.some((call) => call[0] === 'logout'), false)
  watch.stop()
})

// 做什么：验证页面打开时上次操作已超过两小时，会立即退出
// 入参：无
// 返回：没有立即退出时失败
test('stale activity on startup ends the session at once', async () => {
  const setup = environment({ fengxuan_last_activity: String(START - 3 * 60 * MINUTE) })
  const { calls, redirects } = startWatch(setup)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls.some((call) => call[0] === 'logout'), true)
  assert.deepEqual(redirects, ['/login'])
})

// 做什么：验证续期被后端拒绝时结束会话，网络失败时保留会话等下一轮
// 入参：无
// 返回：该退出的没退出，或不该退出的退出时失败
test('rejected refresh ends the session while network failure keeps it', async () => {
  const rejected = environment({}, 31)
  const rejectedRun = startWatch(rejected, { refreshLogin: async () => { throw unauthorized() } })
  await rejectedRun.watch.check()
  assert.equal(rejectedRun.calls.some((call) => call[0] === 'logout'), true)
  assert.match(rejectedRun.messages[0], /失效/)
  assert.equal(rejected.token.getToken(), '')

  const unreachable = environment({}, 31)
  const unreachableRun = startWatch(unreachable, { refreshLogin: async () => { throw new Error('network') } })
  await unreachableRun.watch.check()
  assert.deepEqual(unreachableRun.calls, [])
  assert.notEqual(unreachable.token.getToken(), '')
  // 失败后不卡死：下一轮可以再次尝试
  await unreachableRun.watch.check()
  unreachableRun.watch.stop()
})

// 做什么：验证续期请求期间换了账号，旧账号的新凭证不会被采用
// 入参：无
// 返回：旧账号的凭证被写入时失败
test('credential of a replaced account is discarded after refresh', async () => {
  const setup = environment()
  const run = startWatch(setup, { refreshLogin: async () => {
    setup.token.saveToken(fakeToken(8))
    return { access_token: fakeToken(7), expires_in: 3600 }
  } })
  setup.advance(31)
  await run.watch.check()
  assert.equal(run.calls.some((call) => call[0] === 'replace'), false)
  assert.equal(setup.token.readAccountKey(), '8:0')
  run.watch.stop()
})

// 做什么：验证停止后移除监听和定时器，之后不再发任何请求
// 入参：无
// 返回：仍保留定时器或仍续期时失败
test('stop removes the timer and listeners', async () => {
  const setup = environment()
  const { watch, calls } = startWatch(setup)
  assert.equal(setup.timers.length, 1)
  assert.equal(setup.timers[0].delay, policy.SESSION_CHECK_INTERVAL_MILLISECONDS)
  watch.stop()
  assert.equal(setup.timers.length, 0)
  setup.advance(31)
  setup.activity()
  await watch.check()
  assert.deepEqual(calls, [])
})
