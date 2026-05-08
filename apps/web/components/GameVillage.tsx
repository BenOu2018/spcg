import Link from 'next/link'
import type { Level, Progress } from '@spcg/shared/types'
import { getGameChapter, listGameChapters } from '@spcg/shared/game-chapters'
import { isRankedAssessmentEnabledLevel } from '@spcg/shared/ranked-assessment'
import { GameMapMenus } from '@/components/GameMapMenus'
import { LevelMap } from '@/components/LevelMap'

type StageProgressMenu = {
  items: Array<{ levelId: string }>
}

type GameVillageProps = {
  levels: Level[]
  testLevels: Level[]
  progress: Progress[]
  activeChapterId?: string | null
  allowFreeJump?: boolean
  currentLevelIdOverride?: string | null
  stageMenus?: StageProgressMenu[]
}

export function GameVillage({
  levels,
  testLevels,
  progress,
  activeChapterId,
  allowFreeJump = false,
  currentLevelIdOverride = null,
  stageMenus = [],
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
  const activeTestLevels = testLevels
    .filter((level) => level.difficulty.spcgLevel === chapter.spcgLevel)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-Hans-CN') || a.id.localeCompare(b.id))
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
  const currentLevel = activeOverrideLevel ?? activeLevels.find((level) => !activeCompletedIds.has(level.id)) ?? activeLevels[0]
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
          currentLevelId={currentLevel?.id}
          levels={activeLevels}
          testLevels={activeTestLevels}
        />
        <div className="village-actions">
          <Link className="hud-icon" href="/me" aria-label="进度">
            <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-star.svg" alt="" />
          </Link>
          <Link className="hud-icon" href="/auth/sign-in" aria-label="账号">
            <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-settings.svg" alt="" />
          </Link>
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
        unlockedLevelIds={unlockedMapLevelIds}
      />

      {currentLevel ? (
        <Link className="current-level-cta" href={`/level/${currentLevel.id}`}>
          <span>第{currentLevel.order}层</span>
          <strong>{currentLevel.title}</strong>
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
