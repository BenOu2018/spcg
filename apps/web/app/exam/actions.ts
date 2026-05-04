'use server'

import { auth } from '@/auth'
import { finishUserAssessmentAttempt, startAssessmentAttempt } from '@/lib/services/assessment-service'

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
