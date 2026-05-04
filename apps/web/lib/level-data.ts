import { auth } from '@/auth'
import {
  getAllLevelsForUser,
  getLevelByIdForUser,
  getLessonStageMenuForLevel,
  getMapMainlineLevelsForUser,
  getMainlineLevelsForUser,
} from '@/lib/services/level-service'
import { getProgressForUser } from '@/lib/services/progress-service'

export async function getAllLevels() {
  const session = await auth()
  return getAllLevelsForUser({
    userId: session?.user?.id,
    allowMockFallback: true,
  })
}

export async function getMainlineLevels(chapterId?: string) {
  const session = await auth()
  return getMainlineLevelsForUser({
    userId: session?.user?.id,
    allowMockFallback: true,
    chapterId,
  })
}

export async function getMapMainlineLevels(chapterId?: string) {
  const session = await auth()
  return getMapMainlineLevelsForUser({
    userId: session?.user?.id,
    allowMockFallback: true,
    chapterId,
  })
}

export async function getLevelById(id: string) {
  const session = await auth()
  return getLevelByIdForUser(id, {
    userId: session?.user?.id,
    allowMockFallback: true,
  })
}

export async function getLessonStageMenu(levelId: string) {
  return getLessonStageMenuForLevel(levelId)
}

export async function getProgressRecords() {
  const session = await auth()
  return getProgressForUser({
    userId: session?.user?.id,
    allowMockFallback: true,
  })
}
