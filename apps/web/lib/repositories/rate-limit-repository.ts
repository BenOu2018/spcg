import { queryOne } from '@/lib/db'

type RateLimitClaimRow = {
  allowed: boolean
  retry_after_seconds: string | number
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
}): Promise<RateLimitClaimResult> {
  const windowSeconds = Math.max(1, Math.trunc(input.windowSeconds))
  const row = await queryOne<RateLimitClaimRow>(
    `
    WITH attempted AS (
      INSERT INTO user_action_rate_limits (user_id, action_key, scope_key, last_hit_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, action_key, scope_key)
      DO UPDATE SET
        last_hit_at = EXCLUDED.last_hit_at,
        updated_at = NOW()
      WHERE user_action_rate_limits.last_hit_at <= NOW() - ($4::int * INTERVAL '1 second')
      RETURNING TRUE AS allowed, 0::int AS retry_after_seconds
    )
    SELECT allowed, retry_after_seconds
    FROM attempted
    UNION ALL
    SELECT
      FALSE AS allowed,
      GREATEST(
        1,
        CEIL($4::double precision - EXTRACT(EPOCH FROM (NOW() - last_hit_at)))::int
      ) AS retry_after_seconds
    FROM user_action_rate_limits
    WHERE user_id = $1 AND action_key = $2 AND scope_key = $3
      AND NOT EXISTS (SELECT 1 FROM attempted)
    LIMIT 1
    `,
    [input.userId, input.actionKey, input.scopeKey, windowSeconds],
  )

  return {
    allowed: Boolean(row?.allowed),
    retryAfterSeconds: Math.max(0, Number(row?.retry_after_seconds ?? 0)),
  }
}
