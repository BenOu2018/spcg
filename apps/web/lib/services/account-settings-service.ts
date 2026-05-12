import { createHash, randomInt } from 'node:crypto'
import {
  createPhoneVerificationCodeRecord,
  findVerifiedPhoneOwner,
  getAccountSettingsRecord,
  getLatestActivePhoneVerificationCode,
  getUserPasswordHash,
  incrementPhoneVerificationAttempt,
  updateAccountProfileRecord,
  updateAccountUiLocaleRecord,
  updateUserPasswordHash,
  verifyPhoneNumberRecord,
  type AccountSettingsRecord,
} from '@/lib/repositories/account-settings-repository'
import type { UiLocale } from '@spcg/shared/types'
import { hashPassword, verifyPassword } from '@/lib/password'
import { isValidPhoneNumber, maskPhoneNumber, normalizePhoneNumber } from '@/lib/user-identity'

export type AccountSettingsSummary = AccountSettingsRecord
export type PhoneVerificationStatus = 'unbound' | 'pending' | 'verified'

export type PhoneVerificationSummary = {
  status: PhoneVerificationStatus
  phoneNumber: string | null
  phoneNumberMasked: string | null
  phoneVerified: boolean
}

export type UpdateAccountProfileResult =
  | { ok: true }
  | { ok: false; code: 'invalid-name' | 'invalid-avatar' }

export type UpdatePasswordResult =
  | { ok: true }
  | { ok: false; code: 'too-short' | 'mismatch' | 'wrong-current' | 'not-found' }

export type UpdateUiLocaleResult =
  | { ok: true; uiLocale: UiLocale }
  | { ok: false; code: 'invalid-locale' }

export type RequestPhoneVerificationResult =
  | { ok: true; developmentCode: string; phoneNumberMasked: string; expiresAt: string }
  | { ok: false; code: 'invalid-phone' | 'phone-taken' }

export type VerifyPhoneCodeResult =
  | { ok: true }
  | { ok: false; code: 'invalid-phone' | 'phone-taken' | 'code-missing' | 'code-expired' | 'code-invalid' | 'too-many-attempts' }

export async function getAccountSettings(userId: string): Promise<AccountSettingsSummary | null> {
  return getAccountSettingsRecord(userId)
}

export function getPhoneVerificationSummary(account: AccountSettingsRecord | null): PhoneVerificationSummary {
  if (!account?.phoneNumber) {
    return { status: 'unbound', phoneNumber: null, phoneNumberMasked: null, phoneVerified: false }
  }

  return {
    status: account.phoneVerifiedAt ? 'verified' : 'pending',
    phoneNumber: account.phoneNumber,
    phoneNumberMasked: maskPhoneNumber(account.phoneNumber),
    phoneVerified: Boolean(account.phoneVerifiedAt),
  }
}

export async function updateAccountProfile(input: {
  userId: string
  displayName: string
  avatarUrl: string | null
}): Promise<UpdateAccountProfileResult> {
  if (input.displayName.length < 2 || input.displayName.length > 24) {
    return { ok: false, code: 'invalid-name' }
  }
  if (input.avatarUrl && !isSafeAvatarUrl(input.avatarUrl)) {
    return { ok: false, code: 'invalid-avatar' }
  }

  await updateAccountProfileRecord(input)
  return { ok: true }
}

export async function updateAccountPassword(input: {
  userId: string
  currentPassword: string
  nextPassword: string
  confirmPassword: string
}): Promise<UpdatePasswordResult> {
  if (input.nextPassword.length < 8) return { ok: false, code: 'too-short' }
  if (input.nextPassword !== input.confirmPassword) return { ok: false, code: 'mismatch' }

  const currentHash = await getUserPasswordHash(input.userId)
  if (!currentHash) return { ok: false, code: 'not-found' }
  const currentValid = await verifyPassword(input.currentPassword, currentHash)
  if (!currentValid) return { ok: false, code: 'wrong-current' }

  const nextHash = await hashPassword(input.nextPassword)
  await updateUserPasswordHash({ userId: input.userId, passwordHash: nextHash })
  return { ok: true }
}

export async function updateAccountUiLocale(input: {
  userId: string
  uiLocale: string
}): Promise<UpdateUiLocaleResult> {
  if (input.uiLocale !== 'zh-CN' && input.uiLocale !== 'en-US') return { ok: false, code: 'invalid-locale' }
  const uiLocale: UiLocale = input.uiLocale
  await updateAccountUiLocaleRecord({ userId: input.userId, uiLocale })
  return { ok: true, uiLocale }
}

export async function requestPhoneVerification(input: {
  userId: string
  phoneNumber: string
}): Promise<RequestPhoneVerificationResult> {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber)
  if (!isValidPhoneNumber(phoneNumber)) return { ok: false, code: 'invalid-phone' }

  const owner = await findVerifiedPhoneOwner(phoneNumber)
  if (owner && owner !== input.userId) return { ok: false, code: 'phone-taken' }

  const developmentCode = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
  await createPhoneVerificationCodeRecord({
    userId: input.userId,
    phoneNumber,
    codeHash: hashPhoneVerificationCode(phoneNumber, developmentCode),
    expiresAt,
  })

  return {
    ok: true,
    developmentCode,
    phoneNumberMasked: maskPhoneNumber(phoneNumber) ?? phoneNumber,
    expiresAt: expiresAt.toISOString(),
  }
}

export async function verifyPhoneCode(input: {
  userId: string
  phoneNumber: string
  code: string
}): Promise<VerifyPhoneCodeResult> {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber)
  const code = input.code.trim()
  if (!isValidPhoneNumber(phoneNumber)) return { ok: false, code: 'invalid-phone' }
  if (!/^\d{6}$/.test(code)) return { ok: false, code: 'code-invalid' }

  const owner = await findVerifiedPhoneOwner(phoneNumber)
  if (owner && owner !== input.userId) return { ok: false, code: 'phone-taken' }

  const record = await getLatestActivePhoneVerificationCode({ userId: input.userId, phoneNumber })
  if (!record) return { ok: false, code: 'code-missing' }
  if (new Date(record.expiresAt).getTime() <= Date.now()) return { ok: false, code: 'code-expired' }
  if (record.attemptCount >= 5) return { ok: false, code: 'too-many-attempts' }

  const expectedHash = hashPhoneVerificationCode(phoneNumber, code)
  if (expectedHash !== record.codeHash) {
    await incrementPhoneVerificationAttempt(record.id)
    return { ok: false, code: 'code-invalid' }
  }

  try {
    await verifyPhoneNumberRecord({ userId: input.userId, phoneNumber, codeId: record.id })
  } catch (error) {
    if (isPhoneTakenError(error)) return { ok: false, code: 'phone-taken' }
    throw error
  }
  return { ok: true }
}

function isSafeAvatarUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function hashPhoneVerificationCode(phoneNumber: string, code: string): string {
  return createHash('sha256').update(`${phoneNumber}:${code}`).digest('hex')
}

function isPhoneTakenError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'PHONE_TAKEN'
}
