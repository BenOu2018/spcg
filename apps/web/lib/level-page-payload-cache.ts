'use client'

import type { UiLocale } from '@spcg/shared/types'
import {
  createCacheableLevelPagePayload,
  LEVEL_PAGE_PAYLOAD_VERSION,
  type LevelPagePayload,
  type LevelPagePayloadInput,
} from '@/lib/level-page-payload'

export const INSTANT_LEVEL_OPEN_EVENT = 'spcg:instant-level-open'

export type InstantLevelOpenDetail = {
  href: string
  payload: LevelPagePayload
}

type FetchLevelPagePayloadResult =
  | { ok: true; payload: LevelPagePayload }
  | { ok: false; error?: string; redirectTo?: string }

const CACHE_PREFIX = 'spcg:level-page-payload:v1:'
const MAX_AGE_MS = 30 * 60 * 1000

export function writeLevelPagePayload(input: LevelPagePayload | LevelPagePayloadInput) {
  if (typeof window === 'undefined') return

  const payload = 'version' in input ? createCacheableLevelPagePayload(input, input.cachedAt) : createCacheableLevelPagePayload(input)
  if (!payload.userId || !payload.levelId || !payload.uiLocale) return

  try {
    window.sessionStorage.setItem(cacheKey(payload.userId, payload.uiLocale, payload.levelId), JSON.stringify(payload))
  } catch {
    // This cache is only a speed layer.
  }
}

export function readLevelPagePayload(levelId: string, userId: string, uiLocale: UiLocale): LevelPagePayload | null {
  if (typeof window === 'undefined' || !levelId || !userId || !uiLocale) return null

  try {
    const key = cacheKey(userId, uiLocale, levelId)
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

export async function fetchAndCacheLevelPagePayload(input: {
  levelId: string
  userId: string
  uiLocale: UiLocale
  signal?: AbortSignal
}): Promise<FetchLevelPagePayloadResult> {
  try {
    const response = await fetch(`/api/level-page/${encodeURIComponent(input.levelId)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: input.signal,
    })
    const body = (await response.json().catch(() => null)) as
      | { ok: true; data: { payload: LevelPagePayload } }
      | { ok: false; error?: { message?: string }; redirectTo?: string }
      | null

    if (!response.ok || !body?.ok) {
      return {
        ok: false,
        error: body && !body.ok ? body.error?.message : '关卡数据同步失败。',
        redirectTo: body && !body.ok ? body.redirectTo : undefined,
      }
    }

    const payload = normalizePayload(body.data.payload)
    if (!payload || payload.userId !== input.userId || payload.uiLocale !== input.uiLocale) {
      return { ok: false, error: '关卡缓存与当前账号不一致。' }
    }

    writeLevelPagePayload(payload)
    return { ok: true, payload }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { ok: false }
    return { ok: false, error: error instanceof Error ? error.message : '关卡数据同步失败。' }
  }
}

export function markLevelPagePayloadLevelPassed(userId: string, levelId: string) {
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

      writeLevelPagePayload({
        ...payload,
        cachedAt: now,
        progressRecords: markProgressPassed(payload.progressRecords, userId, levelId, now),
      })
    }
  } catch {
    // Server progress remains authoritative.
  }
}

export function clearLevelPagePayloadCache() {
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

function markProgressPassed(progressRecords: LevelPagePayload['progressRecords'], userId: string, levelId: string, now: string) {
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

function cacheKey(userId: string, uiLocale: UiLocale, levelId: string) {
  return `${CACHE_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(uiLocale)}:${levelId}`
}

function normalizePayload(value: unknown): LevelPagePayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<LevelPagePayload>
  if (record.version !== LEVEL_PAGE_PAYLOAD_VERSION) return null
  if (typeof record.userId !== 'string' || !record.userId) return null
  if (typeof record.levelId !== 'string' || !record.levelId) return null
  if (record.uiLocale !== 'zh-CN' && record.uiLocale !== 'en-US') return null
  if (!record.level || typeof record.level !== 'object') return null
  if (!Array.isArray(record.levels) || !Array.isArray(record.stageLevels) || !Array.isArray(record.progressRecords)) return null
  if (typeof record.canViewHints !== 'boolean') return null
  if (typeof record.canShowPricingMenu !== 'boolean') return null
  if (typeof record.canFreeJump !== 'boolean') return null
  if (!record.messages || typeof record.messages !== 'object') return null
  if (typeof record.cachedAt !== 'string') return null

  return record as LevelPagePayload
}
