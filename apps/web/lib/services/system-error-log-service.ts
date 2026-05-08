import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  createSystemErrorLog,
  listSystemErrorLogs,
  type SystemErrorLogLevel,
  type SystemErrorLogRecord,
} from '@/lib/repositories/system-error-log-repository'

export type LogSystemErrorInput = {
  level?: SystemErrorLogLevel
  source: string
  error?: unknown
  message?: string
  stack?: string | null
  path?: string | null
  method?: string | null
  userId?: string | null
  metadata?: Record<string, unknown>
}

export async function logSystemError(input: LogSystemErrorInput): Promise<void> {
  if (!isDatabaseConfigured()) return

  try {
    const normalized = normalizeError(input.error)
    await createSystemErrorLog({
      level: input.level ?? 'error',
      source: trim(input.source, 160) || 'unknown',
      message: trim(input.message ?? normalized.message, 2000) || 'Unknown server error',
      stack: trim(input.stack ?? normalized.stack, 12000) || null,
      path: trim(input.path ?? null, 700),
      method: trim(input.method ?? null, 32),
      userId: input.userId ?? null,
      metadata: sanitizeMetadata(input.metadata ?? {}),
    })
  } catch {
    // Error logging must never break the user-facing request path.
  }
}

export async function getRecentSystemErrorLogs(limit = 50): Promise<SystemErrorLogRecord[]> {
  if (!isDatabaseConfigured()) return []

  try {
    return await listSystemErrorLogs(limit)
  } catch (error) {
    await logSystemError({
      source: 'system-error-log-service.getRecentSystemErrorLogs',
      error,
    })
    return []
  }
}

function normalizeError(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || 'Unknown server error',
      stack: error.stack ?? null,
    }
  }

  if (typeof error === 'string') return { message: error, stack: null }
  if (error === null || error === undefined) return { message: 'Unknown server error', stack: null }

  try {
    return { message: JSON.stringify(error), stack: null }
  } catch {
    return { message: String(error), stack: null }
  }
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  try {
    const json = JSON.stringify(metadata, (_key, value) => {
      if (typeof value === 'bigint') return value.toString()
      if (typeof value === 'function' || typeof value === 'symbol') return undefined
      if (value instanceof Error) return { name: value.name, message: value.message }
      return value
    })
    if (!json) return {}
    if (json.length > 6000) return { truncated: true, size: json.length }
    const parsed = JSON.parse(json)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return { unserializable: true }
  }
}

function trim(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null
  const normalized = value.trim()
  if (!normalized) return null
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
