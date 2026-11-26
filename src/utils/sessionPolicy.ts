/**
 * 登录时长的规则：只放数字和一个纯判断，不碰浏览器。
 * 为什么单独一个文件：判断不依赖页面，测试可以直接喂不同的时间来验证，不用真的等半小时。
 */

/** 凭证签发满这么久就换一张新的。后端给的有效期是一小时，在一半处续期留足余量 */
export const TOKEN_REFRESH_AFTER_MILLISECONDS = 30 * 60 * 1000

/** 连续这么久没有任何操作就退出登录 */
export const IDLE_LOGOUT_MILLISECONDS = 120 * 60 * 1000

/** 每隔这么久检查一次；页面开着时一直在跑，所以放着不动凭证也会按时续期 */
export const SESSION_CHECK_INTERVAL_MILLISECONDS = 60 * 1000

export type SessionAction = 'logout' | 'refresh' | 'none'

// 做什么：根据上次操作时间和凭证年龄，决定这一轮检查要做什么
// 入参：当前时间、上次操作时间、凭证签发时间（拿不到时为 null），单位都是毫秒
// 返回：先判断是否该因无操作退出，再判断是否该续期，都不满足时为 none
export function decideSessionAction(
  now: number, lastActivityAt: number, tokenIssuedAt: number | null,
): SessionAction {
  if (now - lastActivityAt >= IDLE_LOGOUT_MILLISECONDS) return 'logout'
  // 签发时间未知时不续期：宁可不续，也不每分钟重复请求
  if (tokenIssuedAt === null) return 'none'
  return now - tokenIssuedAt >= TOKEN_REFRESH_AFTER_MILLISECONDS ? 'refresh' : 'none'
}
