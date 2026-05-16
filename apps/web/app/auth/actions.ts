'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { signIn, signOut } from '@/auth'
import { isDbConfigured } from '@/lib/db'
import { requestPasswordReset, resetPasswordWithToken } from '@/lib/services/password-reset-service'
import { registerStudentAccount, STUDENT_USERNAME_INVALID_MESSAGE } from '@/lib/services/public-auth-service'

export async function signInAction(formData: FormData) {
  const identifier = readRequired(formData, 'identifier') || readRequired(formData, 'username')
  const password = readRequired(formData, 'password')
  const next = sanitizeNextPath(readOptional(formData, 'next') ?? '/map')

  if (!isDbConfigured()) {
    redirectWithError('/auth/sign-in', next, '数据库环境变量未配置。')
  }

  try {
    await signIn('credentials', {
      username: identifier,
      password,
      redirectTo: next,
    })
  } catch (error) {
    if (isCredentialsError(error)) {
      redirectWithError('/auth/sign-in', next, '邮箱/用户名/昵称或密码不正确。')
    }
    throw error
  }
}

export async function signUpAction(formData: FormData) {
  const username = readRequired(formData, 'username')
  const email = readOptional(formData, 'email')
  const password = readRequired(formData, 'password')
  const confirmPassword = readRequired(formData, 'confirmPassword')

  if (!isDbConfigured()) {
    redirectWithError('/auth/sign-up', '/', '数据库环境变量未配置。')
  }
  const result = await registerStudentAccount({ username, email, password, confirmPassword })
  if (!result.ok) redirectWithError('/auth/sign-up', '/', getSignUpErrorMessage(result.code))

  try {
    await signIn('credentials', {
      username: result.username,
      password,
      redirectTo: '/map',
    })
  } catch (error) {
    if (isCredentialsError(error)) {
      redirect('/auth/sign-in?created=1')
    }
    throw error
  }
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = readRequired(formData, 'email')
  if (!isDbConfigured()) {
    redirectWithError('/auth/forgot-password', '/', '数据库环境变量未配置。')
  }

  const result = await requestPasswordReset({
    email,
    origin: await getRequestOrigin(),
  })
  if (!result.ok) redirectWithError('/auth/forgot-password', '/', getPasswordResetRequestErrorMessage(result.code))

  redirect('/auth/forgot-password?sent=1')
}

export async function resetPasswordAction(formData: FormData) {
  const token = readRequired(formData, 'token')
  const password = readRequired(formData, 'password')
  const confirmPassword = readRequired(formData, 'confirmPassword')
  if (!isDbConfigured()) {
    redirectWithError('/auth/reset-password', '/', '数据库环境变量未配置。')
  }

  const result = await resetPasswordWithToken({ token, password, confirmPassword })
  if (!result.ok) {
    const params = new URLSearchParams({ error: getPasswordResetErrorMessage(result.code) })
    if (token) params.set('token', token)
    redirect(`/auth/reset-password?${params.toString()}`)
  }

  redirect('/auth/sign-in?reset=1')
}

export async function signOutAction() {
  await signOut({ redirectTo: '/auth/sign-in' })
}

function readRequired(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function readOptional(formData: FormData, key: string): string | null {
  const value = readRequired(formData, key)
  return value.length > 0 ? value : null
}

function sanitizeNextPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/map'
  if (isSettingsPath(value)) return '/map'
  return value === '/' ? '/map' : value
}

function isSettingsPath(value: string): boolean {
  return value === '/settings' || value.startsWith('/settings?') || value.startsWith('/settings/')
}

function redirectWithError(path: string, next: string, error: string): never {
  const params = new URLSearchParams({ error })
  if (next !== '/') params.set('next', next)
  redirect(`${path}?${params.toString()}`)
}

function isCredentialsError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const record = error as Record<string, unknown>
  return record.type === 'CredentialsSignin' || record.name === 'CredentialsSignin'
}

function getSignUpErrorMessage(code: string): string {
  switch (code) {
    case 'invalid-username':
      return STUDENT_USERNAME_INVALID_MESSAGE
    case 'email-like-username':
      return '用户名不能使用邮箱格式，请将邮箱填入邮箱字段。'
    case 'username-taken':
      return '这个用户名已经注册。'
    case 'invalid-email':
      return '请输入有效的邮箱地址。'
    case 'email-taken':
      return '这个邮箱已经注册。'
    case 'too-short':
      return '密码至少需要 8 位。'
    case 'mismatch':
      return '两次输入的密码不一致。'
    default:
      return '注册失败，请稍后再试。'
  }
}

function getPasswordResetRequestErrorMessage(code: string): string {
  switch (code) {
    case 'invalid-email':
      return '请输入有效的邮箱地址。'
    case 'mail-failed':
      return '邮件发送失败，请稍后再试。'
    default:
      return '请求失败，请稍后再试。'
  }
}

function getPasswordResetErrorMessage(code: string): string {
  switch (code) {
    case 'expired-token':
      return '重置链接已过期，请重新申请。'
    case 'too-short':
      return '密码至少需要 8 位。'
    case 'mismatch':
      return '两次输入的密码不一致。'
    case 'invalid-token':
    default:
      return '重置链接无效，请重新申请。'
  }
}

async function getRequestOrigin(): Promise<string> {
  const headerStore = await headers()
  const origin = headerStore.get('origin')
  if (origin) return origin
  const host = headerStore.get('host')
  if (!host) return ''
  const protocol = headerStore.get('x-forwarded-proto') ?? 'http'
  return `${protocol}://${host}`
}
