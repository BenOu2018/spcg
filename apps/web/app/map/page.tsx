import { GameVillage } from '@/components/GameVillage'
import { requireUser } from '@/lib/auth-guard'
import { getAllLevels, getLessonStageMenu, getMapMainlineLevels, getProgressRecords } from '@/lib/level-data'
import { getLevelNavigationForUser } from '@/lib/services/level-access-service'

type MapPageProps = {
  searchParams?: Promise<{ chapter?: string }> | { chapter?: string }
}

export const dynamic = 'force-dynamic'

export default async function MapPage({ searchParams }: MapPageProps) {
  const params = searchParams ? await searchParams : {}
  const session = await requireUser(params.chapter ? `/map?chapter=${encodeURIComponent(params.chapter)}` : '/map')
  const [levels, testLevels, progressRecords, navigation] = await Promise.all([
    getMapMainlineLevels(),
    getAllLevels(),
    getProgressRecords(),
    getLevelNavigationForUser(session.user.id),
  ])
  const stageMenus = await Promise.all(levels.map((level) => getLessonStageMenu(level.id)))

  return (
    <GameVillage
      levels={levels}
      testLevels={testLevels}
      progress={progressRecords}
      activeChapterId={params.chapter}
      allowFreeJump={navigation.canFreeJump}
      currentLevelIdOverride={navigation.currentMapLevelId}
      stageMenus={stageMenus.filter((menu): menu is NonNullable<typeof menu> => Boolean(menu))}
    />
  )
}
