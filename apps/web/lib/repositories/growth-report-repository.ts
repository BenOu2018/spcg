import type {
  GrowthReportDelivery,
  GrowthReportDetail,
  GrowthReportSummary,
  GrowthReportStatus,
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
    periodAttemptCount: number
    periodAcceptedCount: number
    lastSubmittedAt: string | null
    periodLastSubmittedAt: string | null
  }>
  verdictCounts: Record<string, number>
  submissionCount: number
  acSubmissionCount: number
  activeDays: number
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
  behavior: GrowthReportBehaviorInput
  codeQuality: GrowthReportCodeQualityInput
  repairChains: GrowthReportRepairChain[]
}

export type GrowthReportBehaviorInput = {
  hasBehaviorEvents: boolean
  totalVisibleMinutes: number
  codingVisibleMinutes: number
  nonLearningVisibleMinutes: number
  topLearningPaths: Array<{
    path: string
    viewCount: number
    visibleMinutes: number
  }>
  topNonLearningPaths: Array<{
    path: string
    viewCount: number
    visibleMinutes: number
  }>
  ide: {
    editBatchCount: number
    changeCount: number
    insertedChars: number
    deletedChars: number
    pasteCount: number
    runCount: number
    submitCount: number
    errorCount: number
    repairSuccessCount: number
    aiErrorAnalysisCount: number
    whiteboardCount: number
    hintCount: number
    solutionVideoCount: number
  }
  submitCountWithPriorRun: number
  submitCountWithoutPriorRun: number
  aiAnalysisCount: number
  improvedAfterAiCount: number
}

export type GrowthReportCodeQualityInput = {
  analyzedSubmissionCount: number
  averageLineCount: number
  averageNonWhitespaceChars: number
  emptyLikeSubmissionCount: number
  veryShortSubmissionCount: number
  suspiciousHardcodeCount: number
  controlFlowSubmissionCount: number
  functionLikeSubmissionCount: number
}

export type GrowthReportRepairChain = {
  levelId: string
  title: string
  errorCountBeforeAccepted: number
  attemptsBeforeAccepted: number
  verdictsBeforeAccepted: string[]
  acceptedAt: string
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
  period_attempt_count: string | number | null
  period_accepted_count: string | number | null
  last_submitted_at: Date | string | null
  period_last_submitted_at: Date | string | null
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

type ActiveDaysRow = {
  active_days: string | number
}

type BehaviorPageRow = {
  path: string
  view_count: string | number
  total_visible_duration_ms: string | number | null
}

type BehaviorIdeRow = {
  edit_batch_count: string | number
  change_count: string | number | null
  inserted_chars: string | number | null
  deleted_chars: string | number | null
  paste_count: string | number | null
  run_count: string | number
  submit_count: string | number
  error_count: string | number
  repair_success_count: string | number
  ai_error_analysis_count: string | number
  whiteboard_count: string | number
  hint_count: string | number
  solution_video_count: string | number
}

type BehaviorSubmitRunRow = {
  submit_count: string | number
  submit_count_with_prior_run: string | number
}

type BehaviorAiFollowUpRow = {
  ai_analysis_count: string | number
  improved_after_ai_count: string | number
}

type CodeQualityRow = {
  analyzed_submission_count: string | number
  average_line_count: string | number | null
  average_non_whitespace_chars: string | number | null
  empty_like_submission_count: string | number
  very_short_submission_count: string | number
  suspicious_hardcode_count: string | number
  control_flow_submission_count: string | number
  function_like_submission_count: string | number
}

type RepairChainRow = {
  level_id: string
  title: string | null
  error_count_before_accepted: string | number
  attempts_before_accepted: string | number
  verdicts_before_accepted: string[] | null
  accepted_at: Date | string
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
  public_token_encrypted: Record<string, unknown> | null
  error_message: string | null
  token_expires_at: Date | string
  created_at: Date | string
}

export type GrowthReportSummaryRecord = GrowthReportSummary & {
  publicTokenEncrypted: Record<string, unknown> | null
}

export type GrowthReportDetailRecord = GrowthReportDetail & {
  publicTokenEncrypted: Record<string, unknown> | null
}

export type GrowthReportGenerationJob = {
  id: string
  studentUserId: string
  periodStart: string
  periodEnd: string
  status: GrowthReportStatus
}

export type GrowthReportCooldownRecord = {
  id: string
  status: GrowthReportStatus
  createdAt: string
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
  const [
    student,
    progressRows,
    verdictRows,
    rewardDelta,
    wallet,
    assessmentRows,
    activeDays,
    behavior,
    codeQuality,
    repairChains,
  ] = await Promise.all([
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
        COALESCE(period_stats.period_attempt_count, 0) AS period_attempt_count,
        COALESCE(period_stats.period_accepted_count, 0) AS period_accepted_count,
        pr.last_submitted_at,
        period_stats.period_last_submitted_at
      FROM progress pr
      LEFT JOIN levels l ON l.id = pr.level_id
      LEFT JOIN (
        SELECT
          level_id,
          COUNT(*) AS period_attempt_count,
          COUNT(*) FILTER (WHERE verdict->>'result' = 'AC') AS period_accepted_count,
          MAX(created_at) AS period_last_submitted_at
        FROM submissions
        WHERE user_id = $1
          AND created_at >= $2::date
          AND created_at < ($3::date + INTERVAL '1 day')
        GROUP BY level_id
      ) period_stats ON period_stats.level_id = pr.level_id
      WHERE pr.user_id = $1
      ORDER BY COALESCE(period_stats.period_last_submitted_at, pr.last_submitted_at) DESC NULLS LAST, pr.updated_at DESC
      `,
      [input.studentUserId, input.periodStart, input.periodEnd],
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
    getActiveDays(input),
    getBehaviorInput(input),
    getCodeQualityInput(input),
    getRepairChains(input),
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
      periodAttemptCount: toNumber(row.period_attempt_count),
      periodAcceptedCount: toNumber(row.period_accepted_count),
      lastSubmittedAt: row.last_submitted_at ? toIsoString(row.last_submitted_at) : null,
      periodLastSubmittedAt: row.period_last_submitted_at ? toIsoString(row.period_last_submitted_at) : null,
    })),
    verdictCounts,
    submissionCount: verdictRows.reduce((sum, row) => sum + toNumber(row.count), 0),
    acSubmissionCount: toNumber(verdictCounts.AC ?? 0),
    activeDays,
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
    behavior,
    codeQuality,
    repairChains,
  }
}

async function getActiveDays(input: {
  studentUserId: string
  periodStart: string
  periodEnd: string
}): Promise<number> {
  const row = await queryOne<ActiveDaysRow>(
    `
    SELECT COUNT(DISTINCT created_at::date) AS active_days
    FROM submissions
    WHERE user_id = $1
      AND created_at >= $2::date
      AND created_at < ($3::date + INTERVAL '1 day')
    `,
    [input.studentUserId, input.periodStart, input.periodEnd],
  )
  return toNumber(row?.active_days)
}

async function getBehaviorInput(input: {
  studentUserId: string
  periodStart: string
  periodEnd: string
}): Promise<GrowthReportBehaviorInput> {
  try {
    const [pageRows, ideRow, submitRunRow, aiFollowUpRow] = await Promise.all([
      query<BehaviorPageRow>(
        `
        SELECT
          path,
          COUNT(*) AS view_count,
          COALESCE(SUM(visible_duration_ms), 0) AS total_visible_duration_ms
        FROM user_page_views
        WHERE user_id = $1
          AND started_at >= $2::date
          AND started_at < ($3::date + INTERVAL '1 day')
        GROUP BY path
        ORDER BY total_visible_duration_ms DESC, view_count DESC
        LIMIT 20
        `,
        [input.studentUserId, input.periodStart, input.periodEnd],
      ),
      queryOne<BehaviorIdeRow>(
        `
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'ide_edit_summary') AS edit_batch_count,
          COALESCE(SUM(count) FILTER (WHERE event_type = 'ide_edit_summary'), 0) AS change_count,
          COALESCE(SUM(CASE WHEN metadata->>'insertedChars' ~ '^[0-9]+$' THEN (metadata->>'insertedChars')::int ELSE 0 END), 0) AS inserted_chars,
          COALESCE(SUM(CASE WHEN metadata->>'deletedChars' ~ '^[0-9]+$' THEN (metadata->>'deletedChars')::int ELSE 0 END), 0) AS deleted_chars,
          COALESCE(SUM(CASE WHEN metadata->>'pasteCount' ~ '^[0-9]+$' THEN (metadata->>'pasteCount')::int ELSE 0 END), 0) AS paste_count,
          COUNT(*) FILTER (WHERE event_type = 'ide_run' AND metadata->>'phase' = 'finish') AS run_count,
          COUNT(*) FILTER (WHERE event_type = 'ide_submit' AND metadata->>'phase' = 'finish') AS submit_count,
          COUNT(*) FILTER (WHERE event_type = 'ide_error') AS error_count,
          COUNT(*) FILTER (WHERE event_type = 'repair_success') AS repair_success_count,
          COUNT(*) FILTER (WHERE event_type = 'ai_error_analysis') AS ai_error_analysis_count,
          COUNT(*) FILTER (WHERE event_type = 'whiteboard') AS whiteboard_count,
          COUNT(*) FILTER (WHERE event_type = 'hint') AS hint_count,
          COUNT(*) FILTER (WHERE event_type = 'solution_video') AS solution_video_count
        FROM user_behavior_events
        WHERE user_id = $1
          AND occurred_at >= $2::date
          AND occurred_at < ($3::date + INTERVAL '1 day')
        `,
        [input.studentUserId, input.periodStart, input.periodEnd],
      ),
      queryOne<BehaviorSubmitRunRow>(
        `
        WITH submits AS (
          SELECT id, level_id, occurred_at
          FROM user_behavior_events
          WHERE user_id = $1
            AND event_type = 'ide_submit'
            AND metadata->>'phase' = 'finish'
            AND occurred_at >= $2::date
            AND occurred_at < ($3::date + INTERVAL '1 day')
        )
        SELECT
          COUNT(*) AS submit_count,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM user_behavior_events r
              WHERE r.user_id = $1
                AND r.event_type = 'ide_run'
                AND r.metadata->>'phase' = 'finish'
                AND r.level_id IS NOT DISTINCT FROM submits.level_id
                AND r.occurred_at <= submits.occurred_at
                AND r.occurred_at >= submits.occurred_at - INTERVAL '90 minutes'
            )
          ) AS submit_count_with_prior_run
        FROM submits
        `,
        [input.studentUserId, input.periodStart, input.periodEnd],
      ),
      queryOne<BehaviorAiFollowUpRow>(
        `
        WITH ai_events AS (
          SELECT id, level_id, occurred_at
          FROM user_behavior_events
          WHERE user_id = $1
            AND event_type = 'ai_error_analysis'
            AND metadata->>'phase' = 'finish'
            AND metadata->>'ok' = 'true'
            AND occurred_at >= $2::date
            AND occurred_at < ($3::date + INTERVAL '1 day')
        )
        SELECT
          COUNT(*) AS ai_analysis_count,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM submissions s
              WHERE s.user_id = $1
                AND s.level_id = ai_events.level_id
                AND s.created_at > ai_events.occurred_at
                AND s.created_at < ($3::date + INTERVAL '1 day')
                AND s.verdict->>'result' = 'AC'
            )
          ) AS improved_after_ai_count
        FROM ai_events
        `,
        [input.studentUserId, input.periodStart, input.periodEnd],
      ),
    ])

    const learningRows = pageRows.filter((row) => isCodingLearningPath(row.path))
    const topLearningPaths = learningRows.slice(0, 5)
    const topNonLearningPaths = pageRows.filter((row) => !isCodingLearningPath(row.path)).slice(0, 5)
    const totalVisibleMs = pageRows.reduce((sum, row) => sum + toNumber(row.total_visible_duration_ms), 0)
    const codingVisibleMs = learningRows.reduce((sum, row) => sum + toNumber(row.total_visible_duration_ms), 0)
    const nonLearningVisibleMs = pageRows
      .filter((row) => !isCodingLearningPath(row.path))
      .reduce((sum, row) => sum + toNumber(row.total_visible_duration_ms), 0)
    const submitWithPriorRun = toNumber(submitRunRow?.submit_count_with_prior_run)
    const submitCount = toNumber(submitRunRow?.submit_count)

    return {
      hasBehaviorEvents: pageRows.length > 0 || totalIdeActionCount(ideRow) > 0,
      totalVisibleMinutes: Math.round(totalVisibleMs / 60_000),
      codingVisibleMinutes: Math.round(codingVisibleMs / 60_000),
      nonLearningVisibleMinutes: Math.round(nonLearningVisibleMs / 60_000),
      topLearningPaths: topLearningPaths.map(mapBehaviorPathRow),
      topNonLearningPaths: topNonLearningPaths.map(mapBehaviorPathRow),
      ide: {
        editBatchCount: toNumber(ideRow?.edit_batch_count),
        changeCount: toNumber(ideRow?.change_count),
        insertedChars: toNumber(ideRow?.inserted_chars),
        deletedChars: toNumber(ideRow?.deleted_chars),
        pasteCount: toNumber(ideRow?.paste_count),
        runCount: toNumber(ideRow?.run_count),
        submitCount: toNumber(ideRow?.submit_count),
        errorCount: toNumber(ideRow?.error_count),
        repairSuccessCount: toNumber(ideRow?.repair_success_count),
        aiErrorAnalysisCount: toNumber(ideRow?.ai_error_analysis_count),
        whiteboardCount: toNumber(ideRow?.whiteboard_count),
        hintCount: toNumber(ideRow?.hint_count),
        solutionVideoCount: toNumber(ideRow?.solution_video_count),
      },
      submitCountWithPriorRun: submitWithPriorRun,
      submitCountWithoutPriorRun: Math.max(0, submitCount - submitWithPriorRun),
      aiAnalysisCount: toNumber(aiFollowUpRow?.ai_analysis_count),
      improvedAfterAiCount: toNumber(aiFollowUpRow?.improved_after_ai_count),
    }
  } catch (error) {
    if (isUndefinedTableError(error)) return emptyBehaviorInput()
    throw error
  }
}

async function getCodeQualityInput(input: {
  studentUserId: string
  periodStart: string
  periodEnd: string
}): Promise<GrowthReportCodeQualityInput> {
  const row = await queryOne<CodeQualityRow>(
    `
    SELECT
      COUNT(*) AS analyzed_submission_count,
      COALESCE(AVG(array_length(regexp_split_to_array(code, E'\\n'), 1)), 0) AS average_line_count,
      COALESCE(AVG(length(regexp_replace(code, '[[:space:]]', '', 'g'))), 0) AS average_non_whitespace_chars,
      COUNT(*) FILTER (WHERE length(regexp_replace(code, '[[:space:]]', '', 'g')) < 20) AS empty_like_submission_count,
      COUNT(*) FILTER (WHERE length(regexp_replace(code, '[[:space:]]', '', 'g')) BETWEEN 20 AND 59) AS very_short_submission_count,
      COUNT(*) FILTER (
        WHERE code ~* '(cout|printf|print)[^[:cntrl:]]*("[^"]+"|[0-9]{2,})'
          AND code !~* '\\y(cin|scanf|input)\\y'
      ) AS suspicious_hardcode_count,
      COUNT(*) FILTER (WHERE code ~* '\\y(if|for|while|switch)\\y') AS control_flow_submission_count,
      COUNT(*) FILTER (
        WHERE code ~* '\\y(void|int|long|double|bool|string|char)[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*\\('
          OR code ~* '\\ydef[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*\\('
      ) AS function_like_submission_count
    FROM submissions
    WHERE user_id = $1
      AND created_at >= $2::date
      AND created_at < ($3::date + INTERVAL '1 day')
    `,
    [input.studentUserId, input.periodStart, input.periodEnd],
  )

  return {
    analyzedSubmissionCount: toNumber(row?.analyzed_submission_count),
    averageLineCount: Math.round(toNumber(row?.average_line_count)),
    averageNonWhitespaceChars: Math.round(toNumber(row?.average_non_whitespace_chars)),
    emptyLikeSubmissionCount: toNumber(row?.empty_like_submission_count),
    veryShortSubmissionCount: toNumber(row?.very_short_submission_count),
    suspiciousHardcodeCount: toNumber(row?.suspicious_hardcode_count),
    controlFlowSubmissionCount: toNumber(row?.control_flow_submission_count),
    functionLikeSubmissionCount: toNumber(row?.function_like_submission_count),
  }
}

async function getRepairChains(input: {
  studentUserId: string
  periodStart: string
  periodEnd: string
}): Promise<GrowthReportRepairChain[]> {
  const rows = await query<RepairChainRow>(
    `
    WITH period_submissions AS (
      SELECT
        s.level_id,
        COALESCE(l.title, s.level_id) AS title,
        s.created_at,
        COALESCE(s.verdict->>'result', CASE WHEN s.status = 'error' THEN 'Judge Error' ELSE s.status END) AS result
      FROM submissions s
      LEFT JOIN levels l ON l.id = s.level_id
      WHERE s.user_id = $1
        AND s.created_at >= $2::date
        AND s.created_at < ($3::date + INTERVAL '1 day')
    ),
    first_ac AS (
      SELECT level_id, MIN(created_at) AS accepted_at
      FROM period_submissions
      WHERE result = 'AC'
      GROUP BY level_id
    )
    SELECT
      ps.level_id,
      MAX(ps.title) AS title,
      COUNT(*) FILTER (WHERE ps.created_at < fa.accepted_at AND ps.result <> 'AC') AS error_count_before_accepted,
      COUNT(*) FILTER (WHERE ps.created_at <= fa.accepted_at) AS attempts_before_accepted,
      ARRAY_AGG(DISTINCT ps.result) FILTER (WHERE ps.created_at < fa.accepted_at AND ps.result <> 'AC') AS verdicts_before_accepted,
      fa.accepted_at
    FROM first_ac fa
    JOIN period_submissions ps ON ps.level_id = fa.level_id
    GROUP BY ps.level_id, fa.accepted_at
    HAVING COUNT(*) FILTER (WHERE ps.created_at < fa.accepted_at AND ps.result <> 'AC') > 0
    ORDER BY fa.accepted_at DESC
    LIMIT 6
    `,
    [input.studentUserId, input.periodStart, input.periodEnd],
  )

  return rows.map((row) => ({
    levelId: row.level_id,
    title: row.title ?? row.level_id,
    errorCountBeforeAccepted: toNumber(row.error_count_before_accepted),
    attemptsBeforeAccepted: toNumber(row.attempts_before_accepted),
    verdictsBeforeAccepted: row.verdicts_before_accepted ?? [],
    acceptedAt: toIsoString(row.accepted_at),
  }))
}

export async function createGrowthReportWithDeliveries(input: {
  studentUserId: string
  periodStart: string
  periodEnd: string
  title: string
  markdown: string
  summary: Record<string, unknown>
  tokenHash: string
  publicTokenEncrypted: Record<string, unknown>
  tokenExpiresAt: Date | string
  generatedBy: string
  status?: GrowthReportStatus
  channels?: GrowthReportDelivery['channel'][]
}): Promise<{ report: GrowthReportDetailRecord; deliveries: GrowthReportDelivery[] }> {
  return withTransaction(async (client) => {
    const reportResult = await client.query<ReportRow>(
      `
      INSERT INTO growth_reports
        (student_user_id, period_start, period_end, status, title, markdown, summary, token_hash, public_token_encrypted, token_expires_at, generated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, student_user_id, title, period_start, period_end, status, markdown, summary, public_token_encrypted, error_message, token_expires_at, created_at
      `,
      [
        input.studentUserId,
        input.periodStart,
        input.periodEnd,
        input.status ?? 'generated',
        input.title,
        input.markdown,
        input.summary,
        input.tokenHash,
        JSON.stringify(input.publicTokenEncrypted),
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

export async function listGrowthReportsForStudent(studentUserId: string, limit = 10): Promise<GrowthReportSummaryRecord[]> {
  const rows = await query<ReportRow>(
    `
    SELECT id, student_user_id, title, period_start, period_end, status, markdown, summary, public_token_encrypted, error_message, token_expires_at, created_at
    FROM growth_reports
    WHERE student_user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [studentUserId, Math.max(1, Math.min(limit, 50))],
  )
  return rows.map(mapReportSummaryRow)
}

export async function listGrowthReportDetailsForStudent(studentUserId: string, limit = 10): Promise<GrowthReportDetailRecord[]> {
  const rows = await query<ReportRow>(
    `
    SELECT id, student_user_id, title, period_start, period_end, status, markdown, summary, public_token_encrypted, error_message, token_expires_at, created_at
    FROM growth_reports
    WHERE student_user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [studentUserId, Math.max(1, Math.min(limit, 50))],
  )
  return rows.map(mapReportRow)
}

export async function getGrowthReportDetailForStudent(input: {
  studentUserId: string
  reportId: string
}): Promise<GrowthReportDetailRecord | null> {
  const row = await queryOne<ReportRow>(
    `
    SELECT id, student_user_id, title, period_start, period_end, status, markdown, summary, public_token_encrypted, error_message, token_expires_at, created_at
    FROM growth_reports
    WHERE student_user_id = $1
      AND id = $2
    `,
    [input.studentUserId, input.reportId],
  )
  return row ? mapReportRow(row) : null
}

export async function getLatestChargeableGrowthReportForStudent(studentUserId: string): Promise<GrowthReportCooldownRecord | null> {
  const row = await queryOne<Pick<ReportRow, 'id' | 'status' | 'created_at'>>(
    `
    SELECT id, status, created_at
    FROM growth_reports
    WHERE student_user_id = $1
      AND status IN ('pending', 'generated')
      AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [studentUserId],
  )
  return row
    ? {
        id: row.id,
        status: row.status,
        createdAt: toIsoString(row.created_at),
      }
    : null
}

export async function getGrowthReportByTokenHash(tokenHash: string): Promise<GrowthReportDetail | null> {
  const row = await queryOne<ReportRow>(
    `
    SELECT id, student_user_id, title, period_start, period_end, status, markdown, summary, public_token_encrypted, error_message, token_expires_at, created_at
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

export async function getGrowthReportGenerationJob(reportId: string): Promise<GrowthReportGenerationJob | null> {
  const row = await queryOne<Pick<ReportRow, 'id' | 'student_user_id' | 'period_start' | 'period_end' | 'status'>>(
    `
    SELECT id, student_user_id, period_start, period_end, status
    FROM growth_reports
    WHERE id = $1
    `,
    [reportId],
  )
  return row
    ? {
        id: row.id,
        studentUserId: row.student_user_id,
        periodStart: formatDateOnly(row.period_start),
        periodEnd: formatDateOnly(row.period_end),
        status: row.status,
      }
    : null
}

export async function markGrowthReportGenerated(input: {
  reportId: string
  title: string
  markdown: string
  summary: Record<string, unknown>
}): Promise<GrowthReportDetailRecord | null> {
  const row = await queryOne<ReportRow>(
    `
    UPDATE growth_reports
    SET status = 'generated',
        title = $2,
        markdown = $3,
        summary = $4,
        error_message = NULL,
        updated_at = NOW()
    WHERE id = $1
      AND status = 'pending'
    RETURNING id, student_user_id, title, period_start, period_end, status, markdown, summary, public_token_encrypted, error_message, token_expires_at, created_at
    `,
    [input.reportId, input.title, input.markdown, JSON.stringify(input.summary)],
  )
  return row ? mapReportRow(row) : null
}

export async function markGrowthReportFailed(input: {
  reportId: string
  errorMessage: string
}): Promise<GrowthReportDetailRecord | null> {
  const markdown = [
    '# 家长学习报告',
    '',
    '报告生成失败，请稍后重新生成。',
  ].join('\n')
  const row = await queryOne<ReportRow>(
    `
    UPDATE growth_reports
    SET status = 'failed',
        markdown = $2,
        error_message = $3,
        updated_at = NOW()
    WHERE id = $1
      AND status = 'pending'
    RETURNING id, student_user_id, title, period_start, period_end, status, markdown, summary, public_token_encrypted, error_message, token_expires_at, created_at
    `,
    [input.reportId, markdown, input.errorMessage],
  )
  return row ? mapReportRow(row) : null
}

function emptyBehaviorInput(): GrowthReportBehaviorInput {
  return {
    hasBehaviorEvents: false,
    totalVisibleMinutes: 0,
    codingVisibleMinutes: 0,
    nonLearningVisibleMinutes: 0,
    topLearningPaths: [],
    topNonLearningPaths: [],
    ide: {
      editBatchCount: 0,
      changeCount: 0,
      insertedChars: 0,
      deletedChars: 0,
      pasteCount: 0,
      runCount: 0,
      submitCount: 0,
      errorCount: 0,
      repairSuccessCount: 0,
      aiErrorAnalysisCount: 0,
      whiteboardCount: 0,
      hintCount: 0,
      solutionVideoCount: 0,
    },
    submitCountWithPriorRun: 0,
    submitCountWithoutPriorRun: 0,
    aiAnalysisCount: 0,
    improvedAfterAiCount: 0,
  }
}

function mapBehaviorPathRow(row: BehaviorPageRow): GrowthReportBehaviorInput['topLearningPaths'][number] {
  return {
    path: row.path,
    viewCount: toNumber(row.view_count),
    visibleMinutes: Math.round(toNumber(row.total_visible_duration_ms) / 60_000),
  }
}

function totalIdeActionCount(row: BehaviorIdeRow | null): number {
  if (!row) return 0
  return (
    toNumber(row.edit_batch_count) +
    toNumber(row.run_count) +
    toNumber(row.submit_count) +
    toNumber(row.error_count) +
    toNumber(row.repair_success_count) +
    toNumber(row.ai_error_analysis_count) +
    toNumber(row.whiteboard_count) +
    toNumber(row.hint_count) +
    toNumber(row.solution_video_count)
  )
}

function isCodingLearningPath(path: string): boolean {
  return (
    path === '/' ||
    path === '/map' ||
    path === '/knowledge-tree' ||
    path.startsWith('/level/') ||
    path.startsWith('/test/') ||
    path.startsWith('/exam/') ||
    path.startsWith('/daily-review') ||
    path.startsWith('/me/submissions')
  )
}

function isUndefinedTableError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42P01'
}

function mapReportRow(row: ReportRow): GrowthReportDetailRecord {
  return {
    ...mapReportSummaryRow(row),
    markdown: row.markdown,
    summary: row.summary,
    publicTokenEncrypted: row.public_token_encrypted,
  }
}

function mapReportSummaryRow(row: ReportRow): GrowthReportSummaryRecord {
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    title: row.title,
    periodStart: formatDateOnly(row.period_start),
    periodEnd: formatDateOnly(row.period_end),
    status: row.status,
    publicUrl: null,
    errorMessage: row.error_message,
    tokenExpiresAt: toIsoString(row.token_expires_at),
    createdAt: toIsoString(row.created_at),
    publicTokenEncrypted: row.public_token_encrypted,
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
