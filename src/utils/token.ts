/**
 * token 的读写统一走这里。
 * 为什么单独一个文件：storage 的 key 写错一次，登录就"莫名其妙失效"，
 * 而报错信息不会告诉你是 key 拼错了。所有地方引用同一个常量即可。
 */

export const TOKEN_KEY = 'fengxuan_token'

// 做什么：读本地保存的 token
// 入参：无
// 返回：token 字符串；没登录过返回空字符串（不返回 null，调用方少判一次）
export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

// 做什么：保存 token
// 入参：后端返回的 token 字符串
// 返回：无
export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

// 做什么：清除 token（退出登录或 token 失效时调用）
// 入参：无
// 返回：无
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}
