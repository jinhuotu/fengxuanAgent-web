const MIN_PASSWORD_CHARACTERS = 8
const MAX_PASSWORD_BYTES = 128
const utf8Encoder = new TextEncoder()

// 做什么：检查所有密码输入共用的 UTF-8 字节上限。
// 入参：表单校验规则和用户输入的密码。
// 返回：合规时完成，超限时抛出由表单显示的提示。
// 新手注意：字节像行李重量，同样件数的行李可以有不同重量。
export async function validatePasswordByteLimit(_validationRule: unknown, password: string): Promise<void> {
  if (utf8Encoder.encode(password).length > MAX_PASSWORD_BYTES) {
    throw new Error(`密码最多 ${MAX_PASSWORD_BYTES} 个 UTF-8 字节`)
  }
}

// 做什么：检查新密码的字符下限和 UTF-8 字节上限。
// 入参：表单校验规则和用户输入的新密码。
// 返回：合规时完成，失败时抛出由表单显示的提示。
export async function validateNewPassword(validationRule: unknown, password: string): Promise<void> {
  if (Array.from(password).length < MIN_PASSWORD_CHARACTERS) {
    throw new Error(`密码至少 ${MIN_PASSWORD_CHARACTERS} 个字符`)
  }
  await validatePasswordByteLimit(validationRule, password)
}
