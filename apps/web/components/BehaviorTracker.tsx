'use client'

import { useEffect, useMemo, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import type { BehaviorEventType } from '@spcg/shared/types'
import type { BehaviorClientEventInput } from '@/components/behavior-events'

type BehaviorTrackerProps = {
  userId: string | null
}

type QueuedBehaviorEvent = {
  clientEventId: string
  pageViewId: string | null
  type: BehaviorEventType
  occurredAt: string
  path: string | null
  url: string | null
  title: string | null
  levelId?: string | null
  submissionId?: string | null
  assessmentAttemptId?: string | null
  durationMs?: number | null
  count?: number | null
  result?: string | null
  metadata?: Record<string, unknown>
}

type CurrentPageView = {
  pageViewId: string
  path: string
  sanitizedUrl: string
  title: string
  startedAt: number
  visibleStartedAt: number | null
  visibleDurationMs: number
}

const FLUSH_INTERVAL_MS = 10_000
const MAX_QUEUE_SIZE = 24
const SENSITIVE_QUERY_KEYS = [
  'token',
  'code',
  'password',
  'secret',
  'apikey',
  'api_key',
  'parentinvitecode',
  'invite',
  'phone',
  'email',
  'idcard',
]

export function BehaviorTracker({ userId }: BehaviorTrackerProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const routeKey = useMemo(() => `${pathname}${searchKey ? `?${searchKey}` : ''}`, [pathname, searchKey])
  const clientSessionIdRef = useRef<string>('')
  const pageRef = useRef<CurrentPageView | null>(null)
  const queueRef = useRef<QueuedBehaviorEvent[]>([])
  const flushInFlightRef = useRef(false)

  useEffect(() => {
    if (!userId) return
    clientSessionIdRef.current = readClientSessionId()
  }, [userId])

  useEffect(() => {
    if (!userId || !clientSessionIdRef.current) return
    const nextPage = buildPageView(routeKey)
    const current = pageRef.current
    if (current?.sanitizedUrl === nextPage.sanitizedUrl) return

    if (current) enqueuePageEnd(current)
    pageRef.current = nextPage
    enqueue({
      type: 'page_view_start',
      pageViewId: nextPage.pageViewId,
      path: nextPage.path,
      url: nextPage.sanitizedUrl,
      title: nextPage.title,
      metadata: {
        referrer: sanitizeUrl(document.referrer),
        viewport: readViewport(),
      },
    })
    void flushSoon(false)

    return () => {
      const page = pageRef.current
      if (page?.pageViewId === nextPage.pageViewId) {
        enqueuePageEnd(page)
        pageRef.current = null
      }
    }
  }, [routeKey, userId])

  useEffect(() => {
    if (!userId) return

    const handleBehaviorEvent = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as BehaviorClientEventInput | undefined) : undefined
      if (!detail) return
      const page = pageRef.current
      enqueue({
        type: detail.type,
        pageViewId: page?.pageViewId ?? null,
        path: page?.path ?? null,
        url: page?.sanitizedUrl ?? null,
        title: page?.title ?? null,
        levelId: detail.levelId ?? null,
        submissionId: detail.submissionId ?? null,
        assessmentAttemptId: detail.assessmentAttemptId ?? null,
        durationMs: detail.durationMs ?? null,
        count: detail.count ?? null,
        result: detail.result ?? null,
        metadata: detail.metadata,
      })
      void flushSoon(queueRef.current.length >= MAX_QUEUE_SIZE)
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const interactive = target.closest('a,button,summary,input,select,textarea,[role="button"],[data-behavior-label]')
      if (!(interactive instanceof HTMLElement)) return
      const page = pageRef.current
      enqueue({
        type: 'click',
        pageViewId: page?.pageViewId ?? null,
        path: page?.path ?? null,
        url: page?.sanitizedUrl ?? null,
        title: page?.title ?? null,
        metadata: readClickMetadata(interactive),
      })
      void flushSoon(queueRef.current.length >= MAX_QUEUE_SIZE)
    }

    const handleVisibilityChange = () => {
      const page = pageRef.current
      if (!page) return
      if (document.visibilityState === 'hidden') {
        closeVisibleWindow(page, Date.now())
        enqueuePageEnd(page)
        void flushSoon(true)
      } else {
        page.visibleStartedAt = Date.now()
      }
    }

    const handlePageHide = () => {
      const page = pageRef.current
      if (page) enqueuePageEnd(page)
      flushWithBeacon()
    }

    window.addEventListener('spcg:behavior', handleBehaviorEvent)
    document.addEventListener('click', handleClick, true)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    const intervalId = window.setInterval(() => {
      void flushSoon(true)
    }, FLUSH_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('spcg:behavior', handleBehaviorEvent)
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      const page = pageRef.current
      if (page) enqueuePageEnd(page)
      void flushSoon(true)
    }
  }, [userId])

  function enqueue(input: Omit<QueuedBehaviorEvent, 'clientEventId' | 'occurredAt'>) {
    if (!userId) return
    queueRef.current.push({
      clientEventId: createClientId('event'),
      occurredAt: new Date().toISOString(),
      ...input,
    })
  }

  function enqueuePageEnd(page: CurrentPageView) {
    const now = Date.now()
    closeVisibleWindow(page, now)
    enqueue({
      type: 'page_view_end',
      pageViewId: page.pageViewId,
      path: page.path,
      url: page.sanitizedUrl,
      title: page.title,
      durationMs: Math.max(0, Math.round(now - page.startedAt)),
      metadata: {
        visibleDurationMs: Math.max(0, Math.round(page.visibleDurationMs)),
      },
    })
  }

  async function flushSoon(force: boolean) {
    if (!force && queueRef.current.length === 0) return
    if (!force && queueRef.current.length < MAX_QUEUE_SIZE) return
    if (flushInFlightRef.current) return
    const events = queueRef.current.splice(0, MAX_QUEUE_SIZE)
    if (events.length === 0) return
    flushInFlightRef.current = true
    try {
      const response = await fetch('/api/behavior/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientSessionId: clientSessionIdRef.current,
          pageViewId: pageRef.current?.pageViewId ?? null,
          events,
        }),
        keepalive: events.length <= 12,
      })
      if (!response.ok) {
        queueRef.current.unshift(...events.slice(-MAX_QUEUE_SIZE))
      }
    } catch {
      queueRef.current.unshift(...events.slice(-MAX_QUEUE_SIZE))
    } finally {
      flushInFlightRef.current = false
    }
  }

  function flushWithBeacon() {
    const events = queueRef.current.splice(0, MAX_QUEUE_SIZE)
    if (events.length === 0 || !clientSessionIdRef.current) return
    const payload = JSON.stringify({
      clientSessionId: clientSessionIdRef.current,
      pageViewId: pageRef.current?.pageViewId ?? null,
      events,
    })
    const sent = navigator.sendBeacon?.('/api/behavior/events', new Blob([payload], { type: 'application/json' }))
    if (!sent) {
      void fetch('/api/behavior/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => undefined)
    }
  }

  return null
}

function readClientSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem('spcg:behavior-session-id')
    if (existing) return existing
    const next = createClientId('session')
    window.sessionStorage.setItem('spcg:behavior-session-id', next)
    return next
  } catch {
    return createClientId('session')
  }
}

function buildPageView(routeKey: string): CurrentPageView {
  const sanitizedUrl = sanitizeUrl(routeKey) || '/'
  const path = sanitizedUrl.split('?')[0] || '/'
  const now = Date.now()
  return {
    pageViewId: createClientId('page'),
    path,
    sanitizedUrl,
    title: document.title || 'SPCG',
    startedAt: now,
    visibleStartedAt: document.visibilityState === 'visible' ? now : null,
    visibleDurationMs: 0,
  }
}

function closeVisibleWindow(page: CurrentPageView, now: number) {
  if (page.visibleStartedAt === null) return
  page.visibleDurationMs += Math.max(0, now - page.visibleStartedAt)
  page.visibleStartedAt = null
}

function readClickMetadata(element: HTMLElement): Record<string, unknown> {
  const anchor = element instanceof HTMLAnchorElement ? element : element.closest('a')
  return {
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute('role') ?? undefined,
    label: readElementLabel(element),
    href: anchor instanceof HTMLAnchorElement ? sanitizeUrl(anchor.href) : undefined,
  }
}

function readElementLabel(element: HTMLElement): string {
  const explicit =
    element.dataset.behaviorLabel ||
    element.getAttribute('aria-label') ||
    element.getAttribute('title') ||
    element.getAttribute('data-tooltip') ||
    ''
  const fallback = element.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  return (explicit || fallback || element.tagName.toLowerCase()).slice(0, 120)
}

function readViewport(): Record<string, number> {
  return {
    width: Math.round(window.innerWidth),
    height: Math.round(window.innerHeight),
    devicePixelRatio: Number(window.devicePixelRatio.toFixed(2)),
  }
}

function sanitizeUrl(value: string): string {
  if (!value) return ''
  try {
    const parsed = new URL(value, window.location.origin)
    const params = new URLSearchParams()
    parsed.searchParams.forEach((paramValue, key) => {
      params.set(key, isSensitiveKey(key) ? '[redacted]' : paramValue.slice(0, 120))
    })
    const query = params.toString()
    return `${parsed.pathname || '/'}${query ? `?${query}` : ''}`
  } catch {
    return value.split('?')[0]?.slice(0, 500) ?? ''
  }
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  return SENSITIVE_QUERY_KEYS.some((sensitive) => normalized.includes(sensitive))
}

function createClientId(prefix: string): string {
  const cryptoValue = globalThis.crypto?.randomUUID?.()
  if (cryptoValue) return `${prefix}-${cryptoValue}`
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
