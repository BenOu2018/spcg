import { ExamLevel } from '@/components/ExamLevel'
import { requireUser } from '@/lib/auth-guard'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'
import { getFeatureAccess } from '@/lib/services/entitlement-service'

export default async function SpcgLevelTwoExamPage() {
  const session = await requireUser('/exam/spcg-level-2')
  const messages = getStudentUiMessages(await getRequestUiLocale(session.user.id))
  const hintsAccess = await getFeatureAccess({ userId: session.user.id, feature: 'hints' })

  return (
    <ExamLevel
      userId={session.user.id}
      userDisplayName={session.user.name ?? session.user.username ?? null}
      spcgLevel={2}
      canViewHints={hintsAccess.allowed}
      hintsUpgradeMessage={hintsAccess.reason ?? undefined}
      messages={messages}
    />
  )
}
