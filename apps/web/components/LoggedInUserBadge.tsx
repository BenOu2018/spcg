'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Session } from 'next-auth'
import { useEffect, useState } from 'react'

type LoggedInUserBadgeProps = {
  session: Session | null
}

export function LoggedInUserBadge({ session }: LoggedInUserBadgeProps) {
  const pathname = usePathname()
  const [currentSession, setCurrentSession] = useState<Session | null>(session)
  const user = currentSession?.user

  useEffect(() => {
    let cancelled = false

    async function refreshSession() {
      try {
        const response = await fetch(`/api/auth/session?t=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        })
        if (cancelled) return
        if (!response.ok) {
          setCurrentSession(null)
          return
        }
        const nextSession = (await response.json()) as Session | null
        if (cancelled) return
        setCurrentSession(nextSession)
        clearIdeCachesOnUserSwitch(nextSession?.user?.id ?? null)
      } catch {
        if (!cancelled) setCurrentSession(session)
      }
    }

    void refreshSession()

    const handleFocus = () => {
      void refreshSession()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      cancelled = true
      window.removeEventListener('focus', handleFocus)
    }
  }, [pathname, session])

  if (!user?.id) return null

  const displayName = user.name || user.username || user.email || user.id
  const avatarUrl = user.avatarUrl || user.image || null

  return (
    <Link className="session-user-badge" href="/me" title={`当前登录：${displayName}`}>
      <span className="session-user-avatar" aria-hidden="true">
        {avatarUrl ? <img src={avatarUrl} alt="" /> : displayName.slice(0, 1).toUpperCase()}
      </span>
      <strong>{displayName}</strong>
      {user.phoneVerified ? <span className="session-user-verified" title="手机号已认证">✓</span> : null}
    </Link>
  )
}

function clearIdeCachesOnUserSwitch(userId: string | null) {
  if (!userId || typeof window === 'undefined') return

  try {
    const lastUserId = window.localStorage.getItem('spcg:last-user-id')
    if (lastUserId === userId) return

    const keysToRemove: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key || !isIdeDraftCacheKey(key)) continue
      keysToRemove.push(key)
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key))
    window.localStorage.setItem('spcg:last-user-id', userId)
  } catch {
    // Cache cleanup is best-effort; it must never block rendering the page.
  }
}

function isIdeDraftCacheKey(key: string): boolean {
  return (
    key.startsWith('spcg:code:') ||
    key.startsWith('spcg:language:') ||
    key.startsWith('spcg:whiteboard:') ||
    /^spcg:user:[^:]+:(code|language|whiteboard):/.test(key)
  )
}
