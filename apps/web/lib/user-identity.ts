export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase()
}

export function isValidUsername(value: string): boolean {
  const username = normalizeUsername(value)
  return username.length >= 3 && username.length <= 24 && /^[\p{Script=Han}a-z0-9_-]+$/u.test(username)
}

export const STUDENT_USERNAME_RULE_TITLE = '中文至少 2 个汉字，英文账号至少 4 位；可包含数字、下划线或连字符；不要填写邮箱。'
export const STUDENT_USERNAME_INVALID_MESSAGE =
  '学生用户名需要至少 2 个中文汉字，或至少 4 位英文账号；可包含数字、下划线或连字符。'

export function isValidStudentUsername(value: string): boolean {
  const username = normalizeUsername(value)
  if (username.length < 2 || username.length > 24) return false
  if (!/^[\p{Script=Han}a-z0-9_-]+$/u.test(username)) return false

  let hanCount = 0
  let latinLetterCount = 0
  let latinAccountLength = 0
  for (const character of username) {
    if (/\p{Script=Han}/u.test(character)) {
      hanCount += 1
    } else if (/[a-z]/.test(character)) {
      latinLetterCount += 1
      latinAccountLength += 1
    } else if (/[0-9_-]/.test(character)) {
      latinAccountLength += 1
    }
  }

  return hanCount >= 2 || (latinLetterCount > 0 && latinAccountLength >= 4)
}

export function isEmailLikeUsername(value: string): boolean {
  const username = normalizeUsername(value)
  return username.includes('@')
}

export function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`
  }
  return trimmed.replace(/\D/g, '')
}

export function isValidPhoneNumber(value: string): boolean {
  const phone = normalizePhoneNumber(value)
  return /^(\+?\d{8,15})$/.test(phone)
}

export function maskPhoneNumber(value: string | null): string | null {
  if (!value) return null
  const phone = normalizePhoneNumber(value)
  if (phone.length <= 7) return phone
  const prefixLength = phone.startsWith('+') ? 4 : 3
  return `${phone.slice(0, prefixLength)}****${phone.slice(-4)}`
}
