import type { AssessmentAttempt, AssessmentAttemptStatus, AssessmentSession, RewardGrantResult } from '@spcg/shared/types'
import { query, queryOne } from '@/lib/db'

type AssessmentSessionRow = {
  id: string
  type: AssessmentSession['type']
  title: string
  problem_set_id: string | null
  duration_seconds: number
  coin_reward: number
  garlic_reward: number
  status: AssessmentSession['status']
}

type AssessmentAttemptRow = {
  id: string
  session_id: string
  user_id: string
  status: AssessmentAttemptStatus
  started_at: Date | string
  finished_at: Date | string | null
  score: number
  accepted_count: number
  total_count: number
  reward: RewardGrantResult | null
}

export async function getAssessmentSession(sessionId: string): Promise<AssessmentSession | null> {
  const row = await queryOne<AssessmentSessionRow>(
    `
    SELECT id, type, title, problem_set_id, duration_seconds, coin_reward, garlic_reward, status
    FROM assessment_sessions
    WHERE id = $1
    `,
    [sessionId],
  )

  return row ? mapSessionRow(row) : null
}

export async function createAssessmentAttempt(input: {
  userId: string
  sessionId: string
  totalCount: number
}): Promise<AssessmentAttempt> {
  const row = await queryOne<AssessmentAttemptRow>(
    `
    INSERT INTO assessment_attempts (session_id, user_id, total_count)
    VALUES ($1, $2, $3)
    RETURNING id, session_id, user_id, status, started_at, finished_at, score, accepted_count, total_count, reward
    `,
    [input.sessionId, input.userId, input.totalCount],
  )

  if (!row) throw new Error('Assessment attempt was not created')
  return mapAttemptRow(row)
}

export async function getAssessmentAttemptForUser(input: {
  userId: string
  attemptId: string
}): Promise<AssessmentAttempt | null> {
  const row = await queryOne<AssessmentAttemptRow>(
    `
    SELECT id, session_id, user_id, status, started_at, finished_at, score, accepted_count, total_count, reward
    FROM assessment_attempts
    WHERE id = $1 AND user_id = $2
    `,
    [input.attemptId, input.userId],
  )

  return row ? mapAttemptRow(row) : null
}

export async function finishAssessmentAttempt(input: {
  userId: string
  attemptId: string
  status: Extract<AssessmentAttemptStatus, 'completed' | 'expired'>
  score: number
  acceptedCount: number
  totalCount: number
  reward: RewardGrantResult
}): Promise<AssessmentAttempt> {
  const row = await queryOne<AssessmentAttemptRow>(
    `
    UPDATE assessment_attempts
    SET
      status = CASE WHEN status = 'in_progress' THEN $3 ELSE status END,
      finished_at = CASE WHEN status = 'in_progress' THEN NOW() ELSE finished_at END,
      score = CASE WHEN status = 'in_progress' THEN $4 ELSE score END,
      accepted_count = CASE WHEN status = 'in_progress' THEN $5 ELSE accepted_count END,
      total_count = CASE WHEN status = 'in_progress' THEN $6 ELSE total_count END,
      reward = CASE WHEN status = 'in_progress' THEN $7 ELSE reward END
    WHERE id = $1 AND user_id = $2
    RETURNING id, session_id, user_id, status, started_at, finished_at, score, accepted_count, total_count, reward
    `,
    [input.attemptId, input.userId, input.status, input.score, input.acceptedCount, input.totalCount, input.reward],
  )

  if (!row) throw new Error('Assessment attempt not found')
  return mapAttemptRow(row)
}

export async function countAcceptedLevelsSince(input: { userId: string; since: string }): Promise<number> {
  const row = await queryOne<{ accepted_count: string | number }>(
    `
    SELECT COUNT(DISTINCT level_id) AS accepted_count
    FROM submissions
    WHERE user_id = $1
      AND created_at >= $2
      AND status = 'done'
      AND verdict->>'result' = 'AC'
    `,
    [input.userId, input.since],
  )

  return toNumber(row?.accepted_count)
}

function mapSessionRow(row: AssessmentSessionRow): AssessmentSession {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    problemSetId: row.problem_set_id,
    durationSeconds: row.duration_seconds,
    coinReward: row.coin_reward,
    garlicReward: row.garlic_reward,
    status: row.status,
  }
}

function mapAttemptRow(row: AssessmentAttemptRow): AssessmentAttempt {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    status: row.status,
    startedAt: toIsoString(row.started_at),
    finishedAt: row.finished_at ? toIsoString(row.finished_at) : null,
    score: row.score,
    acceptedCount: row.accepted_count,
    totalCount: row.total_count,
    reward: row.reward,
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
