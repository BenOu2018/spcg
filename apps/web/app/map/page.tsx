import { GameVillage } from '@/components/GameVillage'
import { requireUser } from '@/lib/auth-guard'
import { getMapLearningDataForUser } from '@/lib/level-data'
import { getCanShowPricingMenu } from '@/lib/services/account-menu-service'
import { listPublishedTodayNewsArticles } from '@/lib/services/today-news-service'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

type MapPageProps = {
  searchParams?: Promise<{ chapter?: string }> | { chapter?: string }
}

export const dynamic = 'force-dynamic'

export default async function MapPage({ searchParams }: MapPageProps) {
  const params = searchParams ? await searchParams : {}
  const session = await requireUser(params.chapter ? `/map?chapter=${encodeURIComponent(params.chapter)}` : '/map')
  const [learningData, todayNewsArticles, uiLocale, canShowPricingMenu] = await Promise.all([
    getMapLearningDataForUser(session.user.id),
    listPublishedTodayNewsArticles({
      userId: session.user.id,
      limit: 6,
    }),
    getRequestUiLocale(session.user.id),
    getCanShowPricingMenu(session.user.id),
  ])
  const messages = getStudentUiMessages(uiLocale)

  return (
    <GameVillage
      session={session}
      levels={learningData.levels}
      progress={learningData.progressRecords}
      activeChapterId={params.chapter}
      userRole={learningData.navigation.role}
      allowFreeJump={learningData.navigation.canFreeJump}
      currentLevelIdOverride={learningData.navigation.currentMapLevelId}
      stageMenus={learningData.stageMenus.filter((menu): menu is NonNullable<typeof menu> => Boolean(menu))}
      showTodayNews
      todayNewsArticles={todayNewsArticles}
      uiLocale={uiLocale}
      messages={messages}
      canShowPricingMenu={canShowPricingMenu}
    />
  )
}
