import { cache } from 'react'
import type { Level, Progress } from '@spcg/shared/types'
import { listGameChapters } from '@spcg/shared/game-chapters'
import { levels as mockLevels } from '@/lib/mock-data'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  applySolutionUnlocks,
  getInternalLevelForTesting,
  getUnlockedSolutions,
  listInternalLevelTestSummaries,
  listPublicLevels,
} from '@/lib/repositories/level-repository'
import {
  getLessonStageProblemMenuForLevel,
  listPublishedLessonStageProblemMenus,
  listCurriculumMainlineStages,
  listMainlineStageTitles,
  type LessonStageProblemMenu,
} from '@/lib/repositories/problem-set-repository'
import { getProgressForUser } from '@/lib/services/progress-service'
import { ServiceError } from '@/lib/services/errors'

type LevelServiceInput = {
  userId?: string | null
  allowMockFallback?: boolean
  chapterId?: string | null
}

const STORY_MAINLINE_LEVEL_IDS = new Set(listGameChapters().flatMap((chapter) => chapter.levelPlan.map((level) => level.id)))

const getAllLevelsForUserCached = cache(async (userId: string | null, allowMockFallback: boolean): Promise<Level[]> => {
  const levels = await loadLevels({ allowMockFallback })
  const progress = await getProgressForUser({
    userId,
    allowMockFallback,
  })

  if (!userId || !isDatabaseConfigured() || progress.length === 0) {
    return applySolutionVideoPolicy(progress.length > 0 ? applySolutionUnlocks(levels, progress) : levels)
  }

  try {
    return applySolutionVideoPolicy(applySolutionUnlocks(levels, progress, await getUnlockedSolutions(progress)))
  } catch (error) {
    console.warn(`Failed to load unlocked solutions: ${error instanceof Error ? error.message : String(error)}`)
    return applySolutionVideoPolicy(applySolutionUnlocks(levels, progress))
  }
})

export function getAllLevelsForUser(input: LevelServiceInput = {}): Promise<Level[]> {
  return getAllLevelsForUserCached(input.userId ?? null, input.allowMockFallback ?? false)
}

export async function getMainlineLevelsForUser(input: LevelServiceInput = {}): Promise<Level[]> {
  const levels = await getAllLevelsForUser(input)
  const curriculumLevels = await buildCurriculumMainlineLevels(levels, input.chapterId)
  if (curriculumLevels.length > 0) return curriculumLevels

  return levels.filter((level) => isStoryMainlineLevel(level) && (!input.chapterId || level.chapterId === input.chapterId))
}

export async function getMapMainlineLevelsForUser(input: LevelServiceInput = {}): Promise<Level[]> {
  return getMainlineLevelsForUser(input)
}

export async function getLevelByIdForUser(id: string, input: LevelServiceInput = {}): Promise<Level | undefined> {
  const levels = await getAllLevelsForUser(input)
  return levels.find((level) => level.id === id)
}

export async function getLessonStageMenuForLevel(levelId: string) {
  if (!isDatabaseConfigured()) return null
  return getLessonStageProblemMenuForLevel(levelId)
}

export async function listLessonStageMenusForLevels(levelIds: string[]): Promise<LessonStageProblemMenu[]> {
  if (!isDatabaseConfigured() || levelIds.length === 0) return []

  const requestedIds = new Set(levelIds)
  const menus = await listPublishedLessonStageProblemMenus({ track: 'A' })
  const menuByLevelId = new Map<string, LessonStageProblemMenu>()
  for (const menu of menus) {
    for (const item of menu.items) {
      if (requestedIds.has(item.levelId) && !menuByLevelId.has(item.levelId)) {
        menuByLevelId.set(item.levelId, menu)
      }
    }
  }

  return levelIds.map((levelId) => menuByLevelId.get(levelId)).filter((menu): menu is LessonStageProblemMenu => Boolean(menu))
}

export async function getLevelTestSummaries() {
  if (!isDatabaseConfigured()) return []
  const summaries = await listInternalLevelTestSummaries()
  if (isSolutionVideoEnabled()) return summaries
  return summaries.map((summary) => ({ ...summary, hasSolutionVideo: false }))
}

export async function getLevelForTeacherTesting(id: string): Promise<Level | null> {
  if (!isDatabaseConfigured()) return null
  const level = await getInternalLevelForTesting(id)
  return level ? applySolutionVideoPolicyToLevel(level) : null
}

export async function getUnlockedLevelSolutionForUser(input: { userId?: string | null; levelId: string }) {
  if (!input.userId || !input.levelId) {
    return {
      solutionUnlocked: false,
      solution: null,
      officialCode: null,
      solutionVideoUrl: null,
    }
  }

  const progress = await getProgressForUser({
    userId: input.userId,
  })
  const passed = progress.some((item) => item.levelId === input.levelId && item.passed)
  if (!passed) {
    return {
      solutionUnlocked: false,
      solution: null,
      officialCode: null,
      solutionVideoUrl: null,
    }
  }

  const unlockedSolutions = await getUnlockedSolutions(progress)
  const unlocked = unlockedSolutions.get(input.levelId)

  return {
    solutionUnlocked: Boolean(unlocked),
    solution: unlocked?.solution ?? null,
    officialCode: unlocked?.official_code ?? null,
    solutionVideoUrl: getEnabledSolutionVideoUrl(unlocked?.solution_video_url ?? null),
  }
}

async function loadLevels(input: { allowMockFallback: boolean }): Promise<Level[]> {
  if (!isDatabaseConfigured()) {
    if (input.allowMockFallback) return mockLevels
    throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  }

  try {
    const levels = await listPublicLevels()
    if (levels.length === 0) {
      if (input.allowMockFallback) {
        console.warn('levels_public returned no rows, using mock levels')
        return mockLevels
      }

      throw new ServiceError('not_found', 'No published levels found.', 404)
    }

    return input.allowMockFallback ? mergeMissingMockMainlineLevels(levels) : levels
  } catch (error) {
    if (input.allowMockFallback) {
      console.warn(
        `Failed to load levels_public, using mock levels: ${error instanceof Error ? error.message : String(error)}`,
      )
      return mockLevels
    }

    throw error
  }
}

function isStoryMainlineLevel(level: Level): boolean {
  return STORY_MAINLINE_LEVEL_IDS.has(level.id)
}

function isSolutionVideoEnabled(): boolean {
  return process.env.SPCG_SOLUTION_VIDEO_ENABLED === 'true'
}

function getEnabledSolutionVideoUrl(url: string | null | undefined): string | null {
  return isSolutionVideoEnabled() ? url ?? null : null
}

function applySolutionVideoPolicy(levels: Level[]): Level[] {
  if (isSolutionVideoEnabled()) return levels
  return levels.map(applySolutionVideoPolicyToLevel)
}

function applySolutionVideoPolicyToLevel(level: Level): Level {
  return level.solutionVideoUrl ? { ...level, solutionVideoUrl: null } : level
}

function mergeMissingMockMainlineLevels(levels: Level[]): Level[] {
  const existingIds = new Set(levels.map((level) => level.id))
  const missingLevels = mockLevels.filter((level) => isStoryMainlineLevel(level) && !existingIds.has(level.id))

  if (missingLevels.length === 0) return levels
  return [...levels, ...missingLevels].sort((a, b) => a.chapterId.localeCompare(b.chapterId) || a.order - b.order)
}

async function buildCurriculumMainlineLevels(levels: Level[], chapterId?: string | null): Promise<Level[]> {
  if (!isDatabaseConfigured() || levels.length === 0) return []

  try {
    const stages = await listCurriculumMainlineStages()
    if (stages.length === 0) return []

    const levelById = new Map(levels.map((level) => [level.id, level]))
    return stages
      .map((stage) => {
        const level = levelById.get(stage.levelId)
        if (!level || (chapterId && level.chapterId !== chapterId)) return null

        return {
          ...level,
          order: stage.stageNo,
          title: stage.title,
          knowledgePoint: stage.lessonFocus ?? level.knowledgePoint,
        }
      })
      .filter((level): level is Level => Boolean(level))
      .sort((a, b) => a.chapterId.localeCompare(b.chapterId) || a.order - b.order)
  } catch (error) {
    console.warn(`Failed to load curriculum mainline levels: ${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}

async function applyMainlineStageTitles(levels: Level[]): Promise<Level[]> {
  if (!isDatabaseConfigured() || levels.length === 0) return levels

  try {
    const titles = await listMainlineStageTitles(levels.map((level) => level.id))
    if (titles.length === 0) return levels

    const stageByLevelId = new Map(titles.map((item) => [item.levelId, item]))
    return levels.map((level) => {
      const stage = stageByLevelId.get(level.id)
      return stage
        ? {
            ...level,
            title: stage.title,
            knowledgePoint: stage.lessonFocus ?? level.knowledgePoint,
          }
        : level
    })
  } catch (error) {
    console.warn(`Failed to load curriculum stage titles: ${error instanceof Error ? error.message : String(error)}`)
    return levels
  }
}
