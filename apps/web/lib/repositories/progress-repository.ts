import type { Progress, Verdict } from '@spcg/shared/types'
import { query } from '@/lib/db'

export type ProgressRow = {
  user_id: string
  level_id: string
  passed: boolean
  attempt_count: number
  best_runtime_ms: number | null
  last_submitted_at: string | null
  passed_out: boolean
} & Record<string, unknown>

export async function listUserProgress(userId: string): Promise<Progress[]> {
  const rows = await query<ProgressRow>(
    `
    SELECT user_id, level_id, passed, attempt_count, best_runtime_ms, last_submitted_at, passed_out
    FROM progress
    WHERE user_id = $1
    ORDER BY updated_at DESC
    `,
    [userId],
  )

  return rows.map(mapProgressRow)
}

export async function upsertProgressForVerdict(input: {
  userId: string
  levelId: string
  verdict: Verdict
}): Promise<void> {
  const current = await query<{
    attempt_count: number
    best_runtime_ms: number | null
    passed: boolean
  }>(
    `
    SELECT attempt_count, best_runtime_ms, passed
    FROM progress
    WHERE user_id = $1 AND level_id = $2
    `,
    [input.userId, input.levelId],
  )

  const previous = current[0]
  const passed = input.verdict.result === 'AC' || Boolean(previous?.passed)
  const bestRuntimeMs =
    input.verdict.result === 'AC'
      ? Math.min(previous?.best_runtime_ms ?? input.verdict.maxRuntimeMs, input.verdict.maxRuntimeMs)
      : previous?.best_runtime_ms ?? null

  await query(
    `
    INSERT INTO progress
      (user_id, level_id, passed, attempt_count, best_runtime_ms, last_submitted_at, passed_out)
    VALUES ($1, $2, $3, $4, $5, NOW(), FALSE)
    ON CONFLICT (user_id, level_id)
    DO UPDATE SET
      passed = EXCLUDED.passed,
      attempt_count = EXCLUDED.attempt_count,
      best_runtime_ms = EXCLUDED.best_runtime_ms,
      last_submitted_at = EXCLUDED.last_submitted_at,
      passed_out = EXCLUDED.passed_out
    `,
    [input.userId, input.levelId, passed, (previous?.attempt_count ?? 0) + 1, bestRuntimeMs],
  )
}

function mapProgressRow(row: ProgressRow): Progress {
  return {
    userId: row.user_id,
    levelId: row.level_id,
    passed: row.passed,
    attemptCount: row.attempt_count,
    bestRuntimeMs: row.best_runtime_ms,
    lastSubmittedAt: row.last_submitted_at ?? '',
    passedOut: row.passed_out,
  }
}
