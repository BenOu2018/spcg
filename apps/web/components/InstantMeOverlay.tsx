'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { UiLocale } from '@spcg/shared/types'
import { MePageExperience } from '@/components/MePageExperience'
import {
  fetchAndCacheMePagePayload,
  INSTANT_ME_OPEN_EVENT,
  readMePagePayload,
  type InstantMeOpenDetail,
} from '@/lib/me-page-payload-cache'
import type { MePagePayload } from '@/lib/me-page-payload'

type InstantMeOverlayProps = {
  uiLocale: UiLocale
  userId: string | null
}

export function InstantMeOverlay({ uiLocale, userId }: InstantMeOverlayProps) {
  const [payload, setPayload] = useState<MePagePayload | null>(null)
  const payloadRef = useRef<MePagePayload | null>(null)
  const refreshAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    payloadRef.current = payload
  }, [payload])

  useEffect(() => {
    if (!userId) {
      setPayload(null)
      return
    }
    const activeUserId = userId

    function handleOpen(event: Event) {
      const detail = (event as CustomEvent<InstantMeOpenDetail>).detail
      if (!detail?.payload || detail.payload.userId !== activeUserId || detail.payload.uiLocale !== uiLocale) return

      openPayload(detail.payload, detail.href)
    }

    function handlePopState() {
      if (window.location.pathname !== '/me') {
        setPayload(null)
        return
      }

      if (payloadRef.current) return
      const cached = readMePagePayload(activeUserId, uiLocale)
      if (cached) {
        setPayload(cached)
        void refreshPayload()
      } else {
        window.location.href = window.location.href
      }
    }

    window.addEventListener(INSTANT_ME_OPEN_EVENT, handleOpen)
    window.addEventListener('popstate', handlePopState)
    return () => {
      refreshAbortRef.current?.abort()
      window.removeEventListener(INSTANT_ME_OPEN_EVENT, handleOpen)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [uiLocale, userId])

  if (!payload) return null

  return (
    <div className="instant-me-overlay" onClickCapture={handleOverlayClickCapture}>
      <MePageExperience payload={payload} />
    </div>
  )

  function openPayload(nextPayload: MePagePayload, href: string) {
    setPayload(nextPayload)
    const currentHref = `${window.location.pathname}${window.location.search}`
    if (currentHref !== href) {
      window.history.pushState(
        {
          spcgInstantMe: true,
          spcgInstantMeReturnHref: currentHref.startsWith('/map') ? currentHref : '/map',
        },
        '',
        href,
      )
    }
    void refreshPayload()
  }

  async function refreshPayload() {
    if (!userId) return
    refreshAbortRef.current?.abort()
    const controller = new AbortController()
    refreshAbortRef.current = controller

    const result = await fetchAndCacheMePagePayload({
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
    if (url.origin !== window.location.origin) return

    if (url.pathname === '/map') {
      event.preventDefault()
      const href = `${url.pathname}${url.search}`
      setPayload(null)
      if (`${window.location.pathname}${window.location.search}` !== href) {
        window.history.pushState({ spcgInstantMeClosed: true }, '', href)
      }
      return
    }

    if (url.pathname !== '/me') {
      setPayload(null)
    }
  }
}
