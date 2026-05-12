import type {
  GrowthReportDelivery,
  GrowthReportDetail,
  GrowthReportSummary,
} from '@spcg/shared/types'
import { query, queryOne, withTransaction } from '@/lib/db'

export type GrowthReportAnalysisInput = {
  student: {
    userId: string
    username: string
    displayName: string
  }
  periodStart: string
  periodEnd: string
  progress: Array<{
    levelId: string
    title: string
    knowledgePoint: string
    spcgLevel: number
    passed: boolean
    attemptCount: number
    lastSubmittedAt: string | null
  }>
  verdictCounts: Record<string, number>
  submissionCount: number
  acSubmissionCount: number
  rewardCoinDelta: number
  rewardGarlicDelta: number
  wallet: {
    coinTotal: number
    garlicBalance: number
    rank: string
    title: string
  } | null
  assessments: Array<{
    title: string
    status: string
    score: number
    totalCount: number
    acceptedCount: number
    finishedAt: string | null
  }>
}

type StudentRow = {
  id: string
  username: string
  display_name: string | null
}

type ProgressRow = {
  level_id: string
  title: string | null
  knowledge_point: string | null
  spcg_level: string | number | null
  passed: boolean
  attempt_count: number
  last_submitted_at: Date | string | null
}

type VerdictCountRow = {
  result: string | null
  count: string | number
}

type RewardDeltaRow = {
  coin_delta: string | number | null
  garlic_delta: string | number | null
}

type WalletRow = {
  coin_total: number
  garlic_balance: number
  rank: string
  title: string
}

type AssessmentRow = {
  title: string | null
  status: string
  score: number
  total_count: number
  accepted_count: number
  finished_at: Date | string | null
}

type ReportRow = {
  id: string
  student_user_id: string
  title: string
  period_start: Date | string
  period_end: Date | string
  status: GrowthReportSummary['status']
  markdown: string
  summary: Record<string, unknown>
  token_expires_at: Date | string
  created_at: Date | string
}

type DeliveryRow = {
  id: string
  report_id: string
  parent_user_id: string
  channel: GrowthReportDelivery['channel']
  target: string
  status: GrowthReportDelivery['status']
  failure_reason: string | null
  created_at: Date | string
}

export async function getGrowthReportAnalysisInput(input: {
  studentUserId: string
  periodStart: string
  periodEnd: string
}): Promise<GrowthReportAnalysisInput> {
  const [student, progressRows, verdictRows, rewardDelta, wallet, assessmentRows] = await Promise.all([
    queryOne<StudentRow>(
      `
      SELECT u.id, u.username, COALESCE(p.display_name, u.display_name, u.username) AS display_name
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = $1
      `,
      [input.studentUserId],
    ),
    query<ProgressRow>(
      `
      SELECT
        pr.level_id,
        l.title,
        l.knowledge_point,
        l.difficulty->>'spcgLevel' AS spcg_level,
        pr.passed,
        pr.attempt_count,
        pr.last_submitted_at
      FROM progress pr
      LEFT JOIN levels l ON l.id = pr.level_id
      WHERE pr.user_id = $1
      ORDER BY pr.last_submitted_at DESC NULLS LAST, pr.updated_at DESC
      `,
      [input.studentUserId],
    ),
    query<VerdictCountRow>(
      `
      SELECT
        COALESCE(s.verdict->>'result', CASE WHEN s.status = 'error' THEN 'Judge Error' ELSE s.status END) AS result,
        COUNT(*) AS count
      FROM submissions s
      WHERE s.user_id = $1
        AND s.created_at >= $2::date
        AND s.created_at < ($3::date + INTERVAL '1 day')
      GROUP BY result
      `,
      [input.studentUserId, input.periodStart, input.periodEnd],
    ),
    queryOne<RewardDeltaRow>(
      `
      SELECT
        COALESCE(SUM(coin_delta), 0) AS coin_delta,
        COALESCE(SUM(garlic_delta), 0) AS garlic_delta
      FROM reward_ledger
      WHERE user_id = $1
        AND created_at >= $2::date
        AND created_at < ($3::date + INTERVAL '1 day')
      `,
      [input.studentUserId, input.periodStart, input.periodEnd],
    ),
    queryOne<WalletRow>(
      `
      SELECT coin_total, garlic_balance, rank, title
      FROM user_wallets
      WHERE user_id = $1
      `,
      [input.studentUserId],
    ),
    query<AssessmentRow>(
      `
      SELECT
        s.title,
        aa.status,
        aa.score,
        aa.total_count,
        aa.accepted_count,
        aa.finished_at
      FROM assessment_attempts aa
      LEFT JOIN assessment_sessions s ON s.id = aa.session_id
      WHERE aa.user_id = $1
        AND aa.created_at >= $2::date
        AND aa.created_at < ($3::date + INTERVAL '1 day')
      ORDER BY aa.created_at DESC
      `,
      [input.studentUserId, input.periodStart, input.periodEnd],
    ),
  ])

  if (!student) throw new Error('Student not found')

  const verdictCounts: Record<string, number> = {}
  for (const row of verdictRows) {
    verdictCounts[row.result ?? 'Other'] = toNumber(row.count)
  }

  return {
    student: {
      userId: student.id,
      username: student.username,
      displayName: student.display_name ?? student.username,
    },
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    progress: progressRows.map((row) => ({
      levelId: row.level_id,
      title: row.title ?? row.level_id,
      knowledgePoint: row.knowledge_point ?? '',
      spcgLevel: Number(row.spcg_level ?? 0),
      passed: row.passed,
      attemptCount: row.attempt_count,
      lastSubmittedAt: row.last_submitted_at ? toIsoString(row.last_submitted_at) : null,
    })),
    verdictCounts,
    submissionCount: verdictRows.reduce((sum, row) => sum + toNumber(row.count), 0),
    acSubmissionCount: toNumber(verdictCounts.AC ?? 0),
    rewardCoinDelta: toNumber(rewardDelta?.coin_delta),
    rewardGarlicDelta: toNumber(rewardDelta?.garlic_delta),
    wallet: wallet
      ? {
          coinTotal: wallet.coin_total,
          garlicBalance: wallet.garlic_balance,
          rank: wallet.rank,
          title: wallet.title,
        }
      : null,
    assessments: assessmentRows.map((row) => ({
      title: row.title ?? 'SPCG 段位赛',
      status: row.status,
      score: row.score,
      totalCount: row.total_count,
      acceptedCount: row.accepted_count,
      finishedAt: row.finished_at ? toIsoString(row.finished_at) : null,
    })),
  }
}

export async function createGrowthReportWithDeliveries(input: {
  studentUserId: string
  periodStart: string
  periodEnd: string
  title: string
  markdown: string
  summary: Record<string, unknown>
  tokenHash: string
  tokenExpiresAt: Date | string
  generatedBy: string
  channels?: GrowthReportDelivery['channel'][]
}): Promise<{ report: GrowthReportDetail; deliveries: GrowthReportDelivery[] }> {
  return withTransaction(async (client) => {
    const reportResult = await client.query<ReportRow>(
      `
      INSERT INTO growth_reports
        (student_user_id, period_start, period_end, title, markdown, summary, token_hash, token_expires_at, generated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, student_user_id, title, period_start, period_end, status, markdown, summary, token_expires_at, created_at
      `,
      [
        input.studentUserId,
        input.periodStart,
        input.periodEnd,
        input.title,
        input.markdown,
        input.summary,
        input.tokenHash,
        input.tokenExpiresAt,
        input.generatedBy,
      ],
    )
    const reportRow = reportResult.rows[0]
    if (!reportRow) throw new Error('Growth report was not created')

    const channels = input.channels ?? ['email', 'sms']
    if (channels.includes('email')) {
      await client.query(
        `
        INSERT INTO growth_report_deliveries (report_id, parent_user_id, channel, target)
        SELECT $1, ps.parent_user_id, 'email', u.email
        FROM parent_students ps
        JOIN users u ON u.id = ps.parent_user_id
        WHERE ps.student_user_id = $2
          AND ps.status = 'active'
          AND u.email IS NOT NULL
          AND length(trim(u.email)) > 0
        ON CONFLICT (report_id, parent_user_id, channel, target) DO NOTHING
        `,
        [reportRow.id, input.studentUserId],
      )
    }

    if (channels.includes('sms')) {
      await client.query(
        `
        INSERT INTO growth_report_deliveries (report_id, parent_user_id, channel, target)
        SELECT $1, ps.parent_user_id, 'sms', p.phone_number
        FROM parent_students ps
        JOIN profiles p ON p.user_id = ps.parent_user_id
        WHERE ps.student_user_id = $2
          AND ps.status = 'active'
          AND p.phone_number IS NOT NULL
          AND length(trim(p.phone_number)) > 0
        ON CONFLICT (report_id, parent_user_id, channel, target) DO NOTHING
        `,
        [reportRow.id, input.studentUserId],
      )
    }

    const deliveries = await client.query<DeliveryRow>(
      `
      SELECT id, report_id, parent_user_id, channel, target, status, failure_reason, created_at
      FROM growth_report_deliveries
      WHERE report_id = $1
      ORDER BY created_at ASC
      `,
      [reportRow.id],
    )

    return {
      report: mapReportRow(reportRow),
      deliveries: deliveries.rows.map(mapDeliveryRow),
    }
  })
}

export async function listGrowthReportsForStudent(studentUserId: string, limit = 10): Promise<GrowthReportSummary[]> {
  const rows = await query<ReportRow>(
    `
    SELECT id, student_user_id, title, period_start, period_end, status, markdown, summary, token_expires_at, created_at
    FROM growth_reports
    WHERE student_user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [studentUserId, Math.max(1, Math.min(limit, 50))],
  )
  return rows.map(mapReportSummaryRow)
}

export async function getGrowthReportByTokenHash(tokenHash: string): Promise<GrowthReportDetail | null> {
  const row = await queryOne<ReportRow>(
    `
    SELECT id, student_user_id, title, period_start, period_end, status, markdown, summary, token_expires_at, created_at
    FROM growth_reports
    WHERE token_hash = $1
      AND status = 'generated'
      AND revoked_at IS NULL
      AND token_expires_at > NOW()
    `,
    [tokenHash],
  )
  return row ? mapReportRow(row) : null
}

function mapReportRow(row: ReportRow): GrowthReportDetail {
  return {
    ...mapReportSummaryRow(row),
    markdown: row.markdown,
    summary: row.summary,
  }
}

function mapReportSummaryRow(row: ReportRow): GrowthReportSummary {
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    title: row.title,
    periodStart: formatDateOnly(row.period_start),
    periodEnd: formatDateOnly(row.period_end),
    status: row.status,
    tokenExpiresAt: toIsoString(row.token_expires_at),
    createdAt: toIsoString(row.created_at),
  }
}

function mapDeliveryRow(row: DeliveryRow): GrowthReportDelivery {
  return {
    id: row.id,
    reportId: row.report_id,
    parentUserId: row.parent_user_id,
    channel: row.channel,
    target: row.target,
    status: row.status,
    failureReason: row.failure_reason,
    createdAt: toIsoString(row.created_at),
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

function formatDateOnly(value: Date | string): string {
  return toIsoString(value).slice(0, 10)
}
