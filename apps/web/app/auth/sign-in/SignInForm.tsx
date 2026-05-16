'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, type FormEvent } from 'react'
import { signInAction } from '@/app/auth/actions'

type SignInFormProps = {
  nextPath: string
  title: string
  createdMessage: string | null
  resetMessage: string | null
  initialError: string | null
  identifierPlaceholder: string
  passwordPlaceholder: string
  submitLabel: string
  invalidCredentialsMessage: string
}

export function SignInForm({
  nextPath,
  title,
  createdMessage,
  resetMessage,
  initialError,
  identifierPlaceholder,
  passwordPlaceholder,
  submitLabel,
  invalidCredentialsMessage,
}: SignInFormProps) {
  const router = useRouter()
  const [error, setError] = useState(initialError)
  const [pending, setPending] = useState(false)
  const serverFallbackRef = useRef(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (serverFallbackRef.current) return

    event.preventDefault()

    const form = event.currentTarget
    if (!form.reportValidity()) return

    const formData = new FormData(form)
    const identifier = readFormString(formData, 'identifier')
    const password = readFormString(formData, 'password')
    const target = normalizeNextPath(readFormString(formData, 'next') || nextPath)
    setPending(true)
    setError(null)

    try {
      const result = await signInWithCredentials({
        username: identifier,
        password,
        redirectTo: target,
      })

      if (!result.ok) {
        setError(invalidCredentialsMessage)
        setPending(false)
        return
      }

      router.replace(target)
      router.refresh()
    } catch {
      setPending(false)
      serverFallbackRef.current = true
      form.requestSubmit()
    }
  }

  return (
    <form className="login-form" action={signInAction} onSubmit={handleSubmit}>
      <img className="login-logo" src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
      <h1>{title}</h1>
      {createdMessage ? <p className="login-message">{createdMessage}</p> : null}
      {resetMessage ? <p className="login-message">{resetMessage}</p> : null}
      {error ? <p className="login-error">{error}</p> : null}
      <input name="identifier" type="text" placeholder={identifierPlaceholder} autoComplete="username" enterKeyHint="go" required />
      <input name="password" type="password" placeholder={passwordPlaceholder} autoComplete="current-password" enterKeyHint="go" required />
      <input name="next" type="hidden" value={nextPath} />
      <button className="game-start-button" type="submit" disabled={pending} aria-busy={pending}>
        {submitLabel}
      </button>
    </form>
  )
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNextPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/map'
  if (isSettingsPath(value)) return '/map'
  return value === '/' ? '/map' : value
}

function isSettingsPath(value: string): boolean {
  return value === '/settings' || value.startsWith('/settings?') || value.startsWith('/settings/')
}

async function signInWithCredentials(input: {
  username: string
  password: string
  redirectTo: string
}): Promise<{ ok: boolean }> {
  const csrfToken = await getCsrfToken()
  const response = await fetch('/api/auth/callback/credentials', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Auth-Return-Redirect': '1',
    },
    body: new URLSearchParams({
      username: input.username,
      password: input.password,
      csrfToken,
      callbackUrl: input.redirectTo,
    }),
    cache: 'no-store',
    credentials: 'same-origin',
  })
  const data = (await response.json()) as { url?: string | null }
  const error = data.url ? getAuthError(data.url) : null
  return { ok: response.ok && !error }
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch('/api/auth/csrf', {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error('Failed to read CSRF token')

  const data = (await response.json()) as { csrfToken?: string }
  if (!data.csrfToken) throw new Error('Missing CSRF token')
  return data.csrfToken
}

function getAuthError(url: string): string | null {
  try {
    return new URL(url, window.location.origin).searchParams.get('error')
  } catch {
    return null
  }
}
