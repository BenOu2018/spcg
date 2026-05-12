import { GameVillage } from '@/components/GameVillage'
import { requireUser } from '@/lib/auth-guard'
import { getLessonStageMenu, getMapMainlineLevels, getProgressRecords } from '@/lib/level-data'
import { getLevelNavigationForUser } from '@/lib/services/level-access-service'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await requireUser('/')
  const [levels, progressRecords, navigation] = await Promise.all([
    getMapMainlineLevels(),
    getProgressRecords(),
    getLevelNavigationForUser(session.user.id),
  ])
  const messages = getStudentUiMessages(await getRequestUiLocale(session.user.id))
  const stageMenus = await Promise.all(levels.map((level) => getLessonStageMenu(level.id)))

  return (
    <GameVillage
      session={session}
      levels={levels}
      progress={progressRecords}
      allowFreeJump={navigation.canFreeJump}
      currentLevelIdOverride={navigation.currentMapLevelId}
      stageMenus={stageMenus.filter((menu): menu is NonNullable<typeof menu> => Boolean(menu))}
      messages={messages}
    />
  )
}
