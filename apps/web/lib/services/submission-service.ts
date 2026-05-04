import type { Language, ResolvedLanguage, RewardGrantResult, Verdict } from '@spcg/shared/types'
import { normalizeLanguageMode, resolveLanguageMode } from '@spcg/shared/language-config'
import {
  createSubmission,
  findRecentSubmissionForUser,
  getJudgeQueueStats,
  getSubmissionForUser,
  listAdminSubmissionHistory,
  listSubmissionHistoryForUser,
  type AdminSubmissionHistoryItem,
  type JudgeQueueStats,
  type SubmissionHistoryItem,
  type SubmissionStatus,
} from '@/lib/repositories/submission-repository'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import { getRewardSummaryForSubmission } from '@/lib/services/reward-service'
import { ServiceError } from '@/lib/services/errors'

export type { SubmissionHistoryItem } from '@/lib/repositories/submission-repository'
export type { AdminSubmissionHistoryItem } from '@/lib/repositories/submission-repository'

export type CreateSubmissionServiceResult =
  | {
      ok: true
      submissionId: string
      status: SubmissionStatus
      language: Language
      resolvedLanguage: ResolvedLanguage
    }
  | {
      ok: false
      code: 'empty' | 'db_unconfigured' | 'unauthorized' | 'rate_limited'
      reason: string
      retryAfterSeconds?: number
    }

export type SubmissionPollResult = {
  status: SubmissionStatus | 'missing'
  verdict: Verdict | null
  language?: Language
  resolvedLanguage?: ResolvedLanguage | null
  reward?: RewardGrantResult | null
  error?: string
}

export type SubmissionHistoryResult = {
  items: SubmissionHistoryItem[]
  error?: string
}

const DEFAULT_SUBMISSION_RATE_LIMIT_SECONDS = 3

export async function createUserSubmission(input: {
  userId?: string | null
  levelId: string
  code: string
  language?: Language
  rateLimitSeconds?: number
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

  const rateLimitSeconds = input.rateLimitSeconds ?? getSubmissionRateLimitSeconds()
  if (rateLimitSeconds > 0) {
    const since = new Date(Date.now() - rateLimitSeconds * 1000)
    const recentSubmission = await findRecentSubmissionForUser(input.userId, since)
    if (recentSubmission) {
      const elapsedSeconds = Math.max(0, (Date.now() - new Date(recentSubmission.createdAt).getTime()) / 1000)
      const retryAfterSeconds = Math.max(1, Math.ceil(rateLimitSeconds - elapsedSeconds))
      return {
        ok: false,
        code: 'rate_limited',
        reason: `提交太频繁了，请 ${retryAfterSeconds} 秒后再试。`,
        retryAfterSeconds,
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
  })

  return {
    ok: true,
    submissionId: submission.id,
    status: submission.status,
    language,
    resolvedLanguage,
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
    language: row.language,
    resolvedLanguage: row.resolvedLanguage,
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
}): Promise<SubmissionHistoryResult> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!input.levelId) throw new ServiceError('bad_request', 'levelId is required.', 400)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  return getUserSubmissionHistory(input)
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
