'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import type { UiLocale } from '@spcg/shared/types'
import {
  fetchAndCacheLevelPagePayload,
  INSTANT_LEVEL_OPEN_EVENT,
  readLevelPagePayload,
} from '@/lib/level-page-payload-cache'
import { prewarmMonacoEditor } from '@/lib/monaco-prewarm'

type LevelNodeLinkProps = {
  ariaLabel: string
  children: ReactNode
  className: string
  href: string
  style: CSSProperties
  uiLocale: UiLocale
  userId: string
}

export function LevelNodeLink({ ariaLabel, children, className, href, style, uiLocale, userId }: LevelNodeLinkProps) {
  const router = useRouter()
  const warmedRef = useRef(false)
  const levelId = readLevelIdFromHref(href)

  function warmLevelRoute() {
    if (warmedRef.current) return
    warmedRef.current = true
    router.prefetch(href)
    void prewarmMonacoEditor()
    if (levelId && userId) {
      void fetchAndCacheLevelPagePayload({
        levelId,
        uiLocale,
        userId,
      })
    }
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!levelId || !userId) return

    const cached = readLevelPagePayload(levelId, userId, uiLocale)
    if (!cached) return

    event.preventDefault()
    window.dispatchEvent(
      new CustomEvent(INSTANT_LEVEL_OPEN_EVENT, {
        detail: {
          href,
          payload: cached,
        },
      }),
    )
  }

  return (
    <Link
      aria-label={ariaLabel}
      className={className}
      href={href}
      style={style}
      onFocus={warmLevelRoute}
      onClick={handleClick}
      onMouseDown={warmLevelRoute}
      onPointerEnter={warmLevelRoute}
      onTouchStart={warmLevelRoute}
    >
      {children}
    </Link>
  )
}

function readLevelIdFromHref(href: string) {
  const match = href.match(/^\/level\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]!) : null
}
