import type { LevelLeaderboardEntry } from '@spcg/shared/types'
import { query, queryOne } from '@/lib/db'

type LeaderboardRow = {
  rank: string | number
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  title: string | null
  coin_total: string | number
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
WITH scored AS (
  SELECT
    rl.user_id,
    COALESCE(SUM(rl.coin_delta), 0)::int AS coin_total,
    COUNT(DISTINCT rl.source_ref)::int AS passed_count,
    MIN(rl.created_at) AS first_scored_at,
    MAX(rl.created_at) AS last_scored_at
  FROM reward_ledger rl
  JOIN users u ON u.id = rl.user_id
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN user_admin_states uas ON uas.user_id = u.id
  WHERE rl.source = 'level_first_ac'
    AND rl.coin_delta > 0
    AND rl.metadata->>'spcgLevel' = $1::text
    AND COALESCE(ur.role, 'student') = 'student'
    AND COALESCE(uas.account_status, 'active') = 'active'
  GROUP BY rl.user_id
),
ranked AS (
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY coin_total DESC, passed_count DESC, first_scored_at ASC, user_id ASC
    ) AS rank,
    user_id,
    coin_total,
    passed_count,
    first_scored_at,
    last_scored_at
  FROM scored
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

export async function getLevelLeaderboardStats(spcgLevel: number): Promise<{
  totalParticipants: number
  todayPassedCount: number
  totalCoins: number
  totalLevels: number
}> {
  const row = await queryOne<LeaderboardStatsRow>(
    `
    WITH scored AS (
      SELECT rl.user_id, SUM(rl.coin_delta)::int AS coin_total
      FROM reward_ledger rl
      JOIN users u ON u.id = rl.user_id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN user_admin_states uas ON uas.user_id = u.id
      WHERE rl.source = 'level_first_ac'
        AND rl.coin_delta > 0
        AND rl.metadata->>'spcgLevel' = $1::text
        AND COALESCE(ur.role, 'student') = 'student'
        AND COALESCE(uas.account_status, 'active') = 'active'
      GROUP BY rl.user_id
    ),
    today_passed AS (
      SELECT COUNT(*)::int AS count
      FROM reward_ledger rl
      JOIN users u ON u.id = rl.user_id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN user_admin_states uas ON uas.user_id = u.id
      WHERE rl.source = 'level_first_ac'
        AND rl.coin_delta > 0
        AND rl.metadata->>'spcgLevel' = $1::text
        AND rl.created_at >= date_trunc('day', NOW())
        AND COALESCE(ur.role, 'student') = 'student'
        AND COALESCE(uas.account_status, 'active') = 'active'
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
