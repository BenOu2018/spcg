'use server'

import { cookies } from 'next/headers'
import { redirect, RedirectType } from 'next/navigation'
import { auth } from '@/auth'
import { isAvatarUploadFile, saveAvatarUpload } from '@/lib/avatar-upload'
import {
  requestPhoneVerification,
  updateAccountPassword,
  updateAccountProfile,
  updateAccountUiLocale,
  verifyPhoneCode,
} from '@/lib/services/account-settings-service'
import { buildSettingsActionHref, type SettingsActionResult } from '@/lib/settings-url'
import { UI_LOCALE_COOKIE } from '@/lib/student-ui'

export async function updateAccountProfileAction(formData: FormData) {
  redirectToSettingsResult(await updateAccountProfileResultAction(formData))
}

export async function updateAccountProfileResultAction(formData: FormData): Promise<SettingsActionResult> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/auth/sign-in?next=/settings')

  const displayName = readRequired(formData, 'displayName')
  let avatarUrl = readOptional(formData, 'currentAvatarUrl')
  const avatarFile = formData.get('avatarFile')
  if (isAvatarUploadFile(avatarFile)) {
    const upload = await saveAvatarUpload({ userId, file: avatarFile })
    if (!upload.ok && upload.code !== 'avatar-empty') return settingsResult('profile', 'profile', upload.code)
    if (upload.ok) avatarUrl = upload.avatarUrl
  }

  const result = await updateAccountProfile({ userId, displayName, avatarUrl })
  if (!result.ok) return settingsResult('profile', 'profile', result.code)

  return settingsResult('profile', 'profile', 'saved', undefined, { avatarUrl })
}

export async function updatePasswordAction(formData: FormData) {
  redirectToSettingsResult(await updatePasswordResultAction(formData))
}

export async function updatePasswordResultAction(formData: FormData): Promise<SettingsActionResult> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/auth/sign-in?next=/settings')

  const currentPassword = readRequired(formData, 'currentPassword')
  const nextPassword = readRequired(formData, 'nextPassword')
  const confirmPassword = readRequired(formData, 'confirmPassword')
  const result = await updateAccountPassword({ userId, currentPassword, nextPassword, confirmPassword })
  if (!result.ok && result.code === 'not-found') redirect('/auth/sign-in?next=/settings')
  if (!result.ok) return settingsResult('security', 'password', result.code)

  return settingsResult('security', 'password', 'saved')
}

export async function updateUiLocaleAction(formData: FormData) {
  redirectToSettingsResult(await updateUiLocaleResultAction(formData))
}

export async function updateUiLocaleResultAction(formData: FormData): Promise<SettingsActionResult> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/auth/sign-in?next=/settings')

  const uiLocale = readRequired(formData, 'uiLocale')
  const result = await updateAccountUiLocale({ userId, uiLocale })
  if (!result.ok) return settingsResult('language', 'language', result.code)

  const cookieStore = await cookies()
  cookieStore.set(UI_LOCALE_COOKIE, result.uiLocale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })

  return settingsResult('language', 'language', 'saved')
}

export async function requestPhoneVerificationAction(formData: FormData) {
  redirectToSettingsResult(await requestPhoneVerificationResultAction(formData))
}

export async function requestPhoneVerificationResultAction(formData: FormData): Promise<SettingsActionResult> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/auth/sign-in?next=/settings')

  const phoneNumber = readRequired(formData, 'phoneNumber')
  const result = await requestPhoneVerification({ userId, phoneNumber })
  if (!result.ok) return settingsResult('phone', 'phone', result.code, { phoneNumber: phoneNumber.trim() })

  return settingsResult('phone', 'phone', 'sent', {
    phoneNumber: phoneNumber.trim(),
    devCode: result.developmentCode,
  })
}

export async function verifyPhoneCodeAction(formData: FormData) {
  redirectToSettingsResult(await verifyPhoneCodeResultAction(formData))
}

export async function verifyPhoneCodeResultAction(formData: FormData): Promise<SettingsActionResult> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/auth/sign-in?next=/settings')

  const phoneNumber = readRequired(formData, 'phoneNumber')
  const code = readRequired(formData, 'code')
  const devCode = readOptional(formData, 'devCode')
  const result = await verifyPhoneCode({ userId, phoneNumber, code })
  if (!result.ok) return settingsResult('phone', 'phone', result.code, { phoneNumber: phoneNumber.trim(), devCode })

  return settingsResult('phone', 'phone', 'verified', { phoneNumber: phoneNumber.trim(), devCode })
}

function settingsResult(
  tab: SettingsActionResult['tab'],
  statusKey: NonNullable<SettingsActionResult['statusKey']>,
  statusCode: string,
  extraParams?: SettingsActionResult['extraParams'],
  clientState?: SettingsActionResult['clientState'],
): SettingsActionResult {
  return { tab, statusKey, statusCode, extraParams, clientState }
}

function redirectToSettingsResult(result: SettingsActionResult): never {
  redirect(buildSettingsActionHref('', result), RedirectType.replace)
}

function readRequired(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function readOptional(formData: FormData, key: string): string | null {
  const value = readRequired(formData, key)
  return value.length > 0 ? value : null
}
