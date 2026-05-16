'use client'

import { useEffect, useMemo, useState } from 'react'
import { getGameChapter, listGameChapters } from '@spcg/shared/game-chapters'
import { isRankedAssessmentEnabledLevel } from '@spcg/shared/ranked-assessment'
import { GameMapMenus, type ChapterMenuItem } from '@/components/GameMapMenus'
import { LevelMap } from '@/components/LevelMap'
import { TopbarAccountActions } from '@/components/TopbarAccountActions'
import { type MapSnapshot, readMapSnapshot } from '@/lib/map-snapshot-cache'
import { getStudentUiMessages } from '@/lib/student-ui'

type MapLoadingFallbackProps = {
  userId?: string | null
}

export function MapLoadingFallback({ userId = undefined }: MapLoadingFallbackProps) {
  const [snapshot, setSnapshot] = useState<MapSnapshot | null>(null)
  const [requestedChapterId, setRequestedChapterId] = useState<string | null>(null)

  useEffect(() => {
    setSnapshot(readMapSnapshot(userId))
    setRequestedChapterId(new URLSearchParams(window.location.search).get('chapter'))
  }, [userId])

  const mapState = useMemo(() => (snapshot ? buildSnapshotMapState(snapshot, requestedChapterId) : null), [snapshot, requestedChapterId])

  if (!snapshot || !mapState) {
    return (
      <main className="village-scene map-loading-scene">
        <section className="map-loading-panel" aria-live="polite">
          <span>地图加载中...</span>
          <strong>正在同步最新进度</strong>
        </section>
      </main>
    )
  }

  const messages = getStudentUiMessages('zh-CN')

  return (
    <main className="village-scene map-loading-scene" aria-busy="true">
      <header className="village-hud map-loading-hud">
        <img className="village-logo" src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
        <GameMapMenus
          chapterMenuItems={mapState.chapterMenuItems}
          currentChapter={mapState.chapter}
          currentLevelId={mapState.activeOverrideLevelId ?? undefined}
          levels={mapState.activeLevels}
          messages={messages}
          trailingContent={
            <section className="map-loading-panel compact inline" aria-label="正在同步最新进度" aria-live="polite">
              <strong>同步中</strong>
            </section>
          }
        />
        <div className="village-actions">
          <TopbarAccountActions session={null} messages={messages} uiLocale="zh-CN" canShowPricingMenu={false} />
        </div>
      </header>
      <LevelMap
        levels={mapState.activeLevels}
        progress={snapshot.progressRecords}
        stageMenus={snapshot.stageMenus}
        fullscreen
        showExamNode={isRankedAssessmentEnabledLevel(mapState.chapter.spcgLevel)}
        examSpcgLevel={mapState.chapter.spcgLevel}
        freeJump={snapshot.navigation.canFreeJump}
        currentLevelIdOverride={mapState.activeOverrideLevelId}
        strictCurrentLevel={mapState.hasFixedStudentCurrent}
        unlockedLevelIds={mapState.unlockedMapLevelIds}
        messages={messages}
      />
    </main>
  )
}

function buildSnapshotMapState(snapshot: MapSnapshot, requestedChapterId: string | null) {
  const availableChapters = listGameChapters().filter((chapter) =>
    snapshot.levels.some((level) => level.chapterId === chapter.chapterId),
  )
  if (availableChapters.length === 0) return null

  const passedIds = new Set(snapshot.progressRecords.filter((item) => item.passed).map((item) => item.levelId))
  const overrideLevel = snapshot.navigation.currentMapLevelId
    ? snapshot.levels.find((level) => level.id === snapshot.navigation.currentMapLevelId)
    : undefined
  const orderedGlobalLevels = snapshot.levels.slice().sort(compareLevelPosition)
  const firstUnpassedLevel = overrideLevel ?? orderedGlobalLevels.find((level) => !passedIds.has(level.id)) ?? orderedGlobalLevels[0]
  const requestedChapter = requestedChapterId ?? snapshot.activeChapterId
  const chapter =
    availableChapters.find((item) => item.chapterId === requestedChapter) ??
    availableChapters.find((item) => item.chapterId === firstUnpassedLevel?.chapterId) ??
    availableChapters[0]!
  const activeLevels = snapshot.levels
    .filter((level) => level.chapterId === chapter.chapterId)
    .sort((a, b) => a.order - b.order)
  const activeOverrideLevel = snapshot.navigation.currentMapLevelId
    ? activeLevels.find((level) => level.id === snapshot.navigation.currentMapLevelId)
    : undefined
  const hasFixedStudentCurrent = Boolean(snapshot.navigation.currentMapLevelId && !snapshot.navigation.canFreeJump)
  const globalCurrentIndex = firstUnpassedLevel
    ? orderedGlobalLevels.findIndex((level) => level.id === firstUnpassedLevel.id)
    : -1
  const unlockedMapLevelIds =
    globalCurrentIndex >= 0 ? orderedGlobalLevels.slice(0, globalCurrentIndex + 1).map((level) => level.id) : []

  return {
    chapter,
    chapterMenuItems: buildChapterMenuItems(availableChapters),
    activeLevels,
    activeOverrideLevelId: activeOverrideLevel?.id ?? null,
    hasFixedStudentCurrent,
    unlockedMapLevelIds,
  }
}

function buildChapterMenuItems(chapters: ReturnType<typeof listGameChapters>): ChapterMenuItem[] {
  return chapters
    .slice()
    .sort((a, b) => a.spcgLevel - b.spcgLevel || a.order - b.order || a.chapterId.localeCompare(b.chapterId))
    .map((chapter) => ({ type: 'chapter', chapter }))
}

function compareLevelPosition(a: MapSnapshot['levels'][number], b: MapSnapshot['levels'][number]): number {
  return (
    Number(a.difficulty.spcgLevel ?? 0) - Number(b.difficulty.spcgLevel ?? 0) ||
    a.order - b.order ||
    a.chapterId.localeCompare(b.chapterId) ||
    a.id.localeCompare(b.id)
  )
}
