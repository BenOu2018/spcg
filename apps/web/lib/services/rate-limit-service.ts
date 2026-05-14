import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import { claimUserActionRateLimit } from '@/lib/repositories/rate-limit-repository'
import { ServiceError } from '@/lib/services/errors'

export type UserRateLimitResult =
  | {
      allowed: true
      retryAfterSeconds: 0
      message: null
    }
  | {
      allowed: false
      retryAfterSeconds: number
      message: string
    }

export const RATE_LIMIT_ACTIONS = {
  bugSubmit: 'system_bug.submit',
  ideRun: 'ide.run',
  ideSubmit: 'ide.submit',
  aiErrorAnalysisGenerate: 'ai_error_analysis.generate',
} as const

const DEFAULT_SCOPE_KEY = 'global'

export async function consumeUserRateLimit(input: {
  userId: string
  actionKey: string
  windowSeconds: number
  maxHits?: number
  scopeKey?: string | null
}): Promise<UserRateLimitResult> {
  if (!input.userId || input.windowSeconds <= 0 || !isDatabaseConfigured()) {
    return { allowed: true, retryAfterSeconds: 0, message: null }
  }

  const result = await claimUserActionRateLimit({
    userId: input.userId,
    actionKey: input.actionKey,
    scopeKey: normalizeScopeKey(input.scopeKey),
    windowSeconds: input.windowSeconds,
    maxHits: input.maxHits,
  }).catch((error) => {
    if (isMissingRateLimitSchemaError(error)) {
      throw new ServiceError('db_unconfigured', '限流数据表尚未更新，请先执行数据库迁移 npm run db:migrate。', 503)
    }
    throw error
  })

  if (result.allowed) {
    return { allowed: true, retryAfterSeconds: 0, message: null }
  }

  const retryAfterSeconds = Math.max(1, result.retryAfterSeconds)
  return {
    allowed: false,
    retryAfterSeconds,
    message: `操作太频繁，请 ${retryAfterSeconds} 秒后再试。`,
  }
}

export async function requireUserRateLimit(input: {
  userId: string
  actionKey: string
  windowSeconds: number
  maxHits?: number
  scopeKey?: string | null
}): Promise<void> {
  const result = await consumeUserRateLimit(input)
  if (result.allowed) return
  throw new ServiceError('rate_limited', result.message, 429, result.retryAfterSeconds)
}

function normalizeScopeKey(value: string | null | undefined): string {
  const normalized = value?.trim()
  return normalized || DEFAULT_SCOPE_KEY
}

function isMissingRateLimitSchemaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  return code === '42P01' || code === '42703'
}
