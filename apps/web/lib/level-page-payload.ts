import type { Session } from 'next-auth'
import type { Level, Progress, UiLocale } from '@spcg/shared/types'
import type { StudentUiMessages } from '@/lib/student-ui'

export type LevelPageStageMenu = {
  title: string
  spcgLevel: number
  stageNo: number
  items: Array<{
    levelId: string
    title: string
    position: number
    displayMode: string
  }>
} | null

export type LevelPagePayloadInput = {
  userId: string
  levelId: string
  uiLocale: UiLocale
  level: Level
  levels: Level[]
  stageLevels: Level[]
  session: Session | null
  stageMenu: LevelPageStageMenu
  progressRecords: Progress[]
  canViewHints: boolean
  hintsUpgradeMessage?: string
  messages: StudentUiMessages
  canShowPricingMenu: boolean
  canFreeJump: boolean
}

export type LevelPagePayload = LevelPagePayloadInput & {
  version: 1
  cachedAt: string
}

export const LEVEL_PAGE_PAYLOAD_VERSION = 1

export function createCacheableLevelPagePayload(input: LevelPagePayloadInput, cachedAt = new Date().toISOString()): LevelPagePayload {
  return {
    ...input,
    version: LEVEL_PAGE_PAYLOAD_VERSION,
    cachedAt,
    level: sanitizeLevelForCache(input.level),
    levels: input.levels.map(sanitizeLevelForCache),
    stageLevels: input.stageLevels.map(sanitizeLevelForCache),
  }
}

function sanitizeLevelForCache(level: Level): Level {
  return {
    ...level,
    solutionUnlocked: false,
    solution: undefined,
    officialCode: undefined,
    solutionVideoUrl: null,
  }
}
