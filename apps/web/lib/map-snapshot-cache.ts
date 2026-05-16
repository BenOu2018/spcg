'use client'

import type { Level, Progress, UserRole } from '@spcg/shared/types'

export type MapSnapshotLevel = Pick<Level, 'id' | 'chapterId' | 'order' | 'title' | 'knowledgePoint' | 'difficulty'>

export type MapSnapshotStageMenu = {
  items: Array<{ levelId: string }>
}

export type MapSnapshot = {
  version: 1
  userId: string
  activeChapterId: string | null
  levels: MapSnapshotLevel[]
  progressRecords: Progress[]
  stageMenus: MapSnapshotStageMenu[]
  navigation: {
    role: UserRole
    canFreeJump: boolean
    currentMapLevelId: string | null
  }
  createdAt: string
}

const MAP_SNAPSHOT_VERSION = 1
const MAP_SNAPSHOT_PREFIX = 'spcg:map-snapshot:v1:'
const MAP_SNAPSHOT_LAST_USER_KEY = 'spcg:map-snapshot:last-user-id'
const MAP_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000

export function writeMapSnapshot(snapshot: Omit<MapSnapshot, 'version' | 'createdAt'> & { createdAt?: string }) {
  if (typeof window === 'undefined' || !snapshot.userId) return

  try {
    const nextSnapshot: MapSnapshot = {
      ...snapshot,
      version: MAP_SNAPSHOT_VERSION,
      createdAt: snapshot.createdAt ?? new Date().toISOString(),
    }
    window.localStorage.setItem(snapshotKey(snapshot.userId), JSON.stringify(nextSnapshot))
    window.localStorage.setItem(MAP_SNAPSHOT_LAST_USER_KEY, snapshot.userId)
  } catch {
    // Local cache is an optional speed layer; quota or privacy failures must not affect navigation.
  }
}

export function readMapSnapshot(userId?: string | null): MapSnapshot | null {
  if (typeof window === 'undefined') return null

  try {
    const snapshotUserId = userId === undefined ? window.localStorage.getItem(MAP_SNAPSHOT_LAST_USER_KEY) : userId
    if (!snapshotUserId) return null

    const raw = window.localStorage.getItem(snapshotKey(snapshotUserId))
    if (!raw) return null

    const snapshot = normalizeSnapshot(JSON.parse(raw))
    if (!snapshot || snapshot.userId !== snapshotUserId) return null

    const ageMs = Date.now() - new Date(snapshot.createdAt).getTime()
    if (!Number.isFinite(ageMs) || ageMs > MAP_SNAPSHOT_MAX_AGE_MS) {
      window.localStorage.removeItem(snapshotKey(snapshotUserId))
      return null
    }

    return snapshot
  } catch {
    return null
  }
}

export function markMapSnapshotLevelPassed(userId: string, levelId: string) {
  if (typeof window === 'undefined' || !userId || !levelId) return

  try {
    const raw = window.localStorage.getItem(snapshotKey(userId))
    if (!raw) return

    const snapshot = normalizeSnapshot(JSON.parse(raw))
    if (!snapshot) return

    const now = new Date().toISOString()
    const existing = snapshot.progressRecords.find((progress) => progress.levelId === levelId)
    const progressRecords = existing
      ? snapshot.progressRecords.map((progress) =>
          progress.levelId === levelId
            ? {
                ...progress,
                passed: true,
                attemptCount: Math.max(1, progress.attemptCount),
                lastSubmittedAt: now,
              }
            : progress,
        )
      : [
          ...snapshot.progressRecords,
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

    writeMapSnapshot({
      ...snapshot,
      progressRecords,
      createdAt: now,
    })
  } catch {
    // Best-effort only; the server map remains the source of truth.
  }
}

export function clearMapSnapshots() {
  if (typeof window === 'undefined') return

  try {
    const keysToRemove: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key) continue
      if (key === MAP_SNAPSHOT_LAST_USER_KEY || key.startsWith(MAP_SNAPSHOT_PREFIX)) keysToRemove.push(key)
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // Cache cleanup is best-effort.
  }
}

function snapshotKey(userId: string): string {
  return `${MAP_SNAPSHOT_PREFIX}${encodeURIComponent(userId)}`
}

function normalizeSnapshot(value: unknown): MapSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<MapSnapshot>
  if (record.version !== MAP_SNAPSHOT_VERSION) return null
  if (typeof record.userId !== 'string' || !record.userId) return null
  if (!Array.isArray(record.levels) || !Array.isArray(record.progressRecords) || !Array.isArray(record.stageMenus)) {
    return null
  }
  if (!record.navigation || typeof record.navigation !== 'object') return null
  if (typeof record.createdAt !== 'string') return null

  return record as MapSnapshot
}
