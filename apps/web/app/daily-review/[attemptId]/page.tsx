import { notFound } from 'next/navigation'
import { DailyReviewLevel } from '@/app/daily-review/DailyReviewLevel'
import { requireUser } from '@/lib/auth-guard'
import { getDailyReviewDetail } from '@/lib/services/daily-review-service'
import { getFeatureAccess } from '@/lib/services/entitlement-service'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'
import { ServiceError } from '@/lib/services/errors'

type DailyReviewAttemptPageProps = {
  params: Promise<{ attemptId: string }> | { attemptId: string }
}

export const dynamic = 'force-dynamic'

export default async function DailyReviewAttemptPage({ params }: DailyReviewAttemptPageProps) {
  const { attemptId } = await params
  const session = await requireUser(`/daily-review/${attemptId}`)
  const [messages, hintsAccess, detail] = await Promise.all([
    getStudentUiMessages(await getRequestUiLocale(session.user.id)),
    getFeatureAccess({ userId: session.user.id, feature: 'hints' }),
    getDailyReviewDetail({
      userId: session.user.id,
      attemptId,
    }).catch((error) => {
      if (error instanceof ServiceError && error.code === 'not_found') return null
      throw error
    }),
  ])

  if (!detail) notFound()

  return (
    <DailyReviewLevel
      detail={detail}
      userId={session.user.id}
      canViewHints={hintsAccess.allowed}
      hintsUpgradeMessage={hintsAccess.reason ?? undefined}
      messages={messages}
    />
  )
}
