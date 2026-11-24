import { readFile } from 'node:fs/promises'
import { reactive } from 'vue'
import ts from 'typescript'

const source = await readFile(new URL('../src/composables/useChat.ts', import.meta.url), 'utf8')
const recoverySource = await readFile(new URL('../src/composables/chatRecovery.ts', import.meta.url), 'utf8')
const compiledRecovery = ts.transpileModule(recoverySource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const historySource = await readFile(new URL('../src/composables/chatHistory.ts', import.meta.url), 'utf8')
const compiledHistory = ts.transpileModule(historySource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const extraModules = {}
for (const path of ['utils/tabChannel', 'composables/chatRemote', 'composables/chatTabSync']) {
  const moduleSource = await readFile(new URL(`../src/${path}.ts`, import.meta.url), 'utf8')
  extraModules[`@/${path}`] = ts.transpileModule(moduleSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
}

// 做什么：加载真实交互模块，只替换网络和身份边界
// 入参：模拟 API 和当前 token 的读取函数
// 返回：真实 useChat，不复制实现逻辑
export function loadChat(api, getToken = () => 'owner-token', browser = {}) {
  const exported = {}
  const modules = { vue: { reactive }, '@/api/chat': api, '@/utils/token': { getToken, TOKEN_KEY: 'fengxuan_token' } }
  const recoveryExports = {}
  new Function('require', 'exports', 'setTimeout', compiledRecovery)((name) => modules[name], recoveryExports, (callback) => setTimeout(callback, 0))
  modules['@/composables/chatRecovery'] = recoveryExports
  const historyExports = {}
  new Function('require', 'exports', compiledHistory)((name) => modules[name], historyExports)
  modules['@/composables/chatHistory'] = historyExports
  for (const [name, compiledModule] of Object.entries(extraModules)) {
    const moduleExports = {}
    new Function('require', 'exports', 'window', 'document', compiledModule)((key) => modules[key], moduleExports, browser.window, browser.document)
    modules[name] = moduleExports
  }
  new Function('require', 'exports', compiled)((name) => modules[name], exported)
  return exported.useChat(0)
}

// 做什么：加载真实结果恢复模块，供多轮临时编号的顺序回归使用
// 入参：模拟 API
// 返回：实际模块导出，不复制恢复实现
export function loadRecovery(api) {
  const exported = {}
  new Function('require', 'exports', 'setTimeout', compiledRecovery)((name) => ({ '@/api/chat': api })[name], exported,
    (callback) => setTimeout(callback, 0))
  return exported
}

// 做什么：构造服务端公开消息
// 入参：角色和正文
// 返回：用于页面恢复的测试消息
export function message(role, content) {
  return { id: role === 'user' ? 1 : 2, request_id: 'stored-request', role, content,
    status: 'completed', model: null, finish_reason: null, error_code: null, created_at: '2026-11-23T12:00:00' }
}

// 做什么：提供可单独覆盖方法的模拟 API
// 入参：替换方法字典
// 返回：符合请求模块边界的测试实现
export function baseApi(overrides = {}) {
  return {
    ChatRequestError,
    getChatSessions: async () => ({ items: [{ id: 1, title: '测试会话' }], total: 1 }),
    getChatHistory: async () => ({ items: [], total: 0 }),
    interruptChat: async () => undefined,
    ...overrides,
  }
}

// 做什么：模拟真实请求异常的状态和业务码
// 入参：安全文案、HTTP 状态和业务码
// 返回：测试异常
export class ChatRequestError extends Error {
  // 做什么：保留错误的状态和业务码
  // 入参：文案、HTTP 状态和业务码
  // 返回：不含真实凭证的异常
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

// 做什么：创建两个可独立推进和取消的模拟流
// 入参：可选 API 覆盖
// 返回：真实页面交互、模拟流和停止通知记录
export function parallelChat(overrides = {}) {
  const streams = new Map()
  const interruptions = []
  const api = baseApi({
    createChatSession: async () => ({ id: 3, title: '新会话' }),
    interruptChat: async (sessionId) => { interruptions.push(sessionId) },
    streamChat: (sessionId, requestId, content, signal, onEvent) => new Promise((resolve) => {
      streams.set(sessionId, { signal, onEvent, resolve })
      signal.addEventListener('abort', resolve, { once: true })
    }),
    ...overrides,
  })
  return { chat: loadChat(api), streams, interruptions }
}

