import { createStudentUserRecord, emailExists, usernameExists } from '@/lib/repositories/auth-account-repository'
import { hashPassword } from '@/lib/password'
import {
  isEmailLikeUsername,
  isValidStudentUsername,
  normalizeUsername,
  STUDENT_USERNAME_INVALID_MESSAGE,
} from '@/lib/user-identity'

export type PublicSignUpResult =
  | { ok: true; email: string | null; username: string }
  | {
      ok: false
      code:
        | 'invalid-email'
        | 'email-taken'
        | 'invalid-username'
        | 'username-taken'
        | 'email-like-username'
        | 'too-short'
        | 'mismatch'
    }

export async function registerStudentAccount(input: {
  username: string
  email?: string | null
  password: string
  confirmPassword: string
}): Promise<PublicSignUpResult> {
  const username = normalizeUsername(input.username)
  const email = normalizeEmail(input.email ?? '')

  if (isEmailLikeUsername(username)) return { ok: false, code: 'email-like-username' }
  if (!isValidStudentUsername(username)) return { ok: false, code: 'invalid-username' }
  if (email && !isValidEmail(email)) return { ok: false, code: 'invalid-email' }
  if (input.password.length < 8) return { ok: false, code: 'too-short' }
  if (input.password !== input.confirmPassword) return { ok: false, code: 'mismatch' }
  if (await usernameExists(username)) return { ok: false, code: 'username-taken' }
  if (email && (await emailExists(email))) return { ok: false, code: 'email-taken' }

  const passwordHash = await hashPassword(input.password)
  try {
    const user = await createStudentUserRecord({
      username,
      email: email || null,
      displayName: username,
      passwordHash,
    })
    return { ok: true, email: user.email, username: user.username }
  } catch (error) {
    if (isUniqueViolation(error) && isEmailUniqueViolation(error)) return { ok: false, code: 'email-taken' }
    if (isUniqueViolation(error)) return { ok: false, code: 'username-taken' }
    if (isUsernameLengthConstraintError(error)) return { ok: false, code: 'invalid-username' }
    throw error
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

function isEmailUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('constraint' in error)) return false
  return String(error.constraint).toLowerCase().includes('email')
}

function isUsernameLengthConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const pgError = error as { code?: string; constraint?: string }
  return pgError.code === '23514' && String(pgError.constraint ?? '').toLowerCase() === 'users_username_length'
}

export { STUDENT_USERNAME_INVALID_MESSAGE }
