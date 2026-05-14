import { withTransaction } from '@/lib/db'

type RateLimitWindowRow = {
  now: Date | string
  hit_timestamps: Array<Date | string> | null
}

export type RateLimitClaimResult = {
  allowed: boolean
  retryAfterSeconds: number
}

export async function claimUserActionRateLimit(input: {
  userId: string
  actionKey: string
  scopeKey: string
  windowSeconds: number
  maxHits?: number
}): Promise<RateLimitClaimResult> {
  const windowSeconds = normalizePositiveInteger(input.windowSeconds, 1)
  const maxHits = normalizePositiveInteger(input.maxHits ?? 1, 1)

  return withTransaction(async (client) => {
    await client.query(
      `
      INSERT INTO user_action_rate_limits (user_id, action_key, scope_key, last_hit_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, action_key, scope_key)
      DO NOTHING
      `,
      [input.userId, input.actionKey, input.scopeKey],
    )

    const result = await client.query<RateLimitWindowRow>(
      `
      SELECT NOW() AS now, hit_timestamps
      FROM user_action_rate_limits
      WHERE user_id = $1 AND action_key = $2 AND scope_key = $3
      FOR UPDATE
      `,
      [input.userId, input.actionKey, input.scopeKey],
    )

    const row = result.rows[0]
    if (!row) return { allowed: true, retryAfterSeconds: 0 }

    const nowMs = toTimeMs(row.now)
    const windowMs = windowSeconds * 1000
    const cutoffMs = nowMs - windowMs
    const activeHits = normalizeHitTimestamps(row.hit_timestamps).filter((timeMs) => timeMs > cutoffMs)

    if (activeHits.length >= maxHits) {
      const retryAfterSeconds = Math.max(1, Math.ceil((activeHits[0]! + windowMs - nowMs) / 1000))
      return { allowed: false, retryAfterSeconds }
    }

    const nextHitTimestamps = [...activeHits, nowMs].map((timeMs) => new Date(timeMs).toISOString())
    await client.query(
      `
      UPDATE user_action_rate_limits
      SET last_hit_at = NOW(),
        hit_timestamps = $4::timestamptz[],
        updated_at = NOW()
      WHERE user_id = $1 AND action_key = $2 AND scope_key = $3
      `,
      [input.userId, input.actionKey, input.scopeKey, nextHitTimestamps],
    )

    return { allowed: true, retryAfterSeconds: 0 }
  })
}

function normalizeHitTimestamps(value: Array<Date | string> | null): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map(toTimeMs)
    .filter((timeMs) => Number.isFinite(timeMs))
    .sort((left, right) => left - right)
}

function toTimeMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

function normalizePositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.trunc(value))
}
