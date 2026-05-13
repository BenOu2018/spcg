import type { LevelLeaderboardEntry } from '@spcg/shared/types'
import type { PoolClient } from 'pg'
import { query, queryOne } from '@/lib/db'

type LeaderboardRow = {
  rank: string | number
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  title: string | null
  coin_total: string | number
  rank_score: string | number
  passed_count: string | number
  first_scored_at: Date | string
  last_scored_at: Date | string
}

type LeaderboardStatsRow = {
  total_participants: string | number
  today_passed_count: string | number
  total_coins: string | number
  total_levels: string | number
}

const rankedLeaderboardCte = `
WITH source_entries AS (
  SELECT
    rl.user_id,
    rl.source,
    rl.source_ref,
    rl.coin_delta,
    rl.created_at,
    CASE
      WHEN rl.metadata->>'leaderboardQuestionCount' ~ '^[0-9]+$' THEN (rl.metadata->>'leaderboardQuestionCount')::int
      WHEN rl.source = 'assessment_rank_bonus' THEN 0
      WHEN rl.source = 'daily_review_complete' AND rl.metadata->>'acceptedCount' ~ '^[0-9]+$' THEN (rl.metadata->>'acceptedCount')::int
      ELSE 1
    END AS question_count
  FROM reward_ledger rl
  JOIN users u ON u.id = rl.user_id
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN user_admin_states uas ON uas.user_id = u.id
  WHERE rl.source IN ('level_first_ac', 'daily_review_complete', 'assessment_complete', 'assessment_rank_bonus')
    AND rl.coin_delta > 0
    AND rl.metadata->>'spcgLevel' = $1::text
    AND COALESCE(ur.role, 'student') = 'student'
    AND COALESCE(uas.account_status, 'active') = 'active'
),
scored AS (
  SELECT
    user_id,
    COALESCE(SUM(coin_delta), 0)::int AS coin_total,
    COALESCE(SUM(question_count), 0)::int AS passed_count,
    MIN(rl.created_at) AS first_scored_at,
    MAX(rl.created_at) AS last_scored_at
  FROM source_entries rl
  GROUP BY user_id
),
activity AS (
  SELECT
    scored.*,
    GREATEST(0, EXTRACT(EPOCH FROM (NOW() - last_scored_at)) / 86400.0) AS inactive_days
  FROM scored
),
decayed_base AS (
  SELECT
    activity.*,
    CASE
      WHEN inactive_days <= 15 THEN 1.0
      ELSE GREATEST(0.2, 1.0 - CEIL((inactive_days - 15) / 7.0) * 0.1)
    END AS decay_multiplier
  FROM activity
),
decayed AS (
  SELECT
    decayed_base.*,
    ROUND((coin_total * decay_multiplier)::numeric, 1) AS rank_score
  FROM decayed_base
),
ranked AS (
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY rank_score DESC, coin_total DESC, passed_count DESC, first_scored_at ASC, user_id ASC
    ) AS rank,
    user_id,
    coin_total,
    rank_score,
    passed_count,
    first_scored_at,
    last_scored_at
  FROM decayed
)
`

export async function listLevelLeaderboardEntries(input: {
  spcgLevel: number
  limit?: number
}): Promise<LevelLeaderboardEntry[]> {
  const rows = await query<LeaderboardRow>(
    `
    ${rankedLeaderboardCte}
    SELECT
      ranked.rank,
      ranked.user_id,
      u.username,
      COALESCE(p.display_name, u.display_name, u.username) AS display_name,
      p.avatar_url,
      uw.title,
      ranked.coin_total,
      ranked.rank_score,
      ranked.passed_count,
      ranked.first_scored_at,
      ranked.last_scored_at
    FROM ranked
    JOIN users u ON u.id = ranked.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_wallets uw ON uw.user_id = u.id
    ORDER BY ranked.rank ASC
    LIMIT $2
    `,
    [input.spcgLevel, input.limit ?? 50],
  )

  return rows.map(mapLeaderboardRow)
}

export async function getLevelLeaderboardRank(input: {
  spcgLevel: number
  userId: string
}): Promise<LevelLeaderboardEntry | null> {
  const row = await queryOne<LeaderboardRow>(
    `
    ${rankedLeaderboardCte}
    SELECT
      ranked.rank,
      ranked.user_id,
      u.username,
      COALESCE(p.display_name, u.display_name, u.username) AS display_name,
      p.avatar_url,
      uw.title,
      ranked.coin_total,
      ranked.rank_score,
      ranked.passed_count,
      ranked.first_scored_at,
      ranked.last_scored_at
    FROM ranked
    JOIN users u ON u.id = ranked.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_wallets uw ON uw.user_id = u.id
    WHERE ranked.user_id = $2
    `,
    [input.spcgLevel, input.userId],
  )

  return row ? mapLeaderboardRow(row) : null
}

export async function getLevelLeaderboardRankForClient(
  client: PoolClient,
  input: {
    spcgLevel: number
    userId: string
  },
): Promise<LevelLeaderboardEntry | null> {
  const result = await client.query<LeaderboardRow>(
    `
    ${rankedLeaderboardCte}
    SELECT
      ranked.rank,
      ranked.user_id,
      u.username,
      COALESCE(p.display_name, u.display_name, u.username) AS display_name,
      p.avatar_url,
      uw.title,
      ranked.coin_total,
      ranked.rank_score,
      ranked.passed_count,
      ranked.first_scored_at,
      ranked.last_scored_at
    FROM ranked
    JOIN users u ON u.id = ranked.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_wallets uw ON uw.user_id = u.id
    WHERE ranked.user_id = $2
    `,
    [input.spcgLevel, input.userId],
  )

  const row = result.rows[0]
  return row ? mapLeaderboardRow(row) : null
}

export async function getLevelLeaderboardStats(spcgLevel: number): Promise<{
  totalParticipants: number
  todayPassedCount: number
  totalCoins: number
  totalLevels: number
}> {
  const row = await queryOne<LeaderboardStatsRow>(
    `
    WITH source_entries AS (
      SELECT
        rl.user_id,
        rl.coin_delta,
        rl.created_at,
        CASE
          WHEN rl.metadata->>'leaderboardQuestionCount' ~ '^[0-9]+$' THEN (rl.metadata->>'leaderboardQuestionCount')::int
          WHEN rl.source = 'assessment_rank_bonus' THEN 0
          WHEN rl.source = 'daily_review_complete' AND rl.metadata->>'acceptedCount' ~ '^[0-9]+$' THEN (rl.metadata->>'acceptedCount')::int
          ELSE 1
        END AS question_count
      FROM reward_ledger rl
      JOIN users u ON u.id = rl.user_id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN user_admin_states uas ON uas.user_id = u.id
      WHERE rl.source IN ('level_first_ac', 'daily_review_complete', 'assessment_complete', 'assessment_rank_bonus')
        AND rl.coin_delta > 0
        AND rl.metadata->>'spcgLevel' = $1::text
        AND COALESCE(ur.role, 'student') = 'student'
        AND COALESCE(uas.account_status, 'active') = 'active'
    ),
    scored AS (
      SELECT user_id, SUM(coin_delta)::int AS coin_total
      FROM source_entries
      GROUP BY user_id
    ),
    today_passed AS (
      SELECT COALESCE(SUM(question_count), 0)::int AS count
      FROM source_entries
      WHERE created_at >= date_trunc('day', NOW())
    ),
    level_count AS (
      SELECT COUNT(*)::int AS count
      FROM levels
      WHERE status = 'published'
        AND difficulty->>'spcgLevel' = $1::text
    )
    SELECT
      COUNT(scored.user_id)::int AS total_participants,
      COALESCE((SELECT count FROM today_passed), 0)::int AS today_passed_count,
      COALESCE(SUM(scored.coin_total), 0)::int AS total_coins,
      COALESCE((SELECT count FROM level_count), 0)::int AS total_levels
    FROM scored
    `,
    [spcgLevel],
  )

  return {
    totalParticipants: toNumber(row?.total_participants),
    todayPassedCount: toNumber(row?.today_passed_count),
    totalCoins: toNumber(row?.total_coins),
    totalLevels: toNumber(row?.total_levels),
  }
}

function mapLeaderboardRow(row: LeaderboardRow): LevelLeaderboardEntry {
  return {
    rank: toNumber(row.rank),
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name ?? row.username,
    avatarUrl: row.avatar_url,
    title: row.title ?? '晨雾算力学徒',
    coinTotal: toNumber(row.coin_total),
    rankScore: toNumber(row.rank_score),
    passedCount: toNumber(row.passed_count),
    firstScoredAt: toIsoString(row.first_scored_at),
    lastScoredAt: toIsoString(row.last_scored_at),
  }
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
