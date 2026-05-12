'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { isAvatarUploadFile, saveAvatarUpload } from '@/lib/avatar-upload'
import {
  requestPhoneVerification,
  updateAccountPassword,
  updateAccountProfile,
  updateAccountUiLocale,
  verifyPhoneCode,
} from '@/lib/services/account-settings-service'
import { UI_LOCALE_COOKIE } from '@/lib/student-ui'

export async function updateAccountProfileAction(formData: FormData) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/auth/sign-in?next=/settings')

  const displayName = readRequired(formData, 'displayName')
  let avatarUrl = readOptional(formData, 'currentAvatarUrl')
  const avatarFile = formData.get('avatarFile')
  if (isAvatarUploadFile(avatarFile)) {
    const upload = await saveAvatarUpload({ userId, file: avatarFile })
    if (!upload.ok && upload.code !== 'avatar-empty') redirect(`/settings?profile=${upload.code}`)
    if (upload.ok) avatarUrl = upload.avatarUrl
  }
  const result = await updateAccountProfile({ userId, displayName, avatarUrl })
  if (!result.ok) redirect(`/settings?tab=profile&profile=${result.code}`)

  redirect('/settings?tab=profile&profile=saved')
}

export async function updatePasswordAction(formData: FormData) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/auth/sign-in?next=/settings')

  const currentPassword = readRequired(formData, 'currentPassword')
  const nextPassword = readRequired(formData, 'nextPassword')
  const confirmPassword = readRequired(formData, 'confirmPassword')
  const result = await updateAccountPassword({ userId, currentPassword, nextPassword, confirmPassword })
  if (!result.ok && result.code === 'not-found') redirect('/auth/sign-in?next=/settings')
  if (!result.ok) redirect(`/settings?tab=security&password=${result.code}`)

  redirect('/settings?tab=security&password=saved')
}

export async function updateUiLocaleAction(formData: FormData) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/auth/sign-in?next=/settings')

  const uiLocale = readRequired(formData, 'uiLocale')
  const result = await updateAccountUiLocale({ userId, uiLocale })
  if (!result.ok) redirect(`/settings?tab=language&language=${result.code}`)

  const cookieStore = await cookies()
  cookieStore.set(UI_LOCALE_COOKIE, result.uiLocale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })

  redirect('/settings?tab=language&language=saved')
}

export async function requestPhoneVerificationAction(formData: FormData) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/auth/sign-in?next=/settings')

  const phoneNumber = readRequired(formData, 'phoneNumber')
  const result = await requestPhoneVerification({ userId, phoneNumber })
  if (!result.ok) redirect(`/settings?phone=${result.code}`)

  const params = new URLSearchParams({
    tab: 'phone',
    phone: 'sent',
    phoneNumber: phoneNumber.trim(),
    devCode: result.developmentCode,
  })
  redirect(`/settings?${params.toString()}`)
}

export async function verifyPhoneCodeAction(formData: FormData) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/auth/sign-in?next=/settings')

  const phoneNumber = readRequired(formData, 'phoneNumber')
  const code = readRequired(formData, 'code')
  const result = await verifyPhoneCode({ userId, phoneNumber, code })
  if (!result.ok) redirect(`/settings?tab=phone&phone=${result.code}`)

  redirect('/settings?tab=phone&phone=verified')
}

function readRequired(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function readOptional(formData: FormData, key: string): string | null {
  const value = readRequired(formData, key)
  return value.length > 0 ? value : null
}
