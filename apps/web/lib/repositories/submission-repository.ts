import type { JudgeProgress, Language, ResolvedLanguage, SubmissionErrorAnalysis, Verdict } from '@spcg/shared/types'
import { query, queryOne } from '@/lib/db'

export type SubmissionStatus = 'pending' | 'judging' | 'done' | 'error'

export type SubmissionSummary = {
  id: string
  status: SubmissionStatus
  verdict: Verdict | null
  judgeProgress: JudgeProgress | null
  language: Language
  resolvedLanguage: ResolvedLanguage | null
  assessmentAttemptId: string | null
  assessmentPhase: 'realtime' | 'final' | null
  judgeMode: 'fast' | 'full' | null
  score: number
  maxScore: number | null
}

export type SubmissionHistoryItem = {
  id: string
  status: SubmissionStatus
  verdict: Verdict | null
  code: string
  language: Language
  resolvedLanguage: ResolvedLanguage | null
  assessmentAttemptId: string | null
  assessmentPhase: 'realtime' | 'final' | null
  score: number
  maxScore: number | null
  errorAnalysis: SubmissionErrorAnalysis | null
  createdAt: string
  updatedAt: string
}

export type LevelSubmissionHistoryItem = Omit<SubmissionHistoryItem, 'code'> & {
  code: string | null
  canViewCode: boolean
  userId: string
  userEmail: string | null
  userDisplayName: string | null
}

export type AdminSubmissionHistoryItem = SubmissionHistoryItem & {
  userId: string
  userEmail: string | null
  userDisplayName: string | null
  levelId: string
  levelTitle: string
  chapterId: string
  levelOrder: number
}

export type UserRecentSubmissionItem = Omit<SubmissionHistoryItem, 'code' | 'errorAnalysis'> & {
  levelId: string
  levelTitle: string
  knowledgePoint: string
  chapterId: string
  levelOrder: number
  assessmentAttemptId: string | null
  assessmentPhase: 'realtime' | 'final' | null
  score: number
  maxScore: number | null
}

export type UserSubmissionDetailItem = UserRecentSubmissionItem & {
  code: string
  judgeProgress: JudgeProgress | null
  judgeMode: 'fast' | 'full' | null
  errorAnalysis: SubmissionErrorAnalysis | null
}

type SubmissionRow = {
  id: string
  status: SubmissionStatus
  verdict: Verdict | null
  judge_progress: JudgeProgress | null
  assessment_attempt_id: string | null
  assessment_phase: 'realtime' | 'final' | null
  judge_mode: 'fast' | 'full' | null
  score: number | null
  max_score: number | null
} & Record<string, unknown>

type SubmissionHistoryRow = {
  id: string
  status: SubmissionStatus
  verdict: Verdict | null
  code: string
  language: Language
  resolved_language: ResolvedLanguage | null
  assessment_attempt_id: string | null
  assessment_phase: 'realtime' | 'final' | null
  score: number | null
  max_score: number | null
  error_analysis: SubmissionErrorAnalysis | null
  created_at: Date | string
  updated_at: Date | string
}

type LevelSubmissionHistoryRow = Omit<SubmissionHistoryRow, 'code'> & {
  code: string | null
  can_view_code: boolean
  user_id: string
  user_email: string | null
  user_display_name: string | null
}

type AdminSubmissionHistoryRow = SubmissionHistoryRow & {
  user_id: string
  user_email: string | null
  user_display_name: string | null
  level_id: string
  level_title: string | null
  chapter_id: string | null
  level_order: number | null
}

type UserRecentSubmissionRow = Omit<SubmissionHistoryRow, 'code' | 'error_analysis'> & {
  level_id: string
  level_title: string | null
  knowledge_point: string | null
  chapter_id: string | null
  level_order: number | null
  assessment_attempt_id: string | null
  assessment_phase: 'realtime' | 'final' | null
  score: number | null
  max_score: number | null
}

type UserSubmissionDetailRow = UserRecentSubmissionRow & {
  code: string
  judge_progress: JudgeProgress | null
  judge_mode: 'fast' | 'full' | null
  error_analysis: SubmissionErrorAnalysis | null
}

export type JudgeQueueStats = {
  pendingCount: number
  judgingCount: number
  averagePendingWaitSeconds: number
  recentFailureRate: number
  recentDoneCount: number
  recentErrorCount: number
}

type QueueStatsRow = {
  pending_count: string | number
  judging_count: string | number
  average_pending_wait_seconds: string | number | null
  recent_done_count: string | number
  recent_error_count: string | number
}

export async function findRecentSubmissionForUser(userId: string, since: Date): Promise<{ createdAt: string } | null> {
  const row = await queryOne<{ created_at: Date | string }>(
    `
    SELECT created_at
    FROM submissions
    WHERE user_id = $1 AND created_at >= $2 AND assessment_attempt_id IS NULL
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId, since],
  )

  return row ? { createdAt: toIsoString(row.created_at) } : null
}

export async function createSubmission(input: {
  userId: string
  levelId: string
  code: string
  language?: Language
  resolvedLanguage?: ResolvedLanguage
  assessmentAttemptId?: string | null
  assessmentPhase?: 'realtime' | 'final' | null
  judgeMode?: 'fast' | 'full' | null
  maxScore?: number | null
}): Promise<SubmissionSummary> {
  const rows = await query<SubmissionRow>(
    `
    INSERT INTO submissions
      (user_id, level_id, code, language, resolved_language, status, assessment_attempt_id, assessment_phase, judge_mode, max_score)
    VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9)
    RETURNING id, status, verdict, judge_progress, language, resolved_language, assessment_attempt_id, assessment_phase, judge_mode, score, max_score
    `,
    [
      input.userId,
      input.levelId,
      input.code,
      input.language ?? 'auto',
      input.resolvedLanguage ?? null,
      input.assessmentAttemptId ?? null,
      input.assessmentPhase ?? null,
      input.judgeMode ?? null,
      input.maxScore ?? null,
    ],
  )

  const submission = rows[0]
  if (!submission) throw new Error('Submission was not created')
  return mapSubmissionSummary(submission)
}

export async function getSubmissionForUser(submissionId: string, userId: string): Promise<SubmissionSummary | null> {
  const row = await queryOne<SubmissionRow>(
    `
    SELECT id, status, verdict, judge_progress, language, resolved_language, assessment_attempt_id, assessment_phase, judge_mode, score, max_score
    FROM submissions
    WHERE id = $1 AND user_id = $2
    `,
    [submissionId, userId],
  )

  return row ? mapSubmissionSummary(row) : null
}

export async function listSubmissionHistoryForUser(input: {
  userId: string
  levelId: string
  limit?: number
  assessmentAttemptId?: string | null
}): Promise<SubmissionHistoryItem[]> {
  const filters = ['s.user_id = $1', 's.level_id = $2']
  const values: unknown[] = [input.userId, input.levelId]
  if (input.assessmentAttemptId) {
    values.push(input.assessmentAttemptId)
    filters.push(`s.assessment_attempt_id = $${values.length}`)
  } else {
    filters.push('s.assessment_attempt_id IS NULL')
  }
  values.push(input.limit ?? 20)

  const rows = await query<SubmissionHistoryRow>(
    `
    SELECT
      s.id,
      s.status,
      s.verdict,
      s.code,
      s.language,
      s.resolved_language,
      s.assessment_attempt_id,
      s.assessment_phase,
      s.score,
      s.max_score,
      latest_analysis.error_analysis,
      s.created_at,
      s.updated_at
    FROM submissions s
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'id', sea.id,
        'submissionId', sea.submission_id,
        'provider', sea.provider,
        'model', sea.model,
        'verdictResult', sea.verdict_result,
        'analysis', sea.analysis,
        'rawError', sea.raw_error,
        'promptHash', sea.prompt_hash,
        'createdAt', sea.created_at
      ) AS error_analysis
      FROM submission_error_analyses sea
      WHERE sea.submission_id = s.id AND s.user_id = $1
      ORDER BY sea.created_at DESC
      LIMIT 1
    ) latest_analysis ON TRUE
    WHERE ${filters.join(' AND ')}
    ORDER BY s.created_at DESC
    LIMIT $${values.length}
    `,
    values,
  )

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    verdict: row.verdict,
    code: row.code,
    language: row.language,
    resolvedLanguage: row.resolved_language,
    assessmentAttemptId: row.assessment_attempt_id ?? null,
    assessmentPhase: row.assessment_phase ?? null,
    score: row.score ?? 0,
    maxScore: row.max_score ?? null,
    errorAnalysis: row.error_analysis ? normalizeSubmissionErrorAnalysis(row.error_analysis) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }))
}

export async function listSubmissionHistoryForLevelViewer(input: {
  viewerUserId: string
  levelId: string
  limit?: number
  assessmentAttemptId?: string | null
}): Promise<LevelSubmissionHistoryItem[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200))
  const filters = ['s.level_id = $2']
  const values: unknown[] = [input.viewerUserId, input.levelId]
  if (input.assessmentAttemptId) {
    values.push(input.assessmentAttemptId)
    filters.push(`s.assessment_attempt_id = $${values.length}`)
  } else {
    filters.push('s.assessment_attempt_id IS NULL')
  }
  values.push(limit)

  const rows = await query<LevelSubmissionHistoryRow>(
    `
    SELECT
      s.id,
      s.status,
      s.verdict,
      CASE WHEN s.user_id = $1 THEN s.code ELSE NULL END AS code,
      s.user_id = $1 AS can_view_code,
      s.language,
      s.resolved_language,
      s.assessment_attempt_id,
      s.assessment_phase,
      s.score,
      s.max_score,
      s.user_id,
      u.email AS user_email,
      COALESCE(p.display_name, u.display_name, u.username) AS user_display_name,
      latest_analysis.error_analysis,
      s.created_at,
      s.updated_at
    FROM submissions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'id', sea.id,
        'submissionId', sea.submission_id,
        'provider', sea.provider,
        'model', sea.model,
        'verdictResult', sea.verdict_result,
        'analysis', sea.analysis,
        'rawError', sea.raw_error,
        'promptHash', sea.prompt_hash,
        'createdAt', sea.created_at
      ) AS error_analysis
      FROM submission_error_analyses sea
      WHERE sea.submission_id = s.id AND s.user_id = $1
      ORDER BY sea.created_at DESC
      LIMIT 1
    ) latest_analysis ON TRUE
    WHERE ${filters.join(' AND ')}
    ORDER BY s.created_at DESC
    LIMIT $${values.length}
    `,
    values,
  )

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    verdict: row.verdict,
    code: row.code,
    canViewCode: row.can_view_code,
    language: row.language,
    resolvedLanguage: row.resolved_language,
    assessmentAttemptId: row.assessment_attempt_id ?? null,
    assessmentPhase: row.assessment_phase ?? null,
    score: row.score ?? 0,
    maxScore: row.max_score ?? null,
    errorAnalysis: row.error_analysis ? normalizeSubmissionErrorAnalysis(row.error_analysis) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    userId: row.user_id,
    userEmail: row.user_email,
    userDisplayName: row.user_display_name,
  }))
}

export async function listAdminSubmissionHistory(input: {
  userId?: string
  levelId?: string
  limit?: number
}): Promise<AdminSubmissionHistoryItem[]> {
  const values: unknown[] = []
  const filters: string[] = []

  if (input.userId) {
    values.push(input.userId)
    filters.push(`s.user_id = $${values.length}`)
  }

  if (input.levelId) {
    values.push(input.levelId)
    filters.push(`s.level_id = $${values.length}`)
  }

  const limit = Math.max(1, Math.min(input.limit ?? 50, 200))
  values.push(limit)

  const rows = await query<AdminSubmissionHistoryRow>(
    `
    SELECT
      s.id,
      s.status,
      s.verdict,
      s.code,
      s.language,
      s.resolved_language,
      s.assessment_attempt_id,
      s.assessment_phase,
      s.score,
      s.max_score,
      s.user_id,
      u.email AS user_email,
      COALESCE(p.display_name, u.display_name, u.username) AS user_display_name,
      s.level_id,
      l.title AS level_title,
      l.chapter_id,
      l."order" AS level_order,
      latest_analysis.error_analysis,
      s.created_at,
      s.updated_at
    FROM submissions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN levels l ON l.id = s.level_id
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'id', sea.id,
        'submissionId', sea.submission_id,
        'provider', sea.provider,
        'model', sea.model,
        'verdictResult', sea.verdict_result,
        'analysis', sea.analysis,
        'rawError', sea.raw_error,
        'promptHash', sea.prompt_hash,
        'createdAt', sea.created_at
      ) AS error_analysis
      FROM submission_error_analyses sea
      WHERE sea.submission_id = s.id
      ORDER BY sea.created_at DESC
      LIMIT 1
    ) latest_analysis ON TRUE
    ${filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''}
    ORDER BY s.created_at DESC
    LIMIT $${values.length}
    `,
    values,
  )

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    verdict: row.verdict,
    code: row.code,
    language: row.language,
    resolvedLanguage: row.resolved_language,
    assessmentAttemptId: row.assessment_attempt_id ?? null,
    assessmentPhase: row.assessment_phase ?? null,
    score: row.score ?? 0,
    maxScore: row.max_score ?? null,
    errorAnalysis: row.error_analysis ? normalizeSubmissionErrorAnalysis(row.error_analysis) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    userId: row.user_id,
    userEmail: row.user_email,
    userDisplayName: row.user_display_name,
    levelId: row.level_id,
    levelTitle: row.level_title ?? row.level_id,
    chapterId: row.chapter_id ?? '',
    levelOrder: row.level_order ?? 0,
  }))
}

export async function listRecentSubmissionsForUser(input: { userId: string; limit?: number }): Promise<UserRecentSubmissionItem[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 200, 500))
  const rows = await query<UserRecentSubmissionRow>(
    `
    SELECT
      s.id,
      s.status,
      s.verdict,
      s.language,
      s.resolved_language,
      s.level_id,
      l.title AS level_title,
      l.knowledge_point,
      l.chapter_id,
      l."order" AS level_order,
      s.assessment_attempt_id,
      s.assessment_phase,
      s.score,
      s.max_score,
      s.created_at,
      s.updated_at
    FROM submissions s
    LEFT JOIN levels l ON l.id = s.level_id
    WHERE s.user_id = $1
    ORDER BY s.created_at DESC
    LIMIT $2
    `,
    [input.userId, limit],
  )

  return rows.map(mapUserRecentSubmission)
}

export async function getSubmissionDetailForUser(input: {
  userId: string
  submissionId: string
}): Promise<UserSubmissionDetailItem | null> {
  const row = await queryOne<UserSubmissionDetailRow>(
    `
    SELECT
      s.id,
      s.status,
      s.verdict,
      s.judge_progress,
      s.code,
      s.language,
      s.resolved_language,
      s.level_id,
      l.title AS level_title,
      l.knowledge_point,
      l.chapter_id,
      l."order" AS level_order,
      s.assessment_attempt_id,
      s.assessment_phase,
      s.judge_mode,
      s.score,
      s.max_score,
      latest_analysis.error_analysis,
      s.created_at,
      s.updated_at
    FROM submissions s
    LEFT JOIN levels l ON l.id = s.level_id
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'id', sea.id,
        'submissionId', sea.submission_id,
        'provider', sea.provider,
        'model', sea.model,
        'verdictResult', sea.verdict_result,
        'analysis', sea.analysis,
        'rawError', sea.raw_error,
        'promptHash', sea.prompt_hash,
        'createdAt', sea.created_at
      ) AS error_analysis
      FROM submission_error_analyses sea
      WHERE sea.submission_id = s.id
      ORDER BY sea.created_at DESC
      LIMIT 1
    ) latest_analysis ON TRUE
    WHERE s.id = $1 AND s.user_id = $2
    `,
    [input.submissionId, input.userId],
  )

  if (!row) return null
  return {
    ...mapUserRecentSubmission(row),
    code: row.code,
    judgeProgress: row.judge_progress ? normalizeJudgeProgress(row.judge_progress) : null,
    judgeMode: row.judge_mode ?? null,
    errorAnalysis: row.error_analysis ? normalizeSubmissionErrorAnalysis(row.error_analysis) : null,
  }
}

function normalizeSubmissionErrorAnalysis(value: SubmissionErrorAnalysis): SubmissionErrorAnalysis {
  return {
    ...value,
    createdAt: toIsoString(value.createdAt),
  }
}

function mapSubmissionSummary(row: SubmissionRow): SubmissionSummary {
  return {
    id: row.id,
    status: row.status,
    verdict: row.verdict,
    judgeProgress: row.judge_progress ? normalizeJudgeProgress(row.judge_progress) : null,
    language: row.language as Language,
    resolvedLanguage: (row.resolved_language as ResolvedLanguage | null | undefined) ?? null,
    assessmentAttemptId: row.assessment_attempt_id ?? null,
    assessmentPhase: row.assessment_phase ?? null,
    judgeMode: row.judge_mode ?? null,
    score: row.score ?? 0,
    maxScore: row.max_score ?? null,
  }
}

function mapUserRecentSubmission(row: UserRecentSubmissionRow): UserRecentSubmissionItem {
  return {
    id: row.id,
    status: row.status,
    verdict: row.verdict,
    language: row.language,
    resolvedLanguage: row.resolved_language,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    levelId: row.level_id,
    levelTitle: row.level_title ?? row.level_id,
    knowledgePoint: row.knowledge_point ?? '',
    chapterId: row.chapter_id ?? '',
    levelOrder: row.level_order ?? 0,
    assessmentAttemptId: row.assessment_attempt_id ?? null,
    assessmentPhase: row.assessment_phase ?? null,
    score: row.score ?? 0,
    maxScore: row.max_score ?? null,
  }
}

function normalizeJudgeProgress(value: JudgeProgress): JudgeProgress {
  return {
    phase: value.phase,
    currentCaseIndex: typeof value.currentCaseIndex === 'number' ? value.currentCaseIndex : null,
    runningCaseRange: value.runningCaseRange
      ? {
          from: Number(value.runningCaseRange.from),
          to: Number(value.runningCaseRange.to),
        }
      : null,
    completedCases: Number(value.completedCases) || 0,
    totalCases: Number(value.totalCases) || 0,
    updatedAt: toIsoString(value.updatedAt),
  }
}

export async function getJudgeQueueStats(): Promise<JudgeQueueStats> {
  const row = await queryOne<QueueStatsRow>(
    `
    WITH queue AS (
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE status = 'judging') AS judging_count,
        AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) FILTER (WHERE status = 'pending') AS average_pending_wait_seconds
      FROM submissions
      WHERE status IN ('pending', 'judging')
    ),
    recent AS (
      SELECT
        COUNT(*) FILTER (WHERE status = 'done') AS recent_done_count,
        COUNT(*) FILTER (WHERE status = 'error') AS recent_error_count
      FROM submissions
      WHERE updated_at >= NOW() - INTERVAL '15 minutes'
        AND status IN ('done', 'error')
    )
    SELECT *
    FROM queue CROSS JOIN recent
    `,
  )

  const pendingCount = toNumber(row?.pending_count)
  const judgingCount = toNumber(row?.judging_count)
  const recentDoneCount = toNumber(row?.recent_done_count)
  const recentErrorCount = toNumber(row?.recent_error_count)
  const recentTotal = recentDoneCount + recentErrorCount

  return {
    pendingCount,
    judgingCount,
    averagePendingWaitSeconds: Math.round(toNumber(row?.average_pending_wait_seconds)),
    recentFailureRate: recentTotal === 0 ? 0 : recentErrorCount / recentTotal,
    recentDoneCount,
    recentErrorCount,
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
