import { GameVillage } from '@/components/GameVillage'
import { requireUser } from '@/lib/auth-guard'
import { getMapLearningDataForUser } from '@/lib/level-data'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await requireUser('/')
  const [learningData, uiLocale] = await Promise.all([
    getMapLearningDataForUser(session.user.id),
    getRequestUiLocale(session.user.id),
  ])
  const messages = getStudentUiMessages(uiLocale)

  return (
    <GameVillage
      session={session}
      levels={learningData.levels}
      progress={learningData.progressRecords}
      allowFreeJump={learningData.navigation.canFreeJump}
      currentLevelIdOverride={learningData.navigation.currentMapLevelId}
      stageMenus={learningData.stageMenus.filter((menu): menu is NonNullable<typeof menu> => Boolean(menu))}
      messages={messages}
    />
  )
}
