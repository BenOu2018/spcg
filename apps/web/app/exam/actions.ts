'use server'

import { auth } from '@/auth'
import {
  finishRankedAssessmentAttempt,
  finishUserAssessmentAttempt,
  getCurrentRankedAssessmentAttempt,
  getRankedAssessmentDetail,
  listRankedAssessmentHistoryForUser,
  startAssessmentAttempt,
  startRankedAssessmentAttempt,
} from '@/lib/services/assessment-service'
import { wakeJudgeWorker } from '@/lib/judge-worker-autostart'

export async function startExamAttemptAction(input: { sessionId: string; totalCount: number }) {
  const session = await auth()
  return startAssessmentAttempt({
    userId: session?.user?.id,
    sessionId: input.sessionId,
    totalCount: input.totalCount,
  })
}

export async function finishExamAttemptAction(input: { attemptId: string; totalCount: number; expired?: boolean }) {
  const session = await auth()
  return finishUserAssessmentAttempt({
    userId: session?.user?.id,
    attemptId: input.attemptId,
    totalCount: input.totalCount,
    expired: input.expired,
  })
}

export async function startRankedExamAttemptAction(input: { spcgLevel?: number; durationSeconds: number }) {
  const session = await auth()
  return startRankedAssessmentAttempt({
    userId: session?.user?.id,
    spcgLevel: input.spcgLevel ?? 1,
    durationSeconds: input.durationSeconds,
  })
}

export async function finishRankedExamAttemptAction(input: { attemptId: string; expired?: boolean }) {
  const session = await auth()
  const attempt = await finishRankedAssessmentAttempt({
    userId: session?.user?.id,
    attemptId: input.attemptId,
    expired: input.expired,
  })
  wakeJudgeWorker({ drain: true })
  return attempt
}

export async function getRankedExamAttemptAction(input: { attemptId: string }) {
  const session = await auth()
  const detail = await getRankedAssessmentDetail({
    userId: session?.user?.id,
    attemptId: input.attemptId,
  })
  if (detail.attempt.status === 'scoring') wakeJudgeWorker({ drain: true })
  return detail
}

export async function getCurrentRankedExamAttemptAction(input: { spcgLevel?: number } = {}) {
  const session = await auth()
  const detail = await getCurrentRankedAssessmentAttempt({
    userId: session?.user?.id,
    spcgLevel: input.spcgLevel ?? 1,
  })
  if (detail?.attempt.status === 'scoring') wakeJudgeWorker({ drain: true })
  return detail
}

export async function listRankedExamHistoryAction(input: { limit?: number; spcgLevel?: number | null } = {}) {
  const session = await auth()
  return listRankedAssessmentHistoryForUser({
    userId: session?.user?.id,
    limit: input.limit ?? 20,
    spcgLevel: input.spcgLevel ?? null,
  })
}
