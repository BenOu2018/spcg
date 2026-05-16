'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Session } from 'next-auth'
import { useEffect, useRef, useState } from 'react'
import { clearLevelPagePayloadCache } from '@/lib/level-page-payload-cache'
import { clearMapSnapshots } from '@/lib/map-snapshot-cache'
import { clearMePagePayloadCache } from '@/lib/me-page-payload-cache'

type UserAccountMenuProps = {
  session: Session | null
  canShowPricingMenu: boolean
  variant: 'floating' | 'topbar'
}

export function UserAccountMenu({ session, canShowPricingMenu, variant }: UserAccountMenuProps) {
  const pathname = usePathname()
  const rootRef = useRef<HTMLDivElement>(null)
  const [currentSession, setCurrentSession] = useState<Session | null>(session)
  const [open, setOpen] = useState(false)
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

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!user?.id) return null

  const displayName = user.name || user.username || user.email || user.id
  const avatarUrl = user.avatarUrl || user.image || null
  const accountMenuLabel = `账号菜单：${displayName}`
  const triggerClassName =
    variant === 'topbar'
      ? 'topbar-avatar-button topbar-user-button user-account-trigger'
      : 'session-user-badge user-account-trigger'

  return (
    <div className={`user-account-menu user-account-menu-${variant}`} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={accountMenuLabel}
        className={triggerClassName}
        data-tooltip={accountMenuLabel}
        title={accountMenuLabel}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={variant === 'topbar' ? 'topbar-user-avatar' : 'session-user-avatar'} aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : displayName.slice(0, 1).toUpperCase()}
        </span>
        <strong className={variant === 'topbar' ? 'topbar-user-name' : undefined}>{displayName}</strong>
        {variant === 'floating' && user.phoneVerified ? <span className="session-user-verified" title="手机号已认证">✓</span> : null}
      </button>

      {open ? (
        <div className="user-account-menu-panel" role="menu">
          <Link href="/settings?tab=profile" role="menuitem" onClick={() => setOpen(false)}>
            基本设置
          </Link>
          {canShowPricingMenu ? (
            <Link href="/pricing" role="menuitem" onClick={() => setOpen(false)}>
              升级方案
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function clearIdeCachesOnUserSwitch(userId: string | null) {
  if (!userId || typeof window === 'undefined') return

  try {
    const lastUserId = window.localStorage.getItem('spcg:last-user-id')
    if (lastUserId === userId) return
    const shouldClearMapSnapshots = Boolean(lastUserId && lastUserId !== userId)

    const keysToRemove: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key || !isIdeDraftCacheKey(key)) continue
      keysToRemove.push(key)
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key))
    if (shouldClearMapSnapshots) {
      clearMapSnapshots()
      clearLevelPagePayloadCache()
      clearMePagePayloadCache()
    }
    window.localStorage.setItem('spcg:last-user-id', userId)
  } catch {
    // Cache cleanup is best-effort; it must never block rendering the menu.
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
