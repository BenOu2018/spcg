import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { Level, Progress } from '@spcg/shared/types'
import { getGameChapter, type GameMapNodePosition } from '@spcg/shared/game-chapters'
import { buildRankedAssessmentRoute, buildRankedAssessmentTitle } from '@spcg/shared/ranked-assessment'

type LevelMapProps = {
  levels: Level[]
  progress: Progress[]
  stageMenus?: StageProgressMenu[]
  large?: boolean
  fullscreen?: boolean
  showExamNode?: boolean
  examSpcgLevel?: number
  freeJump?: boolean
  currentLevelIdOverride?: string | null
  unlockedLevelIds?: string[]
}

const EXAM_NODE_POSITION = {
  x: 0.08,
  y: 0.24,
}

type MapPoint = {
  id: string
  x: number
  y: number
}

type StageProgressMenu = {
  items: Array<{ levelId: string }>
}

type StageProgressState = {
  passed: number
  total: number
  label: string
}

export function LevelMap({
  levels,
  progress,
  stageMenus = [],
  large = false,
  fullscreen = false,
  showExamNode = false,
  examSpcgLevel = 1,
  freeJump = false,
  currentLevelIdOverride = null,
  unlockedLevelIds = [],
}: LevelMapProps) {
  const orderedLevels = [...levels].sort((a, b) => a.order - b.order)
  const chapter = getGameChapter(orderedLevels[0]?.chapterId)
  const nodePositions = buildRoutePositions(orderedLevels, chapter.nodePositions, chapter.chapterId)
  const routeSegments = buildRouteSegments(nodePositions, chapter.routeSegments)
  const passedIds = new Set(progress.filter((item) => item.passed).map((item) => item.levelId))
  const stageProgressByLevelId = buildStageProgressByLevelId(stageMenus, passedIds)
  const unlockedIds = new Set(unlockedLevelIds)
  const stageMainlinePassedIds = new Set(
    [...stageProgressByLevelId.entries()]
      .filter(([, value]) => value.passed >= getRequiredStagePassCount(value.total))
      .map(([levelId]) => levelId),
  )
  const completedMapIds = new Set([...passedIds, ...stageMainlinePassedIds])
  const firstOpen = orderedLevels.find((level) => !completedMapIds.has(level.id))?.order ?? 1
  const current =
    (currentLevelIdOverride ? orderedLevels.find((level) => level.id === currentLevelIdOverride) : undefined) ??
    orderedLevels.find((level) => level.order === firstOpen) ??
    orderedLevels[0]

  return (
    <div
      className={fullscreen ? 'map-stage fullscreen' : large ? 'map-stage large' : 'map-stage'}
      data-chapter={chapter.chapterId}
    >
      <img className="map-background" src={chapter.mapAsset} alt="" />
      <div className="map-overlay" />
      <svg className="map-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <g className="map-route-underlay">
          {routeSegments.map((segment, index) => (
            <polyline key={index} points={segment.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')} />
          ))}
        </g>
        <g className="map-route-line">
          {routeSegments.map((segment, index) => (
            <polyline key={index} points={segment.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')} />
          ))}
        </g>
      </svg>
      {orderedLevels.map((level) => {
        const position = nodePositions.find((node) => node.id === level.id)
        if (!position) return null

        const state = getLevelState(level, current?.order ?? 1, completedMapIds, freeJump, unlockedIds)
        const stageProgress = stageProgressByLevelId.get(level.id) ?? buildDefaultStageProgress(level.id, passedIds)
        const asset = getNodeAsset(state, level.order === orderedLevels.length)
        const style = {
          '--node-x': `${position.x * 100}%`,
          '--node-y': `${position.y * 100}%`,
        } as CSSProperties

        return (
          <Link
            aria-label={`${level.title} · ${level.knowledgePoint} · ${state}`}
            className={`level-node ${state}`}
            href={`/level/${level.id}`}
            key={level.id}
            style={style}
          >
            <img src={`/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/${asset}`} alt="" />
            <span>{String(level.order).padStart(2, '0')}</span>
            <div className="level-node-stars" aria-label={`题目完成度 ${stageProgress.label}`}>
              {Array.from({ length: stageProgress.total }, (_, index) => (
                <i aria-hidden="true" className={index < stageProgress.passed ? 'lit' : undefined} key={index}>
                  ★
                </i>
              ))}
            </div>
            <div className="level-node-tooltip" aria-hidden="true">
              <span className="level-node-tooltip-title">{level.title}</span>
              <span className="level-node-tooltip-algorithm">
                {level.knowledgePoint}
                {stageProgress ? ` · ${stageProgress.label}` : ''}
              </span>
            </div>
          </Link>
        )
      })}
      {showExamNode ? (
        <Link
          aria-label={buildRankedAssessmentTitle(examSpcgLevel)}
          className="level-node exam"
          href={buildRankedAssessmentRoute(examSpcgLevel)}
          style={
            {
              '--node-x': `${EXAM_NODE_POSITION.x * 100}%`,
              '--node-y': `${EXAM_NODE_POSITION.y * 100}%`,
            } as CSSProperties
          }
        >
          <img src="/assets/art/backgrounds/ch1-mist-town/exam-ui-kit/icon-shield-check.svg" alt="" />
          <span>EX</span>
          <strong>{buildRankedAssessmentTitle(examSpcgLevel)}</strong>
        </Link>
      ) : null}
      {current ? (
        <img
          className="map-mascot"
          src="/assets/art/characters/dog-tiger-protagonist/cute.svg"
          alt=""
          style={mascotStyle(current.id, nodePositions)}
        />
      ) : null}
    </div>
  )
}

function buildRoutePositions(
  levels: Level[],
  configuredPositions: GameMapNodePosition[] = [],
  chapterId?: string,
): MapPoint[] {
  if (levels.length === 0) return []
  const configuredById = new Map(configuredPositions.map((position) => [position.id, position]))
  const fallbackPositions = buildGeneratedRoutePositions(levels)
  const chapterPrefix = chapterId?.match(/^ch\d+/)?.[0]

  return levels.map((level, index) => {
    const stagePositionId = chapterPrefix ? `${chapterPrefix}-${String(level.order).padStart(2, '0')}` : null
    const configured = configuredById.get(level.id) ?? (stagePositionId ? configuredById.get(stagePositionId) : undefined)
    if (configured) return { ...configured, id: level.id }
    return fallbackPositions[index] ?? { id: level.id, x: 0.12, y: 0.78 }
  })
}

function buildGeneratedRoutePositions(levels: Level[]): MapPoint[] {
  if (levels.length === 1) return [{ id: levels[0]!.id, x: 0.12, y: 0.78 }]

  return levels.map((level, index) => {
    const progress = index / (levels.length - 1)
    const x = 0.1 + progress * 0.78
    const y = 0.76 - progress * 0.5 + Math.sin(progress * Math.PI * 3) * 0.13

    return {
      id: level.id,
      x: clamp(x, 0.09, 0.9),
      y: clamp(y, 0.16, 0.84),
    }
  })
}

function buildRouteSegments(nodePositions: MapPoint[], configuredSegments?: string[][]): MapPoint[][] {
  if (!configuredSegments || configuredSegments.length === 0) return [nodePositions]

  const nodeById = new Map(nodePositions.map((position) => [position.id, position]))
  const segments = configuredSegments
    .map((segment) => segment.map((id) => nodeById.get(id)).filter((point): point is MapPoint => Boolean(point)))
    .filter((segment) => segment.length > 1)

  return segments.length > 0 ? segments : [nodePositions]
}

function getLevelState(
  level: Level,
  currentOrder: number,
  passedIds: Set<string>,
  freeJump: boolean,
  unlockedIds: Set<string>,
) {
  if (passedIds.has(level.id)) return 'completed'
  if (level.order === currentOrder) return 'current'
  if (freeJump) return 'unlocked'
  if (unlockedIds.has(level.id)) return 'unlocked'
  if (level.order < currentOrder + 2) return 'unlocked'
  return 'locked'
}

function getNodeAsset(state: string, destination: boolean) {
  if (destination && state !== 'current' && state !== 'completed') return 'level-node-destination.svg'
  if (state === 'completed') return 'level-node-completed.svg'
  if (state === 'current' || state === 'unlocked') return 'level-node-current.svg'
  return 'level-node-locked.svg'
}

function buildStageProgressByLevelId(stageMenus: StageProgressMenu[], passedIds: Set<string>) {
  const progressByLevelId = new Map<string, StageProgressState>()

  for (const menu of stageMenus) {
    const displayItems = menu.items.slice(0, 5)
    const total = displayItems.length
    if (total === 0) continue
    const passed = displayItems.filter((item) => passedIds.has(item.levelId)).length
    const label = `${passed}/${total}`

    for (const item of menu.items) {
      progressByLevelId.set(item.levelId, { passed, total, label })
    }
  }

  return progressByLevelId
}

function buildDefaultStageProgress(levelId: string, passedIds: Set<string>): StageProgressState {
  const passed = passedIds.has(levelId) ? 1 : 0
  return {
    passed,
    total: 5,
    label: `${passed}/5`,
  }
}

function getRequiredStagePassCount(total: number) {
  return Math.max(1, Math.min(3, total))
}

function mascotStyle(levelId: string, positions: MapPoint[]): CSSProperties {
  const position = positions.find((node) => node.id === levelId) ?? positions[0]
  return {
    left: `${(position?.x ?? 0.12) * 100}%`,
    top: `${(position?.y ?? 0.76) * 100}%`,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
