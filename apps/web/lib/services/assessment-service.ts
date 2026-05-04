import type { AssessmentAttempt } from '@spcg/shared/types'
import { countAcceptedLevelsSince, createAssessmentAttempt, finishAssessmentAttempt, getAssessmentAttemptForUser, getAssessmentSession } from '@/lib/repositories/assessment-repository'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import { grantAssessmentReward } from '@/lib/services/reward-service'
import { ServiceError } from '@/lib/services/errors'

export async function startAssessmentAttempt(input: {
  userId?: string | null
  sessionId: string
  totalCount: number
}): Promise<AssessmentAttempt> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)

  const session = await getAssessmentSession(input.sessionId)
  if (!session || session.status !== 'published') {
    throw new ServiceError('not_found', 'Assessment session not found.', 404)
  }

  return createAssessmentAttempt({
    userId: input.userId,
    sessionId: session.id,
    totalCount: input.totalCount,
  })
}

export async function finishUserAssessmentAttempt(input: {
  userId?: string | null
  attemptId: string
  totalCount: number
  expired?: boolean
}): Promise<AssessmentAttempt> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)

  const attempt = await getAssessmentAttemptForUser({
    userId: input.userId,
    attemptId: input.attemptId,
  })
  if (!attempt) throw new ServiceError('not_found', 'Assessment attempt not found.', 404)

  if (attempt.status !== 'in_progress') return attempt

  const session = await getAssessmentSession(attempt.sessionId)
  if (!session) throw new ServiceError('not_found', 'Assessment session not found.', 404)

  const acceptedCount = await countAcceptedLevelsSince({
    userId: input.userId,
    since: attempt.startedAt,
  })
  const totalCount = Math.max(1, input.totalCount || attempt.totalCount)
  const score = Math.round((Math.min(acceptedCount, totalCount) / totalCount) * 100)
  const ratio = Math.min(1, acceptedCount / totalCount)
  const reward = await grantAssessmentReward({
    userId: input.userId,
    attemptId: attempt.id,
    coinReward: Math.round(session.coinReward * ratio),
    garlicReward: acceptedCount > 0 ? Math.max(1, Math.round(session.garlicReward * ratio)) : 0,
    acceptedCount,
    totalCount,
  })

  return finishAssessmentAttempt({
    userId: input.userId,
    attemptId: input.attemptId,
    status: input.expired ? 'expired' : 'completed',
    score,
    acceptedCount,
    totalCount,
    reward,
  })
}
