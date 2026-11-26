import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/utils/token.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText

// 做什么：创建一块只在内存里的本地存储，行为与浏览器的 localStorage 一致
// 入参：初始键值
// 返回：带 getItem / setItem / removeItem 的存储对象
export function createMemoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial))
  return {
    getItem: (key) => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => { entries.set(key, String(value)) },
    removeItem: (key) => { entries.delete(key) },
    clear: () => entries.clear(),
  }
}

// 做什么：加载真实的凭证工具模块，只把浏览器本地存储换成调用方给的那块
// 入参：存储对象，以及需要替换的导出（例如测试里可变的读取函数）
// 返回：真实模块的导出，未替换的部分保持源码行为
// 为什么：模块内部读凭证不经过导出对象，所以替换读取函数时，存储里的凭证一项也要跟着走它，
//         否则同一个模块里对外一个值、对内另一个值，测试会得出和页面上不一致的结论
export function loadTokenModule(storage, overrides = {}) {
  const exported = {}
  const readToken = overrides.getToken
  const view = readToken ? {
    getItem: (key) => key === TOKEN_KEY ? readToken() : storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    clear: () => storage.clear(),
  } : storage
  const unexpectedImport = (name) => { throw new Error(`凭证工具不应依赖其他模块：${name}`) }
  new Function('require', 'exports', 'localStorage', 'atob', compiled)(unexpectedImport, exported, view, atob)
  return Object.assign(exported, overrides)
}

// 与源码里的 TOKEN_KEY 相同；上面构造存储视图时模块还没加载，拿不到它导出的常量
const TOKEN_KEY = 'fengxuan_token'

// 做什么：构造外观与真实凭证一致、但未经签名的测试凭证
// 入参：账号编号和令牌版本
// 返回：三段点分的字符串，中间一段是可解析的字段
export function fakeToken(subject, tokenVersion = 0) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: String(subject), ver: tokenVersion })}.test-signature`
}
