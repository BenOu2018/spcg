export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase()
}

export function isValidUsername(value: string): boolean {
  const username = normalizeUsername(value)
  return username.length >= 3 && username.length <= 24 && /^[\p{Script=Han}a-z0-9_-]+$/u.test(username)
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
