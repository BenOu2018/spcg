import { randomBytes } from 'node:crypto'
import {
  consumePasswordResetTokenAndUpdatePassword,
  createPasswordResetTokenRecord,
  findPasswordResetUserByEmail,
  getActivePasswordResetToken,
} from '@/lib/repositories/password-reset-repository'
import { hashPassword } from '@/lib/password'
import { sendSystemMail } from '@/lib/services/mail-service'
import { hashResetToken } from '@/lib/services/password-reset-token-service'
import { isValidEmail, normalizeEmail } from '@/lib/services/public-auth-service'

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000

export type RequestPasswordResetResult =
  | { ok: true; code: 'sent-or-ignored' }
  | { ok: false; code: 'invalid-email' | 'mail-failed' }

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; code: 'invalid-token' | 'expired-token' | 'too-short' | 'mismatch' }

export async function requestPasswordReset(input: {
  email: string
  origin: string
}): Promise<RequestPasswordResetResult> {
  const email = normalizeEmail(input.email)
  if (!isValidEmail(email)) return { ok: false, code: 'invalid-email' }

  const user = await findPasswordResetUserByEmail(email)
  if (!user || user.accountStatus === 'suspended' || user.accountStatus === 'deleted') {
    return { ok: true, code: 'sent-or-ignored' }
  }

  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashResetToken(token)
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)
  await createPasswordResetTokenRecord({
    userId: user.id,
    email,
    tokenHash,
    expiresAt,
  })

  try {
    await sendSystemMail({
      to: email,
      subject: 'SPCG 密码重置',
      text: buildPasswordResetText({
        displayName: user.displayName ?? user.username,
        resetUrl: buildResetUrl(input.origin, token),
        expiresAt,
      }),
    })
  } catch {
    return { ok: false, code: 'mail-failed' }
  }

  return { ok: true, code: 'sent-or-ignored' }
}

export async function resetPasswordWithToken(input: {
  token: string
  password: string
  confirmPassword: string
}): Promise<ResetPasswordResult> {
  const token = input.token.trim()
  if (!token) return { ok: false, code: 'invalid-token' }
  if (input.password.length < 8) return { ok: false, code: 'too-short' }
  if (input.password !== input.confirmPassword) return { ok: false, code: 'mismatch' }

  const record = await getActivePasswordResetToken(hashResetToken(token))
  if (!record) return { ok: false, code: 'invalid-token' }
  if (new Date(record.expiresAt).getTime() <= Date.now()) return { ok: false, code: 'expired-token' }

  const passwordHash = await hashPassword(input.password)
  const consumed = await consumePasswordResetTokenAndUpdatePassword({
    tokenId: record.id,
    userId: record.userId,
    passwordHash,
  })
  return consumed ? { ok: true } : { ok: false, code: 'invalid-token' }
}

function buildResetUrl(origin: string, token: string): string {
  const baseUrl = normalizeOrigin(origin) || normalizeOrigin(process.env.AUTH_URL ?? '') || normalizeOrigin(process.env.NEXTAUTH_URL ?? '') || 'http://localhost:3000'
  const url = new URL('/auth/reset-password', baseUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

function normalizeOrigin(value: string): string {
  try {
    const url = new URL(value)
    return url.origin
  } catch {
    return ''
  }
}

function buildPasswordResetText(input: {
  displayName: string
  resetUrl: string
  expiresAt: Date
}): string {
  return [
    `${input.displayName}，你好：`,
    '',
    '你正在重置 SPCG 账号密码。请打开下面的链接设置新密码：',
    input.resetUrl,
    '',
    `链接将在 ${input.expiresAt.toLocaleString('zh-CN', { hour12: false })} 前有效。`,
    '如果不是你本人操作，请忽略这封邮件。',
  ].join('\n')
}
