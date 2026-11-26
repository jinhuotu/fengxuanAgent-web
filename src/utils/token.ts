/**
 * token 的读写统一走这里。
 * 为什么单独一个文件：storage 的 key 写错一次，登录就"莫名其妙失效"，
 * 而报错信息不会告诉你是 key 拼错了。所有地方引用同一个常量即可。
 *
 * 除了凭证本身，这里还记两个时间点：凭证什么时候签发的、上次操作是什么时候。
 * 前者决定要不要续期，后者决定要不要因长时间无操作而退出。
 */

export const TOKEN_KEY = 'fengxuan_token'
export const TOKEN_ISSUED_AT_KEY = 'fengxuan_token_issued_at'
export const LAST_ACTIVITY_KEY = 'fengxuan_last_activity'

// 凭证里"第几批登录"的字段名，与后端 app/core/security.py 的 TOKEN_VERSION_CLAIM 一致
const TOKEN_VERSION_CLAIM = 'ver'
const JWT_PART_COUNT = 3

// 做什么：取出凭证中间那一段并还原成字段，不验签
// 入参：凭证字符串
// 返回：字段对象；不是标准三段格式或内容解不开时返回 null
function readClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== JWT_PART_COUNT) return null
  let claims: unknown = null
  try {
    // 新手注意：JWT 像一张盖了章的介绍信，中间一段只是转了码，不是加密，谁都读得懂。
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    claims = JSON.parse(atob(padded))
  } catch {
    // 解不开说明不是标准凭证（比如测试用的占位字符串），按不透明字符串处理，不需要提示任何人
    return null
  }
  return typeof claims === 'object' && claims !== null ? (claims as Record<string, unknown>) : null
}

// 做什么：得到能标识"哪个账号的哪一批登录"的字符串
// 入参：凭证字符串，默认读当前保存的
// 返回：账号编号加令牌版本；凭证解不开时原样返回
// 为什么需要：续期会换凭证字符串，但人还是同一个人。判断"是不是换了账号"要看这个，不能看凭证本身
export function readAccountKey(token: string = getToken()): string {
  const claims = readClaims(token)
  if (claims === null) return token
  return `${String(claims.sub)}:${String(claims[TOKEN_VERSION_CLAIM] ?? '')}`
}

// 做什么：读本地保存的 token
// 入参：无
// 返回：token 字符串；没登录过返回空字符串（不返回 null，调用方少判一次）
export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

// 做什么：读当前凭证的签发时间
// 入参：无
// 返回：毫秒时间戳；没有记录或记录损坏时返回 null
export function getTokenIssuedAt(): number | null {
  const rawValue = localStorage.getItem(TOKEN_ISSUED_AT_KEY)
  if (rawValue === null) return null
  const issuedAt = Number(rawValue)
  return Number.isFinite(issuedAt) && issuedAt > 0 ? issuedAt : null
}

// 做什么：保存 token 和它的签发时间
// 入参：后端返回的 token 字符串；签发时间默认取现在，由本机记录而不是解析凭证，避免本机和服务器时钟不一致
// 返回：无
export function saveToken(token: string, issuedAt: number = Date.now()): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(TOKEN_ISSUED_AT_KEY, String(issuedAt))
}

// 做什么：清除 token 及其时间记录（退出登录或 token 失效时调用）
// 入参：无
// 返回：无；上次操作时间一并清掉，下次登录从零开始计时
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_ISSUED_AT_KEY)
  localStorage.removeItem(LAST_ACTIVITY_KEY)
}
