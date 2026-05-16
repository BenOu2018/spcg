'use client'

import Link from 'next/link'
import type { UiLocale } from '@spcg/shared/types'
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { useRef } from 'react'
import {
  fetchAndCacheMePagePayload,
  INSTANT_ME_OPEN_EVENT,
  readMePagePayload,
  type InstantMeOpenDetail,
} from '@/lib/me-page-payload-cache'

type MeInstantLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  children: ReactNode
  href?: string
  userId?: string | null
  uiLocale?: UiLocale
}

export function MeInstantLink({
  children,
  href = '/me',
  userId,
  uiLocale = 'zh-CN',
  onClick,
  onFocus,
  onMouseEnter,
  onPointerDown,
  onTouchStart,
  ...props
}: MeInstantLinkProps) {
  const preloadAbortRef = useRef<AbortController | null>(null)

  function preload() {
    if (!userId) return
    if (readMePagePayload(userId, uiLocale)) return

    preloadAbortRef.current?.abort()
    const controller = new AbortController()
    preloadAbortRef.current = controller
    void fetchAndCacheMePagePayload({
      userId,
      uiLocale,
      signal: controller.signal,
    })
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (event.defaultPrevented || !userId || !isPlainPrimaryClick(event)) return

    const payload = readMePagePayload(userId, uiLocale)
    if (!payload) return

    event.preventDefault()
    window.dispatchEvent(
      new CustomEvent<InstantMeOpenDetail>(INSTANT_ME_OPEN_EVENT, {
        detail: {
          href,
          payload,
        },
      }),
    )
  }

  return (
    <Link
      {...props}
      href={href}
      onClick={handleClick}
      onFocus={(event) => {
        onFocus?.(event)
        preload()
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event)
        preload()
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        preload()
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event)
        preload()
      }}
    >
      {children}
    </Link>
  )
}

function isPlainPrimaryClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}
