import Link from 'next/link'
import type { Level, Progress } from '@spcg/shared/types'
import { getGameChapter, listGameChapters } from '@spcg/shared/game-chapters'
import { GameMapMenus } from '@/components/GameMapMenus'
import { LevelMap } from '@/components/LevelMap'

type GameVillageProps = {
  levels: Level[]
  progress: Progress[]
  activeChapterId?: string | null
}

export function GameVillage({ levels, progress, activeChapterId }: GameVillageProps) {
  const availableChapters = listGameChapters().filter((chapter) =>
    levels.some((level) => level.chapterId === chapter.chapterId),
  )
  const passedIds = new Set(progress.filter((item) => item.passed).map((item) => item.levelId))
  const firstUnpassedLevel = levels.find((level) => !passedIds.has(level.id)) ?? levels[0]
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
  const currentLevel = activeLevels.find((level) => !activePassedIds.has(level.id)) ?? activeLevels[0]

  return (
    <main className="village-scene">
      <header className="village-hud">
        <img className="village-logo" src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
        <GameMapMenus
          chapters={availableChapters}
          currentChapter={chapter}
          currentLevelId={currentLevel?.id}
          levels={activeLevels}
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
        progress={activeProgress}
        fullscreen
        showExamNode={chapter.chapterId === 'ch1-mist-town'}
        freeJump
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
