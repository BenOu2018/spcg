import type { Verdict } from '@spcg/shared/types'
import { query, queryOne } from '@/lib/db'

export const ADMIN_OVERVIEW_VERDICT_RESULTS = ['AC', 'WA', 'CE', 'TLE', 'MLE', 'RE', 'PE', 'Judge Error', 'Other'] as const

export type AdminOverviewVerdictResult = (typeof ADMIN_OVERVIEW_VERDICT_RESULTS)[number]

export type AdminOverviewDailyStats = {
  activeUsersToday: number
  submissionsToday: number
  averageJudgeSeconds: number
  verdictCounts: Record<AdminOverviewVerdictResult, number>
}

export type StuckProblemRankItem = {
  userId: string
  userEmail: string | null
  userDisplayName: string | null
  levelId: string
  levelTitle: string
  chapterId: string
  levelOrder: number
  nonAcceptedCount: number
  latestResult: string
  latestSubmittedAt: string
}

type TodayStatsRow = {
  active_users_today: string | number
  submissions_today: string | number
  average_judge_seconds: string | number | null
} & Record<string, unknown>

type VerdictCountRow = {
  result: string | null
  count: string | number
} & Record<string, unknown>

type StuckProblemRankRow = {
  user_id: string
  user_email: string | null
  user_display_name: string | null
  level_id: string
  level_title: string | null
  chapter_id: string | null
  level_order: number | null
  non_accepted_count: string | number
  latest_result: string | null
  latest_submitted_at: Date | string
} & Record<string, unknown>

export async function getAdminOverviewDailyStats(): Promise<AdminOverviewDailyStats> {
  const [statsRow, verdictRows] = await Promise.all([
    queryOne<TodayStatsRow>(
      `
      WITH today AS (
        SELECT date_trunc('day', NOW()) AS start_at
      ),
      active_users AS (
        SELECT id AS user_id
        FROM users, today
        WHERE last_sign_in_at >= today.start_at
        UNION
        SELECT user_id
        FROM submissions, today
        WHERE created_at >= today.start_at
      )
      SELECT
        (SELECT COUNT(*) FROM active_users) AS active_users_today,
        COUNT(s.id) AS submissions_today,
        AVG(EXTRACT(EPOCH FROM (s.updated_at - s.created_at)))
          FILTER (WHERE s.status IN ('done', 'error')) AS average_judge_seconds
      FROM today
      LEFT JOIN submissions s ON s.created_at >= today.start_at
      `,
    ),
    query<VerdictCountRow>(
      `
      WITH today AS (
        SELECT date_trunc('day', NOW()) AS start_at
      )
      SELECT
        CASE
          WHEN verdict->>'result' IN ('AC','WA','CE','TLE','MLE','RE','PE','Judge Error')
            THEN verdict->>'result'
          WHEN status = 'error'
            THEN 'Judge Error'
          ELSE 'Other'
        END AS result,
        COUNT(*) AS count
      FROM submissions, today
      WHERE created_at >= today.start_at
        AND status IN ('done', 'error')
      GROUP BY result
      `,
    ),
  ])

  const verdictCounts = createEmptyVerdictCounts()
  for (const row of verdictRows) {
    const result = normalizeVerdictResult(row.result)
    verdictCounts[result] += toNumber(row.count)
  }

  return {
    activeUsersToday: toNumber(statsRow?.active_users_today),
    submissionsToday: toNumber(statsRow?.submissions_today),
    averageJudgeSeconds: Math.round(toNumber(statsRow?.average_judge_seconds)),
    verdictCounts,
  }
}

export async function listStuckProblemRank(limit = 10): Promise<StuckProblemRankItem[]> {
  const rows = await query<StuckProblemRankRow>(
    `
    WITH recent_failures AS (
      SELECT
        s.user_id,
        s.level_id,
        COUNT(*) AS non_accepted_count,
        MAX(s.created_at) AS latest_submitted_at,
        (ARRAY_AGG(
          COALESCE(
            s.verdict->>'result',
            CASE WHEN s.status = 'error' THEN 'Judge Error' ELSE s.status END
          )
          ORDER BY s.created_at DESC
        ))[1] AS latest_result
      FROM submissions s
      WHERE s.created_at >= NOW() - INTERVAL '7 days'
        AND s.assessment_attempt_id IS NULL
        AND (
          s.status = 'error'
          OR (
            s.status = 'done'
            AND COALESCE(s.verdict->>'result', '') <> 'AC'
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM submissions ac
          WHERE ac.user_id = s.user_id
            AND ac.level_id = s.level_id
            AND ac.status = 'done'
            AND ac.verdict->>'result' = 'AC'
            AND ac.assessment_attempt_id IS NULL
        )
      GROUP BY s.user_id, s.level_id
    )
    SELECT
      rf.user_id,
      u.email AS user_email,
      COALESCE(p.display_name, u.display_name) AS user_display_name,
      rf.level_id,
      l.title AS level_title,
      l.chapter_id,
      l."order" AS level_order,
      rf.non_accepted_count,
      rf.latest_result,
      rf.latest_submitted_at
    FROM recent_failures rf
    JOIN users u ON u.id = rf.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN levels l ON l.id = rf.level_id
    LEFT JOIN progress pr ON pr.user_id = rf.user_id AND pr.level_id = rf.level_id
    WHERE COALESCE(pr.passed, FALSE) = FALSE
    ORDER BY rf.non_accepted_count DESC, rf.latest_submitted_at DESC
    LIMIT $1
    `,
    [Math.max(1, Math.min(limit, 50))],
  )

  return rows.map((row) => ({
    userId: row.user_id,
    userEmail: row.user_email,
    userDisplayName: row.user_display_name,
    levelId: row.level_id,
    levelTitle: row.level_title ?? row.level_id,
    chapterId: row.chapter_id ?? '-',
    levelOrder: row.level_order ?? 0,
    nonAcceptedCount: toNumber(row.non_accepted_count),
    latestResult: row.latest_result ?? 'Other',
    latestSubmittedAt: toIsoString(row.latest_submitted_at),
  }))
}

function createEmptyVerdictCounts(): Record<AdminOverviewVerdictResult, number> {
  return ADMIN_OVERVIEW_VERDICT_RESULTS.reduce(
    (counts, result) => {
      counts[result] = 0
      return counts
    },
    {} as Record<AdminOverviewVerdictResult, number>,
  )
}

function normalizeVerdictResult(result: string | null): AdminOverviewVerdictResult {
  return ADMIN_OVERVIEW_VERDICT_RESULTS.includes(result as AdminOverviewVerdictResult)
    ? (result as Verdict['result'] | 'Other')
    : 'Other'
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
