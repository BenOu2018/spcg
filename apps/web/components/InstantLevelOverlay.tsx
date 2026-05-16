'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { UiLocale } from '@spcg/shared/types'
import { ProgrammingLevelExperience } from '@/components/ProgrammingLevelExperience'
import {
  fetchAndCacheLevelPagePayload,
  INSTANT_LEVEL_OPEN_EVENT,
  readLevelPagePayload,
  type InstantLevelOpenDetail,
} from '@/lib/level-page-payload-cache'
import type { LevelPagePayload } from '@/lib/level-page-payload'

type InstantLevelOverlayProps = {
  uiLocale: UiLocale
  userId: string
}

export function InstantLevelOverlay({ uiLocale, userId }: InstantLevelOverlayProps) {
  const [payload, setPayload] = useState<LevelPagePayload | null>(null)
  const payloadRef = useRef<LevelPagePayload | null>(null)
  const refreshAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    payloadRef.current = payload
  }, [payload])

  useEffect(() => {
    function handleOpen(event: Event) {
      const detail = (event as CustomEvent<InstantLevelOpenDetail>).detail
      if (!detail?.payload || detail.payload.userId !== userId || detail.payload.uiLocale !== uiLocale) return

      openPayload(detail.payload, detail.href)
    }

    function handlePopState() {
      const levelId = readLevelIdFromPath(window.location.pathname)
      if (!levelId) {
        setPayload(null)
        return
      }

      if (payloadRef.current) return
      const cached = readLevelPagePayload(levelId, userId, uiLocale)
      if (cached) {
        setPayload(cached)
        void refreshPayload(cached.levelId)
      } else {
        window.location.href = window.location.href
      }
    }

    window.addEventListener(INSTANT_LEVEL_OPEN_EVENT, handleOpen)
    window.addEventListener('popstate', handlePopState)
    return () => {
      refreshAbortRef.current?.abort()
      window.removeEventListener(INSTANT_LEVEL_OPEN_EVENT, handleOpen)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [uiLocale, userId])

  if (!payload) return null

  return (
    <div className="instant-level-overlay" onClickCapture={handleOverlayClickCapture}>
      <main className="programming-scene instant-level-scene">
        <ProgrammingLevelExperience
          level={payload.level}
          levels={payload.levels}
          stageLevels={payload.stageLevels}
          userId={payload.userId}
          session={payload.session}
          stageMenu={payload.stageMenu}
          progressRecords={payload.progressRecords}
          canViewHints={payload.canViewHints}
          hintsUpgradeMessage={payload.hintsUpgradeMessage}
          messages={payload.messages}
          canShowPricingMenu={payload.canShowPricingMenu}
          canFreeJump={payload.canFreeJump}
          embeddedInMap
        />
      </main>
    </div>
  )

  function openPayload(nextPayload: LevelPagePayload, href: string) {
    setPayload(nextPayload)
    const currentHref = `${window.location.pathname}${window.location.search}`
    if (currentHref !== href) {
      window.history.pushState(
        {
          spcgInstantLevel: nextPayload.levelId,
          spcgInstantMapHref: currentHref.startsWith('/map') ? currentHref : `/map?chapter=${nextPayload.level.chapterId}`,
        },
        '',
        href,
      )
    }
    void refreshPayload(nextPayload.levelId)
  }

  async function refreshPayload(levelId: string) {
    refreshAbortRef.current?.abort()
    const controller = new AbortController()
    refreshAbortRef.current = controller

    const result = await fetchAndCacheLevelPagePayload({
      levelId,
      userId,
      uiLocale,
      signal: controller.signal,
    })
    if (controller.signal.aborted) return
    if (result.ok) {
      setPayload(result.payload)
      return
    }
    if (result.redirectTo) {
      window.location.href = result.redirectTo
    }
  }

  function handleOverlayClickCapture(event: MouseEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof Element)) return

    const anchor = target.closest('a[href]')
    if (!(anchor instanceof HTMLAnchorElement)) return

    const url = new URL(anchor.href)
    if (url.origin !== window.location.origin || url.pathname !== '/map') return

    event.preventDefault()
    const href = `${url.pathname}${url.search}`
    setPayload(null)
    if (`${window.location.pathname}${window.location.search}` !== href) {
      window.history.pushState({ spcgInstantLevelClosed: true }, '', href)
    }
  }
}

function readLevelIdFromPath(pathname: string) {
  const match = pathname.match(/^\/level\/([^/]+)$/)
  return match ? decodeURIComponent(match[1]!) : null
}
