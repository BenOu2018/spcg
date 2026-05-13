import Link from 'next/link'
import type { Level, Progress, UiLocale } from '@spcg/shared/types'
import { getGameChapter, listGameChapters } from '@spcg/shared/game-chapters'
import { isRankedAssessmentEnabledLevel } from '@spcg/shared/ranked-assessment'
import type { Session } from 'next-auth'
import { GameMapMenus } from '@/components/GameMapMenus'
import { LevelMap } from '@/components/LevelMap'
import { TopbarAccountActions } from '@/components/TopbarAccountActions'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'
import type { TodayNewsArticleCard } from '@/lib/services/today-news-service'

type StageProgressMenu = {
  items: Array<{ levelId: string }>
}

type GameVillageProps = {
  session: Session
  levels: Level[]
  progress: Progress[]
  activeChapterId?: string | null
  allowFreeJump?: boolean
  currentLevelIdOverride?: string | null
  stageMenus?: StageProgressMenu[]
  showTodayNews?: boolean
  todayNewsArticles?: TodayNewsArticleCard[]
  uiLocale?: UiLocale
  messages?: StudentUiMessages
}

const fallbackMessages = getStudentUiMessages('zh-CN')

export function GameVillage({
  session,
  levels,
  progress,
  activeChapterId,
  allowFreeJump = false,
  currentLevelIdOverride = null,
  stageMenus = [],
  showTodayNews = false,
  todayNewsArticles = [],
  uiLocale = 'zh-CN',
  messages = fallbackMessages,
}: GameVillageProps) {
  const availableChapters = listGameChapters().filter((chapter) =>
    levels.some((level) => level.chapterId === chapter.chapterId),
  )
  const passedIds = new Set(progress.filter((item) => item.passed).map((item) => item.levelId))
  const overrideLevel = currentLevelIdOverride ? levels.find((level) => level.id === currentLevelIdOverride) : undefined
  const orderedGlobalLevels = levels.slice().sort(compareLevelPosition)
  const firstUnpassedLevel = overrideLevel ?? orderedGlobalLevels.find((level) => !passedIds.has(level.id)) ?? orderedGlobalLevels[0]
  const requestedChapter = activeChapterId ? getGameChapter(activeChapterId) : null
  const chapter =
    availableChapters.find((item) => item.chapterId === requestedChapter?.chapterId) ??
    availableChapters.find((item) => item.chapterId === firstUnpassedLevel?.chapterId) ??
    getGameChapter(firstUnpassedLevel?.chapterId ?? levels[0]?.chapterId)
  const activeLevels = levels
    .filter((level) => level.chapterId === chapter.chapterId)
    .sort((a, b) => a.order - b.order)
  const activeLevelIds = new Set(activeLevels.map((level) => level.id))
  const activeProgress = progress.filter((item) => activeLevelIds.has(item.levelId))
  const activePassedIds = new Set(activeProgress.filter((item) => item.passed).map((item) => item.levelId))
  const allPassedIds = new Set(progress.filter((item) => item.passed).map((item) => item.levelId))
  const stageMainlinePassedIds = new Set(
    stageMenus
      .filter((menu) => {
        const displayItems = menu.items.slice(0, 5)
        const requiredPassCount = Math.max(1, Math.min(3, displayItems.length))
        return displayItems.filter((item) => allPassedIds.has(item.levelId)).length >= requiredPassCount
      })
      .flatMap((menu) => menu.items.map((item) => item.levelId)),
  )
  const activeCompletedIds = new Set([...activePassedIds, ...stageMainlinePassedIds])
  const activeOverrideLevel = currentLevelIdOverride
    ? activeLevels.find((level) => level.id === currentLevelIdOverride)
    : undefined
  const hasFixedStudentCurrent = Boolean(currentLevelIdOverride && !allowFreeJump)
  const activeCurrentLevel =
    activeOverrideLevel ??
    (hasFixedStudentCurrent ? undefined : activeLevels.find((level) => !activeCompletedIds.has(level.id)) ?? activeLevels[0])
  const ctaLevel = activeCurrentLevel ?? firstUnpassedLevel
  const globalCurrentIndex = firstUnpassedLevel
    ? orderedGlobalLevels.findIndex((level) => level.id === firstUnpassedLevel.id)
    : -1
  const unlockedMapLevelIds =
    globalCurrentIndex >= 0 ? orderedGlobalLevels.slice(0, globalCurrentIndex + 1).map((level) => level.id) : []

  return (
    <main className="village-scene">
      <header className="village-hud">
        <img className="village-logo" src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
        <GameMapMenus
          chapters={availableChapters}
          currentChapter={chapter}
          currentLevelId={activeCurrentLevel?.id}
          levels={activeLevels}
          messages={messages}
        />
        <div className="village-actions">
          <TopbarAccountActions
            session={session}
            messages={messages}
            showTodayNews={showTodayNews}
            todayNewsArticles={todayNewsArticles}
            uiLocale={uiLocale}
          />
        </div>
      </header>

      <LevelMap
        levels={activeLevels}
        progress={progress}
        stageMenus={stageMenus}
        fullscreen
        showExamNode={isRankedAssessmentEnabledLevel(chapter.spcgLevel)}
        examSpcgLevel={chapter.spcgLevel}
        freeJump={allowFreeJump}
        currentLevelIdOverride={activeOverrideLevel?.id ?? null}
        strictCurrentLevel={hasFixedStudentCurrent}
        unlockedLevelIds={unlockedMapLevelIds}
        messages={messages}
      />

      {ctaLevel ? (
        <Link className="current-level-cta" href={`/daily-review?levelId=${encodeURIComponent(ctaLevel.id)}`} prefetch={false}>
          <span>
            {messages.map.dailyTask}
          </span>
          <strong>
            {messages.map.dailyTaskContinuePrefix}
            {ctaLevel.order}
            {messages.map.dailyTaskContinueSuffix}
          </strong>
        </Link>
      ) : null}
    </main>
  )
}

function compareLevelPosition(a: Level, b: Level): number {
  return (
    Number(a.difficulty.spcgLevel ?? 0) - Number(b.difficulty.spcgLevel ?? 0) ||
    a.order - b.order ||
    a.chapterId.localeCompare(b.chapterId) ||
    a.id.localeCompare(b.id)
  )
}
