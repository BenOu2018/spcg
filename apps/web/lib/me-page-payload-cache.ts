'use client'

import type { UiLocale } from '@spcg/shared/types'
import {
  createCacheableMePagePayload,
  ME_PAGE_PAYLOAD_VERSION,
  type MePagePayload,
  type MePagePayloadInput,
} from '@/lib/me-page-payload'

export const INSTANT_ME_OPEN_EVENT = 'spcg:instant-me-open'

export type InstantMeOpenDetail = {
  href: string
  payload: MePagePayload
}

type FetchMePagePayloadResult =
  | { ok: true; payload: MePagePayload }
  | { ok: false; error?: string; redirectTo?: string }

const CACHE_PREFIX = 'spcg:me-page-payload:v1:'
const MAX_AGE_MS = 5 * 60 * 1000

export function writeMePagePayload(input: MePagePayload | MePagePayloadInput) {
  if (typeof window === 'undefined') return

  const payload = 'version' in input ? createCacheableMePagePayload(input, input.cachedAt) : createCacheableMePagePayload(input)
  if (!payload.userId || !payload.uiLocale) return

  try {
    window.sessionStorage.setItem(cacheKey(payload.userId, payload.uiLocale), JSON.stringify(payload))
  } catch {
    // This cache is only a speed layer.
  }
}

export function readMePagePayload(userId: string, uiLocale: UiLocale): MePagePayload | null {
  if (typeof window === 'undefined' || !userId || !uiLocale) return null

  try {
    const key = cacheKey(userId, uiLocale)
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null

    const payload = normalizePayload(JSON.parse(raw))
    if (!payload) return null

    const ageMs = Date.now() - new Date(payload.cachedAt).getTime()
    if (!Number.isFinite(ageMs) || ageMs > MAX_AGE_MS) {
      window.sessionStorage.removeItem(key)
      return null
    }

    return payload
  } catch {
    return null
  }
}

export async function fetchAndCacheMePagePayload(input: {
  userId: string
  uiLocale: UiLocale
  signal?: AbortSignal
}): Promise<FetchMePagePayloadResult> {
  try {
    const response = await fetch('/api/me-page', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: input.signal,
    })
    const body = (await response.json().catch(() => null)) as
      | { ok: true; data: { payload: MePagePayload } }
      | { ok: false; error?: { message?: string }; redirectTo?: string }
      | null

    if (!response.ok || !body?.ok) {
      return {
        ok: false,
        error: body && !body.ok ? body.error?.message : '进度数据同步失败。',
        redirectTo: body && !body.ok ? body.redirectTo : undefined,
      }
    }

    const payload = normalizePayload(body.data.payload)
    if (!payload || payload.userId !== input.userId || payload.uiLocale !== input.uiLocale) {
      return { ok: false, error: '进度缓存与当前账号不一致。' }
    }

    writeMePagePayload(payload)
    return { ok: true, payload }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { ok: false }
    return { ok: false, error: error instanceof Error ? error.message : '进度数据同步失败。' }
  }
}

export function markMePagePayloadLevelPassed(userId: string, levelId: string) {
  if (typeof window === 'undefined' || !userId || !levelId) return

  try {
    const keysToUpdate: string[] = []
    const prefix = `${CACHE_PREFIX}${encodeURIComponent(userId)}:`
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index)
      if (key?.startsWith(prefix)) keysToUpdate.push(key)
    }

    const now = new Date().toISOString()
    for (const key of keysToUpdate) {
      const payload = normalizePayload(JSON.parse(window.sessionStorage.getItem(key) ?? 'null'))
      if (!payload) continue

      writeMePagePayload({
        ...payload,
        cachedAt: now,
        progressRecords: markProgressPassed(payload.progressRecords, userId, levelId, now),
      })
    }
  } catch {
    // Server progress remains authoritative.
  }
}

export function clearMePagePayloadCache() {
  if (typeof window === 'undefined') return

  try {
    const keysToRemove: string[] = []
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index)
      if (key?.startsWith(CACHE_PREFIX)) keysToRemove.push(key)
    }
    keysToRemove.forEach((key) => window.sessionStorage.removeItem(key))
  } catch {
    // Best-effort only.
  }
}

function markProgressPassed(progressRecords: MePagePayload['progressRecords'], userId: string, levelId: string, now: string) {
  const existing = progressRecords.find((progress) => progress.levelId === levelId)
  if (existing?.passed) return progressRecords

  if (existing) {
    return progressRecords.map((progress) =>
      progress.levelId === levelId
        ? {
            ...progress,
            passed: true,
            attemptCount: Math.max(1, progress.attemptCount),
            lastSubmittedAt: now,
          }
        : progress,
    )
  }

  return [
    ...progressRecords,
    {
      userId,
      levelId,
      passed: true,
      attemptCount: 1,
      bestRuntimeMs: null,
      lastSubmittedAt: now,
      passedOut: false,
    },
  ]
}

function cacheKey(userId: string, uiLocale: UiLocale) {
  return `${CACHE_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(uiLocale)}`
}

function normalizePayload(value: unknown): MePagePayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<MePagePayload>
  if (record.version !== ME_PAGE_PAYLOAD_VERSION) return null
  if (typeof record.userId !== 'string' || !record.userId) return null
  if (record.uiLocale !== 'zh-CN' && record.uiLocale !== 'en-US') return null
  if (!Array.isArray(record.levels) || !Array.isArray(record.progressRecords)) return null
  if (!Array.isArray(record.inventory) || !Array.isArray(record.titles) || !Array.isArray(record.rewards)) return null
  if (!Array.isArray(record.assessmentHistory)) return null
  if (!record.submissionHistory || !Array.isArray(record.submissionHistory.items)) return null
  if (!record.messages || typeof record.messages !== 'object') return null
  if (typeof record.canShowPricingMenu !== 'boolean') return null
  if (typeof record.cachedAt !== 'string') return null

  return record as MePagePayload
}
