import type { JudgeProgress, Language, ResolvedLanguage, RewardGrantResult, Verdict } from '@spcg/shared/types'
import { normalizeLanguageMode, resolveLanguageMode } from '@spcg/shared/language-config'
import {
  createSubmission,
  getJudgeQueueStats,
  getSubmissionDetailForUser,
  getSubmissionForUser,
  listAdminSubmissionHistory,
  listRecentSubmissionsForUser,
  listSubmissionHistoryForLevelViewer,
  listSubmissionHistoryForUser,
  type AdminSubmissionHistoryItem,
  type JudgeQueueStats,
  type LevelSubmissionHistoryItem,
  type SubmissionHistoryItem,
  type SubmissionStatus,
  type UserRecentSubmissionItem,
  type UserSubmissionDetailItem,
} from '@/lib/repositories/submission-repository'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import { recordAssessmentRealtimeSubmission } from '@/lib/repositories/assessment-repository'
import { getRewardSummaryForSubmission } from '@/lib/services/reward-service'
import { getLevelAccessForUser } from '@/lib/services/level-access-service'
import { canUserRunAssessmentLevel } from '@/lib/services/assessment-service'
import { ServiceError } from '@/lib/services/errors'
import { RATE_LIMIT_ACTIONS, consumeUserRateLimit } from '@/lib/services/rate-limit-service'

export type { SubmissionHistoryItem } from '@/lib/repositories/submission-repository'
export type { LevelSubmissionHistoryItem } from '@/lib/repositories/submission-repository'
export type { AdminSubmissionHistoryItem } from '@/lib/repositories/submission-repository'
export type { UserRecentSubmissionItem } from '@/lib/repositories/submission-repository'
export type { UserSubmissionDetailItem } from '@/lib/repositories/submission-repository'

export type CreateSubmissionServiceResult =
  | {
      ok: true
      submissionId: string
      status: SubmissionStatus
      language: Language
      resolvedLanguage: ResolvedLanguage
      assessmentAttemptId: string | null
    }
  | {
      ok: false
      code: 'empty' | 'db_unconfigured' | 'unauthorized' | 'forbidden' | 'rate_limited'
      reason: string
      retryAfterSeconds?: number
    }

export type SubmissionPollResult = {
  status: SubmissionStatus | 'missing'
  verdict: Verdict | null
  judgeProgress?: JudgeProgress | null
  language?: Language
  resolvedLanguage?: ResolvedLanguage | null
  reward?: RewardGrantResult | null
  score?: number
  maxScore?: number | null
  error?: string
}

export type SubmissionHistoryResult = {
  items: SubmissionHistoryItem[]
  error?: string
}

export type LevelSubmissionHistoryResult = {
  items: LevelSubmissionHistoryItem[]
  error?: string
}

export type UserRecentSubmissionsResult = {
  items: UserRecentSubmissionItem[]
  error?: string
}

const DEFAULT_SUBMISSION_RATE_LIMIT_SECONDS = 60
const DEFAULT_SUBMISSION_RATE_LIMIT_MAX_HITS = 5

export async function createUserSubmission(input: {
  userId?: string | null
  levelId: string
  code: string
  language?: Language
  rateLimitSeconds?: number
  assessmentAttemptId?: string | null
  assessmentPhase?: 'realtime' | 'final' | null
  judgeMode?: 'fast' | 'full' | null
  maxScore?: number | null
}): Promise<CreateSubmissionServiceResult> {
  if (!input.levelId || !input.code.trim()) {
    return { ok: false, code: 'empty', reason: '提交内容为空，无法远程判题。' }
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, code: 'db_unconfigured', reason: '数据库未配置，无法远程判题。' }
  }

  if (!input.userId) {
    return { ok: false, code: 'unauthorized', reason: '当前未登录，无法远程判题。' }
  }

  if (input.assessmentAttemptId) {
    const allowed = await canUserRunAssessmentLevel({
      userId: input.userId,
      attemptId: input.assessmentAttemptId,
      levelId: input.levelId,
    })
    if (!allowed) {
      return { ok: false, code: 'forbidden', reason: '当前用户类型无法提交这道考试题。' }
    }
  } else {
    const access = await getLevelAccessForUser({
      userId: input.userId,
      levelId: input.levelId,
    })
    if (!access.allowed) {
      return {
        ok: false,
        code: 'forbidden',
        reason: access.reason ?? '当前关卡尚未解锁，无法提交。',
      }
    }
  }

  const rateLimitSeconds = input.rateLimitSeconds ?? getSubmissionRateLimitSeconds()
  if (rateLimitSeconds > 0) {
    const rateLimit = await consumeUserRateLimit({
      userId: input.userId,
      actionKey: RATE_LIMIT_ACTIONS.ideSubmit,
      windowSeconds: rateLimitSeconds,
      maxHits: DEFAULT_SUBMISSION_RATE_LIMIT_MAX_HITS,
    })
    if (!rateLimit.allowed) {
      return {
        ok: false,
        code: 'rate_limited',
        reason: rateLimit.message,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      }
    }
  }

  const language = normalizeLanguageMode(input.language)
  const resolvedLanguage = resolveLanguageMode(language, input.code)
  const submission = await createSubmission({
    userId: input.userId,
    levelId: input.levelId,
    code: input.code,
    language,
    resolvedLanguage,
    assessmentAttemptId: input.assessmentAttemptId ?? null,
    assessmentPhase: input.assessmentPhase ?? null,
    judgeMode: input.judgeMode ?? null,
    maxScore: input.maxScore ?? null,
  })

  if (input.assessmentAttemptId && input.assessmentPhase === 'realtime') {
    await recordAssessmentRealtimeSubmission({
      userId: input.userId,
      attemptId: input.assessmentAttemptId,
      levelId: input.levelId,
      submissionId: submission.id,
    })
  }

  return {
    ok: true,
    submissionId: submission.id,
    status: submission.status,
    language,
    resolvedLanguage,
    assessmentAttemptId: submission.assessmentAttemptId,
  }
}

export async function getUserSubmissionVerdict(input: {
  userId?: string | null
  submissionId: string
}): Promise<SubmissionPollResult> {
  if (!isDatabaseConfigured()) {
    return { status: 'missing', verdict: null, error: '数据库未配置。' }
  }

  if (!input.userId) {
    return { status: 'missing', verdict: null, error: '当前未登录。' }
  }

  const row = await getSubmissionForUser(input.submissionId, input.userId)
  if (!row) {
    return { status: 'missing', verdict: null, error: '提交记录不存在。' }
  }

  return {
    status: row.status,
    verdict: row.verdict,
    judgeProgress: row.judgeProgress,
    language: row.language,
    resolvedLanguage: row.resolvedLanguage,
    score: row.score,
    maxScore: row.maxScore,
    reward:
      row.status === 'done'
        ? await getRewardSummaryForSubmission({
            userId: input.userId,
            submissionId: input.submissionId,
          })
        : null,
  }
}

export async function getUserSubmissionHistory(input: {
  userId?: string | null
  levelId: string
  assessmentAttemptId?: string | null
}): Promise<SubmissionHistoryResult> {
  if (!input.levelId) {
    return { items: [], error: '题目不存在。' }
  }

  if (!isDatabaseConfigured()) {
    return { items: [], error: '数据库未配置。' }
  }

  if (!input.userId) {
    return { items: [], error: '当前未登录。' }
  }

  return {
    items: await listSubmissionHistoryForUser({
      userId: input.userId,
      levelId: input.levelId,
      limit: 20,
      assessmentAttemptId: input.assessmentAttemptId ?? null,
    }),
  }
}

export async function getLevelSubmissionHistoryForViewer(input: {
  userId?: string | null
  levelId: string
  assessmentAttemptId?: string | null
}): Promise<LevelSubmissionHistoryResult> {
  if (!input.levelId) {
    return { items: [], error: '题目不存在。' }
  }

  if (!isDatabaseConfigured()) {
    return { items: [], error: '数据库未配置。' }
  }

  if (!input.userId) {
    return { items: [], error: '当前未登录。' }
  }

  return {
    items: await listSubmissionHistoryForLevelViewer({
      viewerUserId: input.userId,
      levelId: input.levelId,
      limit: 50,
      assessmentAttemptId: input.assessmentAttemptId ?? null,
    }),
  }
}

export async function getUserRecentSubmissions(input: {
  userId?: string | null
  limit?: number
}): Promise<UserRecentSubmissionsResult> {
  if (!isDatabaseConfigured()) {
    return { items: [], error: '数据库未配置。' }
  }

  if (!input.userId) {
    return { items: [], error: '当前未登录。' }
  }

  return {
    items: await listRecentSubmissionsForUser({
      userId: input.userId,
      limit: input.limit ?? 200,
    }),
  }
}

export async function requireUserSubmissionVerdict(input: {
  userId?: string | null
  submissionId: string
}): Promise<SubmissionPollResult> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  const result = await getUserSubmissionVerdict(input)
  if (result.status === 'missing') {
    throw new ServiceError('not_found', result.error ?? '提交记录不存在。', 404)
  }
  return result
}

export async function requireUserSubmissionHistory(input: {
  userId?: string | null
  levelId: string
  assessmentAttemptId?: string | null
}): Promise<SubmissionHistoryResult> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!input.levelId) throw new ServiceError('bad_request', 'levelId is required.', 400)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  return getUserSubmissionHistory(input)
}

export async function requireUserRecentSubmissions(input: {
  userId?: string | null
  limit?: number
}): Promise<UserRecentSubmissionsResult> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  return getUserRecentSubmissions(input)
}

export async function requireUserSubmissionDetail(input: {
  userId?: string | null
  submissionId: string
}): Promise<UserSubmissionDetailItem> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!input.submissionId) throw new ServiceError('bad_request', 'submissionId is required.', 400)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  const item = await getSubmissionDetailForUser({
    userId: input.userId,
    submissionId: input.submissionId,
  })
  if (!item) throw new ServiceError('not_found', '提交记录不存在。', 404)
  return item
}

export async function getAdminSubmissionHistory(input: {
  userId?: string
  levelId?: string
  limit?: number
}): Promise<AdminSubmissionHistoryItem[]> {
  if (!isDatabaseConfigured()) return []

  return listAdminSubmissionHistory({
    userId: input.userId,
    levelId: input.levelId,
    limit: input.limit ?? 50,
  })
}

export async function getJudgeQueueHealth(): Promise<JudgeQueueStats> {
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  return getJudgeQueueStats()
}

function getSubmissionRateLimitSeconds(): number {
  const value = Number(process.env.SUBMISSION_RATE_LIMIT_SECONDS ?? DEFAULT_SUBMISSION_RATE_LIMIT_SECONDS)
  return Number.isFinite(value) ? Math.max(0, value) : DEFAULT_SUBMISSION_RATE_LIMIT_SECONDS
}
