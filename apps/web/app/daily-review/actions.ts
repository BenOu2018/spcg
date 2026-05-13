'use server'

import { auth } from '@/auth'
import {
  completeDailyReviewAttempt,
  getDailyReviewDetail,
  startDailyReview,
} from '@/lib/services/daily-review-service'

export async function startDailyReviewAction(currentLevelId?: string | null) {
  const session = await auth()
  return startDailyReview({
    userId: session?.user?.id,
    currentLevelId,
  })
}

export async function completeDailyReviewAction(attemptId: string) {
  const session = await auth()
  return completeDailyReviewAttempt({
    userId: session?.user?.id,
    attemptId,
  })
}

export async function getDailyReviewAttemptAction(attemptId: string) {
  const session = await auth()
  return getDailyReviewDetail({
    userId: session?.user?.id,
    attemptId,
  })
}
