import Link from 'next/link'
import type { Level, Progress, TodayNewsArticleCard, UiLocale, UserRole } from '@spcg/shared/types'
import { getGameChapter, listGameChapters, type GameChapter } from '@spcg/shared/game-chapters'
import { isRankedAssessmentEnabledLevel } from '@spcg/shared/ranked-assessment'
import type { Session } from 'next-auth'
import { GameMapMenus, type ChapterMenuItem } from '@/components/GameMapMenus'
import { LevelMap } from '@/components/LevelMap'
import { TopbarAccountActions } from '@/components/TopbarAccountActions'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'

type StageProgressMenu = {
  items: Array<{ levelId: string }>
}

type GameVillageProps = {
  session: Session
  levels: Level[]
  progress: Progress[]
  activeChapterId?: string | null
  userRole?: UserRole
  allowFreeJump?: boolean
  currentLevelIdOverride?: string | null
  stageMenus?: StageProgressMenu[]
  showTodayNews?: boolean
  todayNewsArticles?: TodayNewsArticleCard[]
  uiLocale?: UiLocale
  messages?: StudentUiMessages
  canShowPricingMenu?: boolean
}

const fallbackMessages = getStudentUiMessages('zh-CN')

export function GameVillage({
  session,
  levels,
  progress,
  activeChapterId,
  userRole = 'student',
  allowFreeJump = false,
  currentLevelIdOverride = null,
  stageMenus = [],
  showTodayNews = false,
  todayNewsArticles = [],
  uiLocale = 'zh-CN',
  messages = fallbackMessages,
  canShowPricingMenu = false,
}: GameVillageProps) {
  const availableChapters = listGameChapters().filter((chapter) =>
    levels.some((level) => level.chapterId === chapter.chapterId),
  )
  const passedIds = new Set(progress.filter((item) => item.passed).map((item) => item.levelId))
  const overrideLevel = currentLevelIdOverride ? levels.find((level) => level.id === currentLevelIdOverride) : undefined
  const orderedGlobalLevels = levels.slice().sort(compareLevelPosition)
  const firstUnpassedLevel = overrideLevel ?? orderedGlobalLevels.find((level) => !passedIds.has(level.id)) ?? orderedGlobalLevels[0]
  const studentCurrentChapterId = overrideLevel?.chapterId ?? firstUnpassedLevel?.chapterId ?? null
  const chapterMenuItems = buildChapterMenuItems({
    chapters: availableChapters,
    currentChapterId: studentCurrentChapterId,
    userRole,
    allowFreeJump,
  })
  const selectableChapterIds = new Set(
    chapterMenuItems.flatMap((item) => (item.type === 'chapter' ? [item.chapter.chapterId] : [])),
  )
  const requestedChapter = activeChapterId ? getGameChapter(activeChapterId) : null
  const chapter =
    availableChapters.find(
      (item) => item.chapterId === requestedChapter?.chapterId && selectableChapterIds.has(item.chapterId),
    ) ??
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
          chapterMenuItems={chapterMenuItems}
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
            canShowPricingMenu={canShowPricingMenu}
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
        <Link className="current-level-cta" href={`/daily-review?levelId=${encodeURIComponent(ctaLevel.id)}`}>
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

function buildChapterMenuItems(input: {
  chapters: GameChapter[]
  currentChapterId: string | null
  userRole: UserRole
  allowFreeJump: boolean
}): ChapterMenuItem[] {
  const orderedChapters = input.chapters.slice().sort(compareChapterPosition)
  const showAllChapters = input.allowFreeJump || input.userRole === 'admin' || input.userRole === 'teacher'
  if (showAllChapters) {
    return orderedChapters.map((chapter) => ({ type: 'chapter', chapter }))
  }

  const currentIndex = input.currentChapterId
    ? orderedChapters.findIndex((chapter) => chapter.chapterId === input.currentChapterId)
    : -1
  const startIndex = Math.max(0, currentIndex)
  const visibleChapters = orderedChapters.slice(startIndex, startIndex + 2)
  const hasPendingChapters = orderedChapters.length > startIndex + visibleChapters.length
  const items: ChapterMenuItem[] = visibleChapters.map((chapter) => ({ type: 'chapter', chapter }))

  if (hasPendingChapters) {
    items.push({
      type: 'placeholder',
      id: 'pending-chapters',
      label: '...',
      title: '级别待激活',
      description: '完成当前级别后开放',
    })
  }

  return items
}

function compareChapterPosition(a: GameChapter, b: GameChapter): number {
  return a.spcgLevel - b.spcgLevel || a.order - b.order || a.chapterId.localeCompare(b.chapterId)
}

function compareLevelPosition(a: Level, b: Level): number {
  return (
    Number(a.difficulty.spcgLevel ?? 0) - Number(b.difficulty.spcgLevel ?? 0) ||
    a.order - b.order ||
    a.chapterId.localeCompare(b.chapterId) ||
    a.id.localeCompare(b.id)
  )
}
