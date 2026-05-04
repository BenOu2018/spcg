'use server'

import { redirect } from 'next/navigation'
import { signIn, signOut } from '@/auth'
import { isDbConfigured, withTransaction } from '@/lib/db'
import { hashPassword } from '@/lib/password'

export async function signInAction(formData: FormData) {
  const email = readRequired(formData, 'email').toLowerCase()
  const password = readRequired(formData, 'password')
  const next = sanitizeNextPath(readOptional(formData, 'next') ?? '/')

  if (!isDbConfigured()) {
    redirectWithError('/auth/sign-in', next, '数据库环境变量未配置。')
  }

  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: next,
    })
  } catch (error) {
    if (isCredentialsError(error)) {
      redirectWithError('/auth/sign-in', next, '邮箱或密码不正确。')
    }
    throw error
  }
}

export async function signUpAction(formData: FormData) {
  const displayName = readRequired(formData, 'displayName')
  const email = readRequired(formData, 'email').toLowerCase()
  const parentEmail = readOptional(formData, 'parentEmail')
  const password = readRequired(formData, 'password')

  if (!isDbConfigured()) {
    redirectWithError('/auth/sign-up', '/', '数据库环境变量未配置。')
  }

  try {
    const passwordHash = await hashPassword(password)
    await withTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `
        INSERT INTO users (email, password_hash, display_name)
        VALUES ($1, $2, $3)
        RETURNING id
        `,
        [email, passwordHash, displayName],
      )
      const userId = result.rows[0]?.id
      if (!userId) throw new Error('Failed to create user')

      await client.query(
        `
        INSERT INTO profiles (user_id, display_name, parent_email)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id)
        DO UPDATE SET display_name = EXCLUDED.display_name, parent_email = EXCLUDED.parent_email
        `,
        [userId, displayName, parentEmail],
      )
      await client.query(
        `
        INSERT INTO user_roles (user_id, role)
        VALUES ($1, 'student')
        ON CONFLICT (user_id) DO NOTHING
        `,
        [userId],
      )
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      redirectWithError('/auth/sign-up', '/', '这个邮箱已经注册。')
    }
    throw error
  }

  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: '/',
    })
  } catch (error) {
    if (isCredentialsError(error)) {
      redirect('/auth/sign-in?created=1')
    }
    throw error
  }
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
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

function redirectWithError(path: string, next: string, error: string): never {
  const params = new URLSearchParams({ error })
  if (next !== '/') params.set('next', next)
  redirect(`${path}?${params.toString()}`)
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

function isCredentialsError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const record = error as Record<string, unknown>
  return record.type === 'CredentialsSignin' || record.name === 'CredentialsSignin'
}
