import { auth } from '@/auth'
import {
  getAllLevelsForUser,
  getLevelByIdForUser,
  getLessonStageMenuForLevel,
  listLessonStageMenusForLevels,
  getMapMainlineLevelsForUser,
  getMainlineLevelsForUser,
} from '@/lib/services/level-service'
import { getProgressForUser } from '@/lib/services/progress-service'
import { getFeatureAccess } from '@/lib/services/entitlement-service'
import { getLevelAccessForUserFromData, getLevelNavigationForUserFromData } from '@/lib/services/level-access-service'

export async function getAllLevels() {
  const session = await auth()
  return getAllLevelsForUser({
    userId: session?.user?.id,
    allowMockFallback: true,
  })
}

export async function getMainlineLevels(chapterId?: string) {
  const session = await auth()
  return getMainlineLevelsForUserId(session?.user?.id, chapterId)
}

export async function getMainlineLevelsForUserId(userId?: string | null, chapterId?: string) {
  return getMainlineLevelsForUser({
    userId,
    allowMockFallback: true,
    chapterId,
  })
}

export async function getMapMainlineLevels(chapterId?: string) {
  const session = await auth()
  return getMapMainlineLevelsForUserId(session?.user?.id, chapterId)
}

export async function getMapMainlineLevelsForUserId(userId?: string | null, chapterId?: string) {
  return getMapMainlineLevelsForUser({
    userId,
    allowMockFallback: true,
    chapterId,
  })
}

export async function getLevelById(id: string) {
  const session = await auth()
  return getLevelByIdForUserId(id, session?.user?.id)
}

export async function getLevelByIdForUserId(id: string, userId?: string | null) {
  return getLevelByIdForUser(id, {
    userId,
    allowMockFallback: true,
  })
}

export async function getLessonStageMenu(levelId: string) {
  return getLessonStageMenuForLevel(levelId)
}

export async function getLessonStageMenus(levelIds: string[]) {
  return listLessonStageMenusForLevels(levelIds)
}

export async function getProgressRecords() {
  const session = await auth()
  return getProgressRecordsForUserId(session?.user?.id)
}

export async function getProgressRecordsForUserId(userId?: string | null) {
  return getProgressForUser({
    userId,
    allowMockFallback: true,
  })
}

export async function getMapLearningDataForUser(userId: string, chapterId?: string) {
  const [levels, progressRecords] = await Promise.all([
    getMapMainlineLevelsForUserId(userId, chapterId),
    getProgressRecordsForUserId(userId),
  ])
  const stageMenus = await getLessonStageMenus(levels.map((level) => level.id))
  const navigation = await getLevelNavigationForUserFromData({
    userId,
    levels,
    progress: progressRecords,
    stageMenus,
  })

  return {
    levels,
    progressRecords,
    stageMenus,
    navigation,
  }
}

export async function getProgrammingLevelPageDataForUser(userId: string, levelId: string) {
  const [level, levels, progressRecords] = await Promise.all([
    getLevelByIdForUserId(levelId, userId),
    getMainlineLevelsForUserId(userId),
    getProgressRecordsForUserId(userId),
  ])

  if (!level) {
    return {
      level: null,
      levels,
      progressRecords,
      stageMenu: null,
      stageLevels: [],
      access: null,
      hintsAccess: null,
    }
  }

  const stageMenus = await getLessonStageMenus(levels.map((item) => item.id))
  const directStageMenu = stageMenus.find((menu) => menu.items.some((item) => item.levelId === levelId)) ?? (await getLessonStageMenu(levelId))
  const accessStageMenus =
    directStageMenu && !stageMenus.some((menu) => menu.problemSetId === directStageMenu.problemSetId)
      ? [...stageMenus, directStageMenu]
      : stageMenus
  const stageLevels = directStageMenu
    ? (
        await Promise.all(directStageMenu.items.map((item) => getLevelByIdForUserId(item.levelId, userId)))
      ).filter((item): item is NonNullable<typeof item> => Boolean(item))
    : []
  const [access, hintsAccess] = await Promise.all([
    getLevelAccessForUserFromData({
      userId,
      levelId,
      levels,
      progress: progressRecords,
      stageMenus: accessStageMenus,
    }),
    getFeatureAccess({ userId, feature: 'hints' }),
  ])

  return {
    level,
    levels,
    progressRecords,
    stageMenu: directStageMenu,
    stageLevels,
    access,
    hintsAccess,
  }
}
