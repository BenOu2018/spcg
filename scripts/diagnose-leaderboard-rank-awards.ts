import { existsSync, readFileSync } from 'node:fs'
import pg from 'pg'
import {
  LEADERBOARD_RANK_AWARD_MIN_PARTICIPANTS,
  getEligibleLeaderboardRankAwards,
} from '../shared/leaderboard-rank-awards.js'

type Args = {
  userId: string | null
  spcgLevel: number | null
}

type RankRow = {
  rank: string | number
  total_participants: string | number
  spcg_level: string | number
  user_id: string
  display_name: string | null
  username: string
  coin_total: string | number
  rank_score: string | number
  passed_count: string | number
  first_scored_at: Date | string
  last_scored_at: Date | string
}

type ItemRow = {
  id: string
  name: string
  active: boolean
}

type AwardStateRow = {
  item_id: string
  item_name: string | null
  ledger_id: string | null
  inventory_quantity: string | number | null
}

type MissingAwardRow = {
  spcg_level: string | number
  rank: string | number
  total_participants: string | number
  user_id: string
  display_name: string | null
  username: string
  coin_total: string | number
  rank_score: string | number
  item_id: string
  inventory_quantity: string | number | null
  ledger_id: string | null
}

const { Pool } = pg

const leaderboardCte = `
WITH source_entries AS (
  SELECT
    rl.user_id,
    (rl.metadata->>'spcgLevel')::int AS spcg_level,
    rl.source,
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
    AND rl.metadata->>'spcgLevel' ~ '^[0-9]+$'
    AND COALESCE(ur.role, 'student') = 'student'
    AND COALESCE(uas.account_status, 'active') = 'active'
),
scored AS (
  SELECT
    spcg_level,
    user_id,
    COALESCE(SUM(coin_delta), 0)::int AS coin_total,
    COALESCE(SUM(question_count), 0)::int AS passed_count,
    MIN(created_at) AS first_scored_at,
    MAX(created_at) AS last_scored_at
  FROM source_entries
  GROUP BY spcg_level, user_id
),
decayed AS (
  SELECT
    scored.*,
    ROUND((coin_total * CASE
      WHEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - last_scored_at)) / 86400.0) <= 15 THEN 1.0
      ELSE GREATEST(0.2, 1.0 - CEIL((GREATEST(0, EXTRACT(EPOCH FROM (NOW() - last_scored_at)) / 86400.0) - 15) / 7.0) * 0.1)
    END)::numeric, 1) AS rank_score
  FROM scored
),
ranked AS (
  SELECT
    ROW_NUMBER() OVER (
      PARTITION BY spcg_level
      ORDER BY rank_score DESC, coin_total DESC, passed_count DESC, first_scored_at ASC, user_id ASC
    ) AS rank,
    COUNT(*) OVER (PARTITION BY spcg_level) AS total_participants,
    decayed.*
  FROM decayed
)
`

async function main() {
  loadLocalEnv()
  const args = parseArgs(process.argv.slice(2))
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required. Set it or add apps/web/.env.local.')

  const pool = new Pool({ connectionString: databaseUrl })
  try {
    await printItemConfig(pool)
    if (args.userId && args.spcgLevel) {
      await diagnoseUserLevel(pool, args.userId, args.spcgLevel)
      return
    }

    if (args.spcgLevel) {
      await diagnoseLevel(pool, args.spcgLevel)
      return
    }

    await printAllLevelSummary(pool)
  } finally {
    await pool.end()
  }
}

function loadLocalEnv() {
  for (const path of ['.env.local', 'apps/web/.env.local', '.env']) {
    if (!existsSync(path)) continue
    const content = readFileSync(path, 'utf8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const separator = line.indexOf('=')
      const key = line.slice(0, separator).trim()
      let value = line.slice(separator + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      process.env[key] ??= value
    }
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = { userId: null, spcgLevel: null }

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]
    const value = argv[index + 1]

    if (token === '--help' || token === '-h') {
      printUsage()
      process.exit(0)
    }

    if (token === '--user-id') {
      if (!value) throw new Error('--user-id requires a value')
      args.userId = value
      index++
      continue
    }

    if (token === '--level' || token === '--spcg-level') {
      if (!value) throw new Error(`${token} requires a value`)
      const spcgLevel = Number(value)
      if (!Number.isInteger(spcgLevel) || spcgLevel <= 0) throw new Error(`${token} must be a positive integer`)
      args.spcgLevel = spcgLevel
      index++
      continue
    }

    throw new Error(`Unknown argument: ${token}`)
  }

  if (args.userId && !args.spcgLevel) {
    throw new Error('--user-id must be used with --level')
  }

  return args
}

function printUsage() {
  console.log(`Usage:
  npm run leaderboard:rank-awards:diagnose
  npm run leaderboard:rank-awards:diagnose -- --level 1
  npm run leaderboard:rank-awards:diagnose -- --level 3 --user-id <uuid>
`)
}

async function printItemConfig(pool: pg.Pool) {
  const result = await pool.query<ItemRow>(
    `
    SELECT id, name, active
    FROM inventory_items
    WHERE id IN ('leaderboard-top-six', 'leaderboard-top-three', 'leaderboard-champion')
    ORDER BY id
    `,
  )

  console.log(`排行榜荣誉物品门槛：本级有效上榜学员 >= ${LEADERBOARD_RANK_AWARD_MIN_PARTICIPANTS}`)
  for (const row of result.rows) {
    console.log(`- ${row.id}: ${row.name} (${row.active ? 'active' : 'inactive'})`)
  }
  if (result.rows.length < 3) {
    console.log('- 警告：排行榜荣誉物品配置不完整，请检查 055_leaderboard_rank_awards.sql 是否已迁移。')
  }
  console.log('')
}

async function diagnoseUserLevel(pool: pg.Pool, userId: string, spcgLevel: number) {
  const result = await pool.query<RankRow>(
    `
    ${leaderboardCte}
    SELECT
      ranked.rank,
      ranked.total_participants,
      ranked.spcg_level,
      ranked.user_id,
      COALESCE(p.display_name, u.display_name, u.username) AS display_name,
      u.username,
      ranked.coin_total,
      ranked.rank_score,
      ranked.passed_count,
      ranked.first_scored_at,
      ranked.last_scored_at
    FROM ranked
    JOIN users u ON u.id = ranked.user_id
    LEFT JOIN profiles p ON p.user_id = ranked.user_id
    WHERE ranked.spcg_level = $1 AND ranked.user_id = $2
    `,
    [spcgLevel, userId],
  )

  const row = result.rows[0]
  if (!row) {
    console.log(`SPCG ${spcgLevel}级：用户 ${userId} 还没有有效排行榜计分。`)
    return
  }

  const rank = toNumber(row.rank)
  const totalParticipants = toNumber(row.total_participants)
  const awards = getEligibleLeaderboardRankAwards(rank, totalParticipants)

  console.log(
    `SPCG ${spcgLevel}级：${row.display_name ?? row.username} rank #${rank} / ${totalParticipants}，积分 ${row.rank_score}，计分题数 ${row.passed_count}`,
  )

  if (totalParticipants < LEADERBOARD_RANK_AWARD_MIN_PARTICIPANTS) {
    console.log(
      `未发原因：有效上榜学员 ${totalParticipants} < ${LEADERBOARD_RANK_AWARD_MIN_PARTICIPANTS}，按规则即使第 1 名也不发老六/上榜/霸榜。`,
    )
    return
  }

  if (rank > 6) {
    console.log(`未发原因：当前排名 #${rank}，不在前六。`)
    return
  }

  const states = await listAwardStates(pool, userId, spcgLevel)
  const stateByItemId = new Map(states.map((state) => [state.item_id, state]))
  for (const award of awards) {
    const state = stateByItemId.get(award.itemId)
    const hasLedger = Boolean(state?.ledger_id)
    const quantity = toNumber(state?.inventory_quantity)
    const hasInventory = quantity > 0
    const status = hasLedger && hasInventory ? '已获得' : '缺少记录'
    console.log(`- ${award.label} (${award.itemId}): ${status}，ledger=${hasLedger ? 'yes' : 'no'}，inventory=${quantity}`)
  }

  if (states.some((state) => !state.ledger_id || toNumber(state.inventory_quantity) <= 0)) {
    console.log('说明：当前符合条件但缺少记录时，按本轮策略不做历史补发；等待未来有效计分触发排行榜扫描。')
  }
}

async function diagnoseLevel(pool: pg.Pool, spcgLevel: number) {
  const result = await pool.query<MissingAwardRow>(
    `
    ${leaderboardCte},
    expected AS (
      SELECT
        ranked.spcg_level,
        ranked.rank,
        ranked.total_participants,
        ranked.user_id,
        ranked.coin_total,
        ranked.rank_score,
        awards.item_id
      FROM ranked
      CROSS JOIN LATERAL (VALUES
        ('leaderboard-top-six', 6),
        ('leaderboard-top-three', 3),
        ('leaderboard-champion', 1)
      ) awards(item_id, threshold)
      WHERE ranked.spcg_level = $1
        AND ranked.total_participants >= $2
        AND ranked.rank <= awards.threshold
        AND ranked.rank <= 6
    )
    SELECT
      expected.spcg_level,
      expected.rank,
      expected.total_participants,
      expected.user_id,
      COALESCE(p.display_name, u.display_name, u.username) AS display_name,
      u.username,
      expected.coin_total,
      expected.rank_score,
      expected.item_id,
      ui.quantity AS inventory_quantity,
      rl.id AS ledger_id
    FROM expected
    JOIN users u ON u.id = expected.user_id
    LEFT JOIN profiles p ON p.user_id = expected.user_id
    LEFT JOIN user_inventory ui ON ui.user_id = expected.user_id AND ui.item_id = expected.item_id
    LEFT JOIN reward_ledger rl ON rl.user_id = expected.user_id
      AND rl.source = 'leaderboard_rank_award'
      AND rl.source_ref = ('leaderboard:' || expected.spcg_level || ':' || expected.item_id)
    WHERE ui.user_id IS NULL OR rl.id IS NULL
    ORDER BY expected.rank ASC, expected.item_id ASC
    `,
    [spcgLevel, LEADERBOARD_RANK_AWARD_MIN_PARTICIPANTS],
  )

  const stats = await getLevelStats(pool, spcgLevel)
  if (!stats) {
    console.log(`SPCG ${spcgLevel}级：暂无有效排行榜计分。`)
    return
  }

  console.log(`SPCG ${spcgLevel}级：有效上榜学员 ${stats.totalParticipants}`)
  if (stats.totalParticipants < LEADERBOARD_RANK_AWARD_MIN_PARTICIPANTS) {
    console.log(
      `未发原因：有效上榜学员 ${stats.totalParticipants} < ${LEADERBOARD_RANK_AWARD_MIN_PARTICIPANTS}，本级暂未解锁排行榜荣誉物品。`,
    )
    return
  }

  if (result.rows.length === 0) {
    console.log('当前符合条件的前六/前三/第一都已有对应 ledger 和 inventory。')
    return
  }

  console.log('当前符合条件但缺少记录的荣誉物品：')
  for (const row of result.rows) {
    console.log(
      `- #${row.rank} ${row.display_name ?? row.username} (${row.user_id}) 缺少 ${row.item_id}，ledger=${
        row.ledger_id ? 'yes' : 'no'
      }，inventory=${toNumber(row.inventory_quantity)}`,
    )
  }
  console.log('说明：这些缺口通常来自规则上线前的历史成绩；按当前策略不做历史补发。')
}

async function printAllLevelSummary(pool: pg.Pool) {
  const result = await pool.query<{ spcg_level: string | number; total_participants: string | number; missing_awards: string | number }>(
    `
    ${leaderboardCte},
    expected AS (
      SELECT
        ranked.spcg_level,
        ranked.total_participants,
        ranked.user_id,
        awards.item_id
      FROM ranked
      CROSS JOIN LATERAL (VALUES
        ('leaderboard-top-six', 6),
        ('leaderboard-top-three', 3),
        ('leaderboard-champion', 1)
      ) awards(item_id, threshold)
      WHERE ranked.total_participants >= $1
        AND ranked.rank <= awards.threshold
        AND ranked.rank <= 6
    )
    SELECT
      ranked.spcg_level,
      MAX(ranked.total_participants) AS total_participants,
      COUNT(expected.item_id) FILTER (
        WHERE expected.item_id IS NOT NULL
          AND (ui.user_id IS NULL OR rl.id IS NULL)
      ) AS missing_awards
    FROM ranked
    LEFT JOIN expected ON expected.spcg_level = ranked.spcg_level AND expected.user_id = ranked.user_id
    LEFT JOIN user_inventory ui ON ui.user_id = expected.user_id AND ui.item_id = expected.item_id
    LEFT JOIN reward_ledger rl ON rl.user_id = expected.user_id
      AND rl.source = 'leaderboard_rank_award'
      AND rl.source_ref = ('leaderboard:' || expected.spcg_level || ':' || expected.item_id)
    GROUP BY ranked.spcg_level
    ORDER BY ranked.spcg_level ASC
    `,
    [LEADERBOARD_RANK_AWARD_MIN_PARTICIPANTS],
  )

  console.log('各 SPCG 级别排行榜荣誉诊断：')
  for (const row of result.rows) {
    const participants = toNumber(row.total_participants)
    const missingAwards = toNumber(row.missing_awards)
    const status =
      participants < LEADERBOARD_RANK_AWARD_MIN_PARTICIPANTS
        ? `未达门槛 (${participants}/${LEADERBOARD_RANK_AWARD_MIN_PARTICIPANTS})`
        : missingAwards > 0
          ? `符合条件但缺少 ${missingAwards} 个历史奖励记录`
          : '正常'
    console.log(`- SPCG ${row.spcg_level}级：${status}`)
  }
}

async function listAwardStates(pool: pg.Pool, userId: string, spcgLevel: number): Promise<AwardStateRow[]> {
  const result = await pool.query<AwardStateRow>(
    `
    SELECT
      awards.item_id,
      i.name AS item_name,
      rl.id AS ledger_id,
      ui.quantity AS inventory_quantity
    FROM (VALUES
      ('leaderboard-top-six'),
      ('leaderboard-top-three'),
      ('leaderboard-champion')
    ) awards(item_id)
    LEFT JOIN inventory_items i ON i.id = awards.item_id
    LEFT JOIN user_inventory ui ON ui.user_id = $1 AND ui.item_id = awards.item_id
    LEFT JOIN reward_ledger rl ON rl.user_id = $1
      AND rl.source = 'leaderboard_rank_award'
      AND rl.source_ref = ('leaderboard:' || $2::int || ':' || awards.item_id)
    ORDER BY awards.item_id
    `,
    [userId, spcgLevel],
  )
  return result.rows
}

async function getLevelStats(pool: pg.Pool, spcgLevel: number): Promise<{ totalParticipants: number } | null> {
  const result = await pool.query<{ total_participants: string | number }>(
    `
    ${leaderboardCte}
    SELECT MAX(total_participants) AS total_participants
    FROM ranked
    WHERE spcg_level = $1
    `,
    [spcgLevel],
  )
  const totalParticipants = result.rows[0]?.total_participants
  if (totalParticipants === null || totalParticipants === undefined) return null
  return { totalParticipants: toNumber(totalParticipants) }
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  return 0
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
