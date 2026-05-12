import type { Level, Progress, StudentUserType, UserRole } from '@spcg/shared/types'
import type { LessonStageProblemMenu } from '@/lib/repositories/problem-set-repository'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  getStudentCurrentLevel,
  upsertStudentCurrentLevel,
} from '@/lib/repositories/student-current-level-repository'
import { getUserRole } from '@/lib/repositories/user-repository'
import {
  getAllLevelsForUser,
  getLessonStageMenuForLevel,
  getLevelByIdForUser,
  getMainlineLevelsForUser,
} from '@/lib/services/level-service'
import { getProgressForUser } from '@/lib/services/progress-service'
import { ServiceError } from '@/lib/services/errors'
import { getLevelEntitlementAccess } from '@/lib/services/entitlement-service'

export type LevelAccessResult = {
  role: UserRole
  allowed: boolean
  canFreeJump: boolean
  currentMapLevelId: string | null
  currentEntryLevelId: string | null
  redirectLevelId: string | null
  reason: string | null
  upgradeRequired: boolean
  requiredUserType: StudentUserType | null
  userType: StudentUserType | null
}

export type StudentCurrentLevelSummary = {
  studentUserId: string
  levelId: string
  entryLevelId: string
  title: string
  chapterId: string
  spcgLevel: number
  stageNo: number | null
  source: 'teacher_set' | 'progress'
  assignedBy: string | null
  updatedAt: string | null
}

type StageAccess = LessonStageProblemMenu & {
  representativeLevelId: string
  representativeOrder: number
}

const DEV_ALLOW_ACCESS: LevelAccessResult = {
  role: 'student',
  allowed: true,
  canFreeJump: true,
  currentMapLevelId: null,
  currentEntryLevelId: null,
  redirectLevelId: null,
  reason: null,
  upgradeRequired: false,
  requiredUserType: null,
  userType: null,
}

export async function getLevelNavigationForUser(userId?: string | null): Promise<LevelAccessResult> {
  if (!isDatabaseConfigured()) return DEV_ALLOW_ACCESS
  if (!userId) return denyAnonymousAccess()

  const role = await getUserRole(userId)
  if (role === 'admin' || role === 'teacher') {
    return {
      role,
      allowed: true,
      canFreeJump: true,
      currentMapLevelId: null,
      currentEntryLevelId: null,
      redirectLevelId: null,
      reason: null,
      upgradeRequired: false,
      requiredUserType: null,
      userType: null,
    }
  }

  const state = await resolveStudentStudyState(userId)
  return {
    role,
    allowed: true,
    canFreeJump: false,
    currentMapLevelId: state.currentStage?.representativeLevelId ?? state.fallbackCurrentLevelId,
    currentEntryLevelId: state.currentEntryLevelId,
    redirectLevelId: null,
    reason: null,
    upgradeRequired: false,
    requiredUserType: null,
    userType: null,
  }
}

export async function getLevelAccessForUser(input: {
  userId?: string | null
  levelId: string
}): Promise<LevelAccessResult> {
  if (!isDatabaseConfigured()) return DEV_ALLOW_ACCESS
  if (!input.userId) return denyAnonymousAccess()

  const role = await getUserRole(input.userId)
  if (role === 'admin' || role === 'teacher') {
    return {
      role,
      allowed: true,
      canFreeJump: true,
      currentMapLevelId: null,
      currentEntryLevelId: null,
      redirectLevelId: null,
      reason: null,
      upgradeRequired: false,
      requiredUserType: null,
      userType: null,
    }
  }

  const state = await resolveStudentStudyState(input.userId)
  const currentMapLevelId = state.currentStage?.representativeLevelId ?? state.fallbackCurrentLevelId
  const currentEntryLevelId = state.currentEntryLevelId
  const redirectLevelId = currentEntryLevelId ?? currentMapLevelId
  const targetStageIndex = state.stages.findIndex((stage) => stage.items.some((item) => item.levelId === input.levelId))
  const targetStage = targetStageIndex >= 0 ? state.stages[targetStageIndex] : null
  const targetLevel = state.levels.find((level) => level.id === input.levelId)
  const entitlementAccess = await getLevelEntitlementAccess({
    userId: input.userId,
    role,
    spcgLevel: targetStage?.spcgLevel ?? Number(targetLevel?.difficulty.spcgLevel ?? 0),
    stageNo: targetStage?.stageNo ?? targetLevel?.order ?? null,
  })

  if (!entitlementAccess.allowed) {
    return {
      role,
      allowed: false,
      canFreeJump: false,
      currentMapLevelId,
      currentEntryLevelId,
      redirectLevelId: null,
      reason: entitlementAccess.reason,
      upgradeRequired: true,
      requiredUserType: entitlementAccess.requiredUserType,
      userType: entitlementAccess.userType,
    }
  }

  if (state.passedLevelIds.has(input.levelId)) {
    return allowStudentAccess(role, currentMapLevelId, currentEntryLevelId)
  }

  if (targetStage && targetStageIndex <= state.currentStageIndex) {
    return allowStudentAccess(role, currentMapLevelId, currentEntryLevelId)
  }

  if (targetStage && isStageMainlineComplete(targetStage, state.passedLevelIds)) {
    return allowStudentAccess(role, currentMapLevelId, currentEntryLevelId)
  }

  if (state.stages.length === 0) {
    const target = targetLevel
    const current = state.levels.find((level) => level.id === state.fallbackCurrentLevelId)
    if (target && current && compareLevelPosition(target, current) <= 0) {
      return allowStudentAccess(role, currentMapLevelId, currentEntryLevelId)
    }
  }

  return {
    role,
    allowed: false,
    canFreeJump: false,
    currentMapLevelId,
    currentEntryLevelId,
    redirectLevelId,
    reason: '请先完成当前关卡，再进入后续关卡。',
    upgradeRequired: false,
    requiredUserType: null,
    userType: entitlementAccess.userType,
  }
}

export async function setStudentCurrentLevel(input: {
  studentUserId: string
  levelId: string
  assignedBy?: string | null
  reason?: string | null
}): Promise<StudentCurrentLevelSummary> {
  if (!input.studentUserId) throw new ServiceError('bad_request', '学生不能为空。', 400)
  if (!input.levelId) throw new ServiceError('bad_request', '关卡不能为空。', 400)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)

  const studentRole = await getUserRole(input.studentUserId)
  if (studentRole !== 'student') {
    throw new ServiceError('bad_request', '只能设置学生账号的当前关卡。', 400)
  }

  const level = await getLevelByIdForUser(input.levelId, {
    userId: input.studentUserId,
    allowMockFallback: false,
  })
  if (!level) throw new ServiceError('not_found', '关卡不存在或未发布。', 404)

  await upsertStudentCurrentLevel({
    userId: input.studentUserId,
    levelId: level.id,
    assignedBy: input.assignedBy ?? null,
    reason: input.reason ?? null,
  })

  const summary = await getStudentCurrentLevelSummary(input.studentUserId)
  if (!summary) throw new ServiceError('internal_error', '当前关卡已保存，但读取失败。', 500)
  return summary
}

export async function getStudentCurrentLevelSummary(studentUserId: string): Promise<StudentCurrentLevelSummary | null> {
  if (!studentUserId || !isDatabaseConfigured()) return null

  const [state, stored, levels] = await Promise.all([
    resolveStudentStudyState(studentUserId),
    getStudentCurrentLevel(studentUserId),
    getAllLevelsForUser({ userId: studentUserId, allowMockFallback: true }),
  ])
  const currentMapLevelId = state.currentStage?.representativeLevelId ?? state.fallbackCurrentLevelId
  if (!currentMapLevelId) return null

  const level = levels.find((item) => item.id === currentMapLevelId)
  const stage = state.currentStage
  return {
    studentUserId,
    levelId: currentMapLevelId,
    entryLevelId: state.currentEntryLevelId ?? currentMapLevelId,
    title: stage?.title ?? level?.title ?? currentMapLevelId,
    chapterId: level?.chapterId ?? '',
    spcgLevel: stage?.spcgLevel ?? Number(level?.difficulty.spcgLevel ?? 0),
    stageNo: stage?.stageNo ?? null,
    source: stored ? 'teacher_set' : 'progress',
    assignedBy: stored?.assignedBy ?? null,
    updatedAt: stored?.updatedAt ?? null,
  }
}

async function resolveStudentStudyState(userId: string) {
  const [progress, levels, stored] = await Promise.all([
    getProgressForUser({ userId, allowMockFallback: false }),
    getMainlineLevelsForUser({ userId, allowMockFallback: true }),
    getStudentCurrentLevel(userId),
  ])
  const passedLevelIds = new Set(progress.filter((item) => item.passed).map((item) => item.levelId))
  const stages = await loadStageAccess(levels)
  const currentStageState = findCurrentStage(stages, passedLevelIds, stored?.levelId ?? null)
  const fallbackCurrentLevelId = stored?.levelId ?? findFallbackCurrentLevelId(levels, progress)
  const currentEntryLevelId = currentStageState.stage
    ? getFirstOpenStageLevelId(currentStageState.stage, passedLevelIds)
    : fallbackCurrentLevelId

  return {
    progress,
    levels,
    stages,
    passedLevelIds,
    currentStage: currentStageState.stage,
    currentStageIndex: currentStageState.index,
    currentEntryLevelId,
    fallbackCurrentLevelId,
  }
}

async function loadStageAccess(levels: Level[]): Promise<StageAccess[]> {
  const menus = await Promise.all(levels.map((level) => getLessonStageMenuForLevel(level.id)))
  const seen = new Set<string>()
  const stages: StageAccess[] = []

  menus.forEach((menu, index) => {
    const representative = levels[index]
    if (!menu || !representative || seen.has(menu.problemSetId)) return
    seen.add(menu.problemSetId)
    stages.push({
      ...menu,
      representativeLevelId: representative.id,
      representativeOrder: representative.order,
      items: menu.items.slice().sort((a, b) => a.position - b.position),
    })
  })

  return stages.sort(
    (a, b) =>
      a.spcgLevel - b.spcgLevel ||
      a.stageNo - b.stageNo ||
      a.track.localeCompare(b.track) ||
      a.representativeOrder - b.representativeOrder,
  )
}

function findCurrentStage(
  stages: StageAccess[],
  passedLevelIds: Set<string>,
  storedLevelId: string | null,
): { stage: StageAccess | null; index: number } {
  if (stages.length === 0) return { stage: null, index: -1 }

  const storedIndex = storedLevelId
    ? stages.findIndex((stage) => stage.items.some((item) => item.levelId === storedLevelId))
    : -1
  let index = Math.max(0, storedIndex)

  while (index < stages.length && isStageMainlineComplete(stages[index]!, passedLevelIds)) {
    index += 1
  }

  const safeIndex = Math.min(index, stages.length - 1)
  return { stage: stages[safeIndex] ?? null, index: safeIndex }
}

function isStageMainlineComplete(stage: StageAccess, passedLevelIds: Set<string>) {
  const displayItems = stage.items.slice(0, 5)
  const requiredPassCount = Math.max(1, Math.min(3, displayItems.length))
  return displayItems.filter((item) => passedLevelIds.has(item.levelId)).length >= requiredPassCount
}

function getFirstOpenStageLevelId(stage: StageAccess, passedLevelIds: Set<string>) {
  const displayItems = stage.items.slice(0, 5)
  return displayItems.find((item) => !passedLevelIds.has(item.levelId))?.levelId ?? stage.representativeLevelId
}

function findFallbackCurrentLevelId(levels: Level[], progress: Progress[]): string | null {
  const passedLevelIds = new Set(progress.filter((item) => item.passed).map((item) => item.levelId))
  const orderedLevels = levels.slice().sort(compareLevelPosition)
  return orderedLevels.find((level) => !passedLevelIds.has(level.id))?.id ?? orderedLevels[0]?.id ?? null
}

function compareLevelPosition(a: Level, b: Level): number {
  return (
    Number(a.difficulty.spcgLevel ?? 0) - Number(b.difficulty.spcgLevel ?? 0) ||
    a.order - b.order ||
    a.chapterId.localeCompare(b.chapterId) ||
    a.id.localeCompare(b.id)
  )
}

function allowStudentAccess(
  role: UserRole,
  currentMapLevelId: string | null,
  currentEntryLevelId: string | null,
): LevelAccessResult {
  return {
    role,
    allowed: true,
    canFreeJump: false,
    currentMapLevelId,
    currentEntryLevelId,
    redirectLevelId: null,
    reason: null,
    upgradeRequired: false,
    requiredUserType: null,
    userType: null,
  }
}

function denyAnonymousAccess(): LevelAccessResult {
  return {
    role: 'student',
    allowed: false,
    canFreeJump: false,
    currentMapLevelId: null,
    currentEntryLevelId: null,
    redirectLevelId: null,
    reason: '当前未登录。',
    upgradeRequired: false,
    requiredUserType: null,
    userType: null,
  }
}
