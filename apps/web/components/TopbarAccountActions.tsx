'use client'

import Link from 'next/link'
import type { Session } from 'next-auth'
import { signOut as clientSignOut } from 'next-auth/react'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LogOut, Map, Settings } from 'lucide-react'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'

type TopbarAccountActionsProps = {
  session: Session | null
  mapHref?: string
  showMapButton?: boolean
  messages?: StudentUiMessages
}

const fallbackMessages = getStudentUiMessages('zh-CN')

export function TopbarAccountActions({
  session,
  mapHref = '/map',
  showMapButton = false,
  messages = fallbackMessages,
}: TopbarAccountActionsProps) {
  const [currentSession, setCurrentSession] = useState<Session | null>(session)
  const [open, setOpen] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({})
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const user = currentSession?.user
  const displayName = user?.name || user?.username || user?.email || user?.id || 'SPCG'
  const avatarUrl = user?.avatarUrl || user?.image || null

  useEffect(() => {
    let cancelled = false

    async function refreshSession() {
      try {
        const response = await fetch(`/api/auth/session?t=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        })
        if (cancelled || !response.ok) return
        const nextSession = (await response.json()) as Session | null
        if (!cancelled) setCurrentSession(nextSession)
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
  }, [session])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return

    const updatePopoverPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      setPopoverStyle({
        position: 'fixed',
        top: `${Math.round(rect.bottom + 8)}px`,
        right: `${Math.max(8, Math.round(window.innerWidth - rect.right))}px`,
      })
    }

    updatePopoverPosition()
    window.addEventListener('resize', updatePopoverPosition)
    window.addEventListener('scroll', updatePopoverPosition, true)

    return () => {
      window.removeEventListener('resize', updatePopoverPosition)
      window.removeEventListener('scroll', updatePopoverPosition, true)
    }
  }, [open])

  const accountPopover = open ? (
    <div
      className="topbar-account-popover topbar-account-popover-floating"
      ref={popoverRef}
      role="menu"
      style={popoverStyle}
    >
      <strong>{displayName}</strong>
      <Link href="/settings" role="menuitem" onClick={() => setOpen(false)}>
        <Settings size={14} />
        {messages.common.settings}
      </Link>
      <button type="button" role="menuitem" onClick={handleSignOut}>
        <LogOut size={14} />
        {messages.common.signOut}
      </button>
    </div>
  ) : null

  async function handleSignOut() {
    setOpen(false)
    setCurrentSession(null)
    await clientSignOut({ callbackUrl: '/auth/sign-in', redirect: true })
  }

  return (
    <>
      <nav className="topbar-account-actions" aria-label={messages.common.settings}>
        {showMapButton ? (
          <Link className="topbar-action-button" href={mapHref} aria-label={messages.common.backToMap} title={messages.common.backToMap}>
            <Map size={14} strokeWidth={2.4} />
          </Link>
        ) : null}
        <Link className="topbar-action-button" href="/me" aria-label={messages.common.progress} title={messages.common.progress}>
          <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-star.svg" alt="" />
        </Link>
        <div className="topbar-account-menu" ref={menuRef}>
          <button
            className="topbar-avatar-button topbar-user-button"
            ref={buttonRef}
            type="button"
            aria-label={`${messages.common.settings}: ${displayName}`}
            aria-expanded={open}
            aria-haspopup="menu"
            title={displayName}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="topbar-user-avatar" aria-hidden="true">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="topbar-user-name">{displayName}</span>
          </button>
        </div>
      </nav>
      {accountPopover && typeof document !== 'undefined' ? createPortal(accountPopover, document.body) : null}
    </>
  )
}
