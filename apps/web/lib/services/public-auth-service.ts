import { randomBytes } from 'node:crypto'
import { createStudentUserRecord, emailExists, usernameExists } from '@/lib/repositories/auth-account-repository'
import { hashPassword } from '@/lib/password'

export type PublicSignUpResult =
  | { ok: true; email: string; username: string }
  | { ok: false; code: 'invalid-email' | 'email-taken' | 'invalid-name' | 'too-short' | 'mismatch' }

export async function registerStudentWithEmail(input: {
  email: string
  displayName: string
  password: string
  confirmPassword: string
}): Promise<PublicSignUpResult> {
  const email = normalizeEmail(input.email)
  const displayName = input.displayName.trim()

  if (!isValidEmail(email)) return { ok: false, code: 'invalid-email' }
  if (displayName.length < 2 || displayName.length > 24) return { ok: false, code: 'invalid-name' }
  if (input.password.length < 8) return { ok: false, code: 'too-short' }
  if (input.password !== input.confirmPassword) return { ok: false, code: 'mismatch' }
  if (await emailExists(email)) return { ok: false, code: 'email-taken' }

  const passwordHash = await hashPassword(input.password)
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const username = await generateUsernameFromEmail(email, attempt)
    try {
      const user = await createStudentUserRecord({
        username,
        email,
        displayName,
        passwordHash,
      })
      return { ok: true, email: user.email, username: user.username }
    } catch (error) {
      if (isUniqueViolation(error) && isEmailUniqueViolation(error)) return { ok: false, code: 'email-taken' }
      if (isUniqueViolation(error)) continue
      throw error
    }
  }

  throw new Error('Failed to allocate a unique username')
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function generateUsernameFromEmail(email: string, attempt: number): Promise<string> {
  const [localPart] = email.split('@')
  const base = normalizeUsernameBase(localPart ?? '')
  const candidate = attempt === 0 ? base : `${base.slice(0, Math.max(3, 24 - 5))}-${randomBytes(2).toString('hex')}`
  if (!(await usernameExists(candidate))) return candidate
  return `${base.slice(0, Math.max(3, 24 - 5))}-${randomBytes(2).toString('hex')}`
}

function normalizeUsernameBase(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 24)
  if (normalized.length >= 3) return normalized
  return `user-${randomBytes(4).toString('hex')}`.slice(0, 24)
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

function isEmailUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('constraint' in error)) return false
  return String(error.constraint).toLowerCase().includes('email')
}
