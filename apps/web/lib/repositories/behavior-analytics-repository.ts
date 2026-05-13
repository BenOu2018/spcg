import type {
  BehaviorAnalysisProvider,
  BehaviorAnalysisReportSummary,
  BehaviorAnalysisResult,
  BehaviorAnalysisStatus,
  BehaviorEventType,
  UserRole,
} from '@spcg/shared/types'
import type { PoolClient } from 'pg'
import { query, queryOne, withTransaction } from '@/lib/db'

export const BEHAVIOR_EVENT_TYPES = [
  'page_view_start',
  'page_view_end',
  'click',
  'ide_session',
  'ide_edit_summary',
  'ide_run',
  'ide_submit',
  'ide_error',
  'repair_success',
  'history_load',
  'ai_error_analysis',
  'whiteboard',
  'hint',
  'solution_video',
] as const satisfies readonly BehaviorEventType[]

export type BehaviorEventInsert = {
  clientEventId: string
  clientPageViewId: string | null
  eventType: BehaviorEventType
  occurredAt: string
  path: string | null
  sanitizedUrl: string | null
  title: string | null
  levelId: string | null
  submissionId: string | null
  assessmentAttemptId: string | null
  durationMs: number | null
  count: number | null
  result: string | null
  metadata: Record<string, unknown>
}

export type BehaviorAnalysisInput = {
  student: {
    userId: string
    username: string
    displayName: string
    userRole: UserRole
  }
  periodStart: string
  periodEnd: string
  pageViews: Array<{
    path: string
    viewCount: number
    totalDurationMs: number
    totalVisibleDurationMs: number
  }>
  eventCounts: Record<BehaviorEventType, number>
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
  verdictCounts: Record<string, number>
  submissionCount: number
  acceptedSubmissionCount: number
  levelActivity: Array<{
    levelId: string
    levelTitle: string
    eventCount: number
    runCount: number
    submitCount: number
    errorCount: number
    repairSuccessCount: number
  }>
  recentEvents: Array<{
    eventType: BehaviorEventType
    path: string | null
    levelId: string | null
    levelTitle: string | null
    result: string | null
    occurredAt: string
  }>
}

type SessionRow = {
  id: string
}

type PageViewRow = {
  id: string
}

type StudentRow = {
  id: string
  username: string
  display_name: string | null
  user_role: UserRole | null
}

type PageViewSummaryRow = {
  path: string
  view_count: string | number
  total_duration_ms: string | number | null
  total_visible_duration_ms: string | number | null
}

type EventCountRow = {
  event_type: BehaviorEventType
  count: string | number
}

type IdeSummaryRow = {
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

type VerdictCountRow = {
  result: string | null
  count: string | number
}

type SubmissionCountRow = {
  submission_count: string | number
  accepted_submission_count: string | number
}

type LevelActivityRow = {
  level_id: string
  level_title: string | null
  event_count: string | number
  run_count: string | number
  submit_count: string | number
  error_count: string | number
  repair_success_count: string | number
}

type RecentEventRow = {
  event_type: BehaviorEventType
  path: string | null
  level_id: string | null
  level_title: string | null
  result: string | null
  occurred_at: Date | string
}

type BehaviorAnalysisReportRow = {
  id: string
  student_user_id: string
  period_start: Date | string
  period_end: Date | string
  provider: BehaviorAnalysisProvider
  model: string
  status: BehaviorAnalysisStatus
  analysis: BehaviorAnalysisResult
  markdown: string
  generated_by: string | null
  error_message: string | null
  created_at: Date | string
}

export async function recordBehaviorEvents(input: {
  userId: string
  clientSessionId: string
  userAgent: string | null
  events: BehaviorEventInsert[]
  metadata?: Record<string, unknown>
}): Promise<{ inserted: number }> {
  if (input.events.length === 0) return { inserted: 0 }

  return withTransaction(async (client) => {
    const sessionResult = await client.query<SessionRow>(
      `
      INSERT INTO user_behavior_sessions (user_id, client_session_id, user_agent, metadata, last_seen_at)
      VALUES ($1, $2, $3, $4::jsonb, NOW())
      ON CONFLICT (user_id, client_session_id)
      DO UPDATE SET
        user_agent = COALESCE(EXCLUDED.user_agent, user_behavior_sessions.user_agent),
        metadata = user_behavior_sessions.metadata || EXCLUDED.metadata,
        last_seen_at = NOW()
      RETURNING id
      `,
      [input.userId, input.clientSessionId, input.userAgent, JSON.stringify(input.metadata ?? {})],
    )
    const sessionId = sessionResult.rows[0]?.id
    if (!sessionId) throw new Error('Behavior session was not created')

    const pageIds = new Map<string, string>()
    let inserted = 0

    for (const event of input.events) {
      const pageViewId = await resolvePageViewId({
        userId: input.userId,
        behaviorSessionId: sessionId,
        event,
        pageIds,
        client,
      })

      const eventResult = await client.query<{ id: string }>(
        `
        INSERT INTO user_behavior_events (
          user_id,
          behavior_session_id,
          page_view_id,
          client_event_id,
          client_page_view_id,
          event_type,
          occurred_at,
          level_id,
          submission_id,
          assessment_attempt_id,
          duration_ms,
          count,
          result,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::timestamptz,
          (SELECT id FROM levels WHERE id = $8),
          (SELECT id FROM submissions WHERE id = $9::uuid AND user_id = $1),
          (SELECT id FROM assessment_attempts WHERE id = $10::uuid AND user_id = $1),
          $11,
          $12,
          $13,
          $14::jsonb
        )
        ON CONFLICT (user_id, client_event_id) DO NOTHING
        RETURNING id
        `,
        [
          input.userId,
          sessionId,
          pageViewId,
          event.clientEventId,
          event.clientPageViewId,
          event.eventType,
          event.occurredAt,
          event.levelId,
          event.submissionId,
          event.assessmentAttemptId,
          event.durationMs,
          event.count,
          event.result,
          JSON.stringify(event.metadata),
        ],
      )
      if (eventResult.rows.length > 0) inserted += 1
    }

    return { inserted }
  })
}

export async function getBehaviorAnalysisInput(input: {
  studentUserId: string
  periodStart: string
  periodEnd: string
}): Promise<BehaviorAnalysisInput> {
  const [student, verdictRows, submissionRow] = await Promise.all([
    queryOne<StudentRow>(
      `
      SELECT
        u.id,
        u.username,
        COALESCE(p.display_name, u.display_name, u.username) AS display_name,
        COALESCE(ur.role, 'student') AS user_role
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE u.id = $1
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
    getSubmissionCounts(input),
  ])

  const behaviorRows = await getOptionalBehaviorRows(input)

  if (!student) throw new Error('Student not found')

  const eventCounts = Object.fromEntries(BEHAVIOR_EVENT_TYPES.map((eventType) => [eventType, 0])) as Record<BehaviorEventType, number>
  for (const row of behaviorRows.eventRows) {
    eventCounts[row.event_type] = toNumber(row.count)
  }

  const verdictCounts: Record<string, number> = {}
  for (const row of verdictRows) {
    verdictCounts[row.result ?? 'Other'] = toNumber(row.count)
  }

  return {
    student: {
      userId: student.id,
      username: student.username,
      displayName: student.display_name ?? student.username,
      userRole: student.user_role ?? 'student',
    },
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    pageViews: behaviorRows.pageRows.map((row) => ({
      path: row.path,
      viewCount: toNumber(row.view_count),
      totalDurationMs: toNumber(row.total_duration_ms),
      totalVisibleDurationMs: toNumber(row.total_visible_duration_ms),
    })),
    eventCounts,
    ide: {
      editBatchCount: toNumber(behaviorRows.ideRow?.edit_batch_count),
      changeCount: toNumber(behaviorRows.ideRow?.change_count),
      insertedChars: toNumber(behaviorRows.ideRow?.inserted_chars),
      deletedChars: toNumber(behaviorRows.ideRow?.deleted_chars),
      pasteCount: toNumber(behaviorRows.ideRow?.paste_count),
      runCount: toNumber(behaviorRows.ideRow?.run_count),
      submitCount: toNumber(behaviorRows.ideRow?.submit_count),
      errorCount: toNumber(behaviorRows.ideRow?.error_count),
      repairSuccessCount: toNumber(behaviorRows.ideRow?.repair_success_count),
      aiErrorAnalysisCount: toNumber(behaviorRows.ideRow?.ai_error_analysis_count),
      whiteboardCount: toNumber(behaviorRows.ideRow?.whiteboard_count),
      hintCount: toNumber(behaviorRows.ideRow?.hint_count),
      solutionVideoCount: toNumber(behaviorRows.ideRow?.solution_video_count),
    },
    verdictCounts,
    submissionCount: toNumber(submissionRow?.submission_count),
    acceptedSubmissionCount: toNumber(submissionRow?.accepted_submission_count),
    levelActivity: behaviorRows.levelRows.map((row) => ({
      levelId: row.level_id,
      levelTitle: row.level_title ?? row.level_id,
      eventCount: toNumber(row.event_count),
      runCount: toNumber(row.run_count),
      submitCount: toNumber(row.submit_count),
      errorCount: toNumber(row.error_count),
      repairSuccessCount: toNumber(row.repair_success_count),
    })),
    recentEvents: behaviorRows.recentRows.map((row) => ({
      eventType: row.event_type,
      path: row.path,
      levelId: row.level_id,
      levelTitle: row.level_title,
      result: row.result,
      occurredAt: toIsoString(row.occurred_at),
    })),
  }
}

export async function assertBehaviorAnalysisReportTableReady(): Promise<void> {
  await query('SELECT 1 FROM behavior_analysis_reports LIMIT 1')
}

async function getOptionalBehaviorRows(input: {
  studentUserId: string
  periodStart: string
  periodEnd: string
}): Promise<{
  pageRows: PageViewSummaryRow[]
  eventRows: EventCountRow[]
  ideRow: IdeSummaryRow | null
  levelRows: LevelActivityRow[]
  recentRows: RecentEventRow[]
}> {
  try {
    const [pageRows, eventRows, ideRow, levelRows, recentRows] = await Promise.all([
      query<PageViewSummaryRow>(
        `
        SELECT
          path,
          COUNT(*) AS view_count,
          COALESCE(SUM(duration_ms), 0) AS total_duration_ms,
          COALESCE(SUM(visible_duration_ms), 0) AS total_visible_duration_ms
        FROM user_page_views
        WHERE user_id = $1
          AND started_at >= $2::date
          AND started_at < ($3::date + INTERVAL '1 day')
        GROUP BY path
        ORDER BY total_visible_duration_ms DESC, view_count DESC
        LIMIT 12
        `,
        [input.studentUserId, input.periodStart, input.periodEnd],
      ),
      query<EventCountRow>(
        `
        SELECT event_type, COUNT(*) AS count
        FROM user_behavior_events
        WHERE user_id = $1
          AND occurred_at >= $2::date
          AND occurred_at < ($3::date + INTERVAL '1 day')
        GROUP BY event_type
        `,
        [input.studentUserId, input.periodStart, input.periodEnd],
      ),
      queryOne<IdeSummaryRow>(
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
      query<LevelActivityRow>(
        `
        SELECT
          e.level_id,
          COALESCE(l.title, e.level_id) AS level_title,
          COUNT(*) AS event_count,
          COUNT(*) FILTER (WHERE e.event_type = 'ide_run' AND e.metadata->>'phase' = 'finish') AS run_count,
          COUNT(*) FILTER (WHERE e.event_type = 'ide_submit' AND e.metadata->>'phase' = 'finish') AS submit_count,
          COUNT(*) FILTER (WHERE e.event_type = 'ide_error') AS error_count,
          COUNT(*) FILTER (WHERE e.event_type = 'repair_success') AS repair_success_count
        FROM user_behavior_events e
        LEFT JOIN levels l ON l.id = e.level_id
        WHERE e.user_id = $1
          AND e.level_id IS NOT NULL
          AND e.occurred_at >= $2::date
          AND e.occurred_at < ($3::date + INTERVAL '1 day')
        GROUP BY e.level_id, l.title
        ORDER BY event_count DESC
        LIMIT 10
        `,
        [input.studentUserId, input.periodStart, input.periodEnd],
      ),
      query<RecentEventRow>(
        `
        SELECT
          e.event_type,
          pv.path,
          e.level_id,
          l.title AS level_title,
          e.result,
          e.occurred_at
        FROM user_behavior_events e
        LEFT JOIN user_page_views pv ON pv.id = e.page_view_id
        LEFT JOIN levels l ON l.id = e.level_id
        WHERE e.user_id = $1
          AND e.occurred_at >= $2::date
          AND e.occurred_at < ($3::date + INTERVAL '1 day')
        ORDER BY e.occurred_at DESC
        LIMIT 40
        `,
        [input.studentUserId, input.periodStart, input.periodEnd],
      ),
    ])

    return { pageRows, eventRows, ideRow, levelRows, recentRows }
  } catch (error) {
    if (isUndefinedTableError(error)) {
      return {
        pageRows: [],
        eventRows: [],
        ideRow: null,
        levelRows: [],
        recentRows: [],
      }
    }
    throw error
  }
}

async function getSubmissionCounts(input: {
  studentUserId: string
  periodStart: string
  periodEnd: string
}): Promise<SubmissionCountRow | null> {
  return queryOne<SubmissionCountRow>(
    `
    SELECT
      COUNT(*) AS submission_count,
      COUNT(*) FILTER (WHERE verdict->>'result' = 'AC') AS accepted_submission_count
    FROM submissions
    WHERE user_id = $1
      AND created_at >= $2::date
      AND created_at < ($3::date + INTERVAL '1 day')
    `,
    [input.studentUserId, input.periodStart, input.periodEnd],
  )
}

export async function insertBehaviorAnalysisReport(input: {
  studentUserId: string
  periodStart: string
  periodEnd: string
  provider: BehaviorAnalysisProvider
  model: string
  status?: BehaviorAnalysisStatus
  analysis: BehaviorAnalysisResult
  markdown: string
  promptHash: string
  generatedBy?: string | null
  errorMessage?: string | null
}): Promise<BehaviorAnalysisReportSummary> {
  const row = await queryOne<BehaviorAnalysisReportRow>(
    `
    INSERT INTO behavior_analysis_reports (
      student_user_id,
      period_start,
      period_end,
      provider,
      model,
      status,
      analysis,
      markdown,
      prompt_hash,
      generated_by,
      error_message
    )
    VALUES ($1, $2::date, $3::date, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
    RETURNING id, student_user_id, period_start, period_end, provider, model, status, analysis, markdown, generated_by, error_message, created_at
    `,
    [
      input.studentUserId,
      input.periodStart,
      input.periodEnd,
      input.provider,
      input.model,
      input.status ?? 'generated',
      JSON.stringify(input.analysis),
      input.markdown,
      input.promptHash,
      input.generatedBy ?? null,
      input.errorMessage ?? null,
    ],
  )

  if (!row) throw new Error('Behavior analysis report was not created')
  return mapReportRow(row)
}

export async function listBehaviorAnalysisReportsForStudent(input: {
  studentUserId: string
  limit?: number
}): Promise<BehaviorAnalysisReportSummary[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 10, 50))
  const rows = await query<BehaviorAnalysisReportRow>(
    `
    SELECT id, student_user_id, period_start, period_end, provider, model, status, analysis, markdown, generated_by, error_message, created_at
    FROM behavior_analysis_reports
    WHERE student_user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [input.studentUserId, limit],
  )
  return rows.map(mapReportRow)
}

export async function deleteBehaviorAnalysisReportForStudent(input: {
  studentUserId: string
  reportId: string
}): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `
    DELETE FROM behavior_analysis_reports
    WHERE id = $1::uuid
      AND student_user_id = $2
    RETURNING id
    `,
    [input.reportId, input.studentUserId],
  )
  return rows.length > 0
}

export async function listBehaviorAnalysisReportsForAdmin(input: {
  studentUserId?: string | null
  userRole?: 'student' | 'teacher' | null
  periodStart?: string | null
  periodEnd?: string | null
  limit?: number
}): Promise<BehaviorAnalysisReportSummary[]> {
  const filters: string[] = []
  const values: unknown[] = []
  if (input.studentUserId) {
    values.push(input.studentUserId)
    filters.push(`bar.student_user_id = $${values.length}`)
  }
  if (input.userRole) {
    values.push(input.userRole)
    filters.push(`COALESCE(ur.role, 'student') = $${values.length}`)
  }
  if (input.periodStart) {
    values.push(input.periodStart)
    filters.push(`bar.period_end >= $${values.length}::date`)
  }
  if (input.periodEnd) {
    values.push(input.periodEnd)
    filters.push(`bar.period_start <= $${values.length}::date`)
  }
  const limit = Math.max(1, Math.min(input.limit ?? 100, 300))
  values.push(limit)

  const rows = await query<BehaviorAnalysisReportRow>(
    `
    SELECT bar.id, bar.student_user_id, bar.period_start, bar.period_end, bar.provider, bar.model, bar.status, bar.analysis, bar.markdown, bar.generated_by, bar.error_message, bar.created_at
    FROM behavior_analysis_reports bar
    LEFT JOIN user_roles ur ON ur.user_id = bar.student_user_id
    ${filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''}
    ORDER BY bar.created_at DESC
    LIMIT $${values.length}
    `,
    values,
  )
  return rows.map(mapReportRow)
}

async function resolvePageViewId(input: {
  userId: string
  behaviorSessionId: string
  event: BehaviorEventInsert
  pageIds: Map<string, string>
  client: PoolClient
}): Promise<string | null> {
  const clientPageViewId = input.event.clientPageViewId
  if (!clientPageViewId) return null
  const cached = input.pageIds.get(clientPageViewId)
  if (cached) return cached

  if (input.event.path && input.event.sanitizedUrl) {
    const result = await input.client.query<PageViewRow>(
      `
      INSERT INTO user_page_views (
        user_id,
        behavior_session_id,
        client_page_view_id,
        path,
        sanitized_url,
        title,
        duration_ms,
        visible_duration_ms,
        metadata,
        started_at,
        ended_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 0), COALESCE($8, 0), $9::jsonb, $10::timestamptz, CASE WHEN $11 THEN $10::timestamptz ELSE NULL END)
      ON CONFLICT (user_id, client_page_view_id)
      DO UPDATE SET
        behavior_session_id = COALESCE(user_page_views.behavior_session_id, EXCLUDED.behavior_session_id),
        path = EXCLUDED.path,
        sanitized_url = EXCLUDED.sanitized_url,
        title = COALESCE(EXCLUDED.title, user_page_views.title),
        duration_ms = GREATEST(user_page_views.duration_ms, EXCLUDED.duration_ms),
        visible_duration_ms = GREATEST(user_page_views.visible_duration_ms, EXCLUDED.visible_duration_ms),
        metadata = user_page_views.metadata || EXCLUDED.metadata,
        ended_at = COALESCE(EXCLUDED.ended_at, user_page_views.ended_at),
        updated_at = NOW()
      RETURNING id
      `,
      [
        input.userId,
        input.behaviorSessionId,
        clientPageViewId,
        input.event.path,
        input.event.sanitizedUrl,
        input.event.title,
        input.event.durationMs,
        readVisibleDurationMs(input.event.metadata),
        JSON.stringify(input.event.metadata),
        input.event.occurredAt,
        input.event.eventType === 'page_view_end',
      ],
    )
    const id = result.rows[0]?.id ?? null
    if (id) input.pageIds.set(clientPageViewId, id)
    return id
  }

  const result = await input.client.query<PageViewRow>(
    `
    SELECT id
    FROM user_page_views
    WHERE user_id = $1 AND client_page_view_id = $2
    LIMIT 1
    `,
    [input.userId, clientPageViewId],
  )
  const id = result.rows[0]?.id ?? null
  if (id) input.pageIds.set(clientPageViewId, id)
  return id
}

function readVisibleDurationMs(metadata: Record<string, unknown>): number {
  const value = metadata.visibleDurationMs
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function mapReportRow(row: BehaviorAnalysisReportRow): BehaviorAnalysisReportSummary {
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    periodStart: toDateOnly(row.period_start),
    periodEnd: toDateOnly(row.period_end),
    provider: row.provider,
    model: row.model,
    status: row.status,
    analysis: row.analysis,
    markdown: row.markdown,
    generatedBy: row.generated_by,
    errorMessage: row.error_message,
    createdAt: toIsoString(row.created_at),
  }
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toDateOnly(value: Date | string): string {
  return toIsoString(value).slice(0, 10)
}

export function isUndefinedTableError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42P01'
}
