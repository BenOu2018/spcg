import { createHash } from 'node:crypto'
import type { AssessmentAttempt, AssessmentAttemptItem, Level, RewardGrantResult } from '@spcg/shared/types'
import type { LessonStageProblemMenu } from '@/lib/repositories/problem-set-repository'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  getDailyReviewAttemptItems,
  getDailyReviewAttemptRecord,
  getOrCreateDailyReviewAttempt,
  listDailyReviewAttemptLevels,
  refreshDailyReviewAttemptCompletion,
  setDailyReviewAttemptReward,
  type DailyReviewPaperItemInput,
} from '@/lib/repositories/daily-review-repository'
import { listPublishedLessonStageProblemMenus } from '@/lib/repositories/problem-set-repository'
import { getLevelNavigationForUser } from '@/lib/services/level-access-service'
import { getProgressForUser } from '@/lib/services/progress-service'
import { grantDailyReviewReward } from '@/lib/services/reward-service'
import { ServiceError } from '@/lib/services/errors'
import { formatStudentDateKey } from '@/lib/student-date'

export type DailyReviewDetail = {
  attempt: AssessmentAttempt
  levels: Level[]
  items: AssessmentAttemptItem[]
  currentEntryLevelId: string | null
  currentMapLevelId: string | null
  dateKey: string
  completed: boolean
  reward: RewardGrantResult | null
}

export type DailyReviewStartResult =
  | DailyReviewDetail
  | {
      attempt: null
      levels: []
      items: []
      currentEntryLevelId: string | null
      currentMapLevelId: string | null
      dateKey: string
      completed: false
      reward: null
      emptyReason: string
    }

export async function startDailyReview(input: {
  userId?: string | null
  currentLevelId?: string | null
}): Promise<DailyReviewStartResult> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)

  const dateKey = formatStudentDateKey()
  const [navigation, progress, stages] = await Promise.all([
    getLevelNavigationForUser(input.userId),
    getProgressForUser({ userId: input.userId, allowMockFallback: false }),
    listPublishedLessonStageProblemMenus({ track: 'A' }),
  ])
  const passedLevelIds = new Set(progress.filter((item) => item.passed).map((item) => item.levelId))
  const currentContext = resolveDailyReviewCurrentContext({
    requestedLevelId: input.currentLevelId,
    navigationCurrentMapLevelId: navigation.currentMapLevelId,
    navigationCurrentEntryLevelId: navigation.currentEntryLevelId,
    stages,
    passedLevelIds,
  })
  const currentEntryLevelId = currentContext.currentEntryLevelId
  const currentMapLevelId = currentContext.currentMapLevelId
  const selectedItems = selectDailyReviewItems({
    userId: input.userId,
    dateKey,
    stages,
    currentLevelIds: currentContext.currentLevelIds,
    passedLevelIds,
  })

  if (selectedItems.length === 0) {
    return {
      attempt: null,
      levels: [],
      items: [],
      currentEntryLevelId,
      currentMapLevelId,
      dateKey,
      completed: false,
      reward: null,
      emptyReason: '前两层暂时没有已完成题目可复习，可以先继续当前关卡。',
    }
  }

  const hash = stableHash(input.userId).slice(0, 12)
  const problemSetId = `daily-review-${dateKey}-${hash}`
  const sessionId = problemSetId
  const title = `今日任务 ${dateKey}`
  const attemptId = await getOrCreateDailyReviewAttempt({
    userId: input.userId,
    dateKey,
    problemSetId,
    sessionId,
    title,
    currentEntryLevelId,
    currentMapLevelId,
    items: selectedItems,
  })

  if (!attemptId) {
    return {
      attempt: null,
      levels: [],
      items: [],
      currentEntryLevelId,
      currentMapLevelId,
      dateKey,
      completed: false,
      reward: null,
      emptyReason: '今日任务暂时没有可复习题目。',
    }
  }

  return getDailyReviewDetail({ userId: input.userId, attemptId })
}

export async function getDailyReviewDetail(input: {
  userId?: string | null
  attemptId: string
}): Promise<DailyReviewDetail> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  if (!input.attemptId) throw new ServiceError('bad_request', 'attemptId is required.', 400)

  await finalizeDailyReviewIfReady({
    userId: input.userId,
    attemptId: input.attemptId,
  })

  const [record, levels, items] = await Promise.all([
    getDailyReviewAttemptRecord({ userId: input.userId, attemptId: input.attemptId }),
    listDailyReviewAttemptLevels({ userId: input.userId, attemptId: input.attemptId }),
    getDailyReviewAttemptItems({ userId: input.userId, attemptId: input.attemptId }),
  ])
  if (!record) throw new ServiceError('not_found', '今日任务不存在。', 404)

  return {
    attempt: record.attempt,
    levels,
    items,
    currentEntryLevelId: record.metadata.currentEntryLevelId ?? null,
    currentMapLevelId: record.metadata.currentMapLevelId ?? null,
    dateKey: record.metadata.dateKey ?? formatStudentDateKey(),
    completed: record.attempt.status === 'completed',
    reward: record.attempt.reward,
  }
}

export async function completeDailyReviewAttempt(input: {
  userId?: string | null
  attemptId: string
}): Promise<DailyReviewDetail> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)

  await finalizeDailyReviewIfReady({
    userId: input.userId,
    attemptId: input.attemptId,
  })

  return getDailyReviewDetail({
    userId: input.userId,
    attemptId: input.attemptId,
  })
}

async function finalizeDailyReviewIfReady(input: { userId: string; attemptId: string }) {
  const completion = await refreshDailyReviewAttemptCompletion(input)
  if (!completion?.completed) return
  if (!completion.newlyCompleted) return

  const record = await getDailyReviewAttemptRecord(input)
  if (!record) return
  if (record.attempt.reward?.ledgerIds.length) return

  const reward = await grantDailyReviewReward({
    userId: input.userId,
    attemptId: input.attemptId,
    acceptedCount: completion.acceptedCount,
    totalCount: completion.totalCount,
    spcgLevelRewards: buildDailyReviewSpcgLevelRewards(await listDailyReviewAttemptLevels(input)),
  })

  await setDailyReviewAttemptReward({
    userId: input.userId,
    attemptId: input.attemptId,
    reward,
  })
}

function selectDailyReviewItems(input: {
  userId: string
  dateKey: string
  stages: LessonStageProblemMenu[]
  currentLevelIds: string[]
  passedLevelIds: Set<string>
}): DailyReviewPaperItemInput[] {
  const currentStageIndex = input.stages.findIndex((stage) =>
    stage.items.some((item) => input.currentLevelIds.includes(item.levelId)),
  )
  if (currentStageIndex <= 0) return []

  const previousStages = input.stages.slice(Math.max(0, currentStageIndex - 2), currentStageIndex)
  const selected = previousStages
    .map((stage) => {
      const candidates = stage.items
        .filter((item) => input.passedLevelIds.has(item.levelId))
        .sort((left, right) =>
          stableHash(`${input.userId}:${input.dateKey}:${stage.problemSetId}:${left.levelId}`).localeCompare(
            stableHash(`${input.userId}:${input.dateKey}:${stage.problemSetId}:${right.levelId}`),
          ),
        )
      const picked = candidates[0]
      if (!picked) return null

      return {
        levelId: picked.levelId,
        position: 0,
        sourceProblemSetId: stage.problemSetId,
        sourceStageNo: stage.stageNo,
        sourceSpcgLevel: stage.spcgLevel,
      }
    })
    .filter((item): item is Omit<DailyReviewPaperItemInput, 'position'> & { position: number } => Boolean(item))

  return selected.map((item, index) => ({
    ...item,
    position: index + 1,
  }))
}

function buildDailyReviewSpcgLevelRewards(levels: Level[]): Array<{ spcgLevel: number; acceptedCount: number }> {
  const counts = new Map<number, number>()
  for (const level of levels) {
    const spcgLevel = level.difficulty.spcgLevel
    counts.set(spcgLevel, (counts.get(spcgLevel) ?? 0) + 1)
  }

  return [...counts.entries()].map(([spcgLevel, acceptedCount]) => ({ spcgLevel, acceptedCount }))
}

function resolveDailyReviewCurrentContext(input: {
  requestedLevelId?: string | null
  navigationCurrentMapLevelId: string | null
  navigationCurrentEntryLevelId: string | null
  stages: LessonStageProblemMenu[]
  passedLevelIds: Set<string>
}) {
  const requestedLevelId = normalizeLevelId(input.requestedLevelId)
  const requestedLevelIsPublished = requestedLevelId
    ? input.stages.some((stage) => stage.items.some((item) => item.levelId === requestedLevelId))
    : false
  const navigationLevelIds = [input.navigationCurrentMapLevelId, input.navigationCurrentEntryLevelId]
    .map(normalizeLevelId)
    .filter((levelId): levelId is string => Boolean(levelId))

  if (requestedLevelId && requestedLevelIsPublished) {
    return {
      currentMapLevelId: input.navigationCurrentMapLevelId ?? requestedLevelId,
      currentEntryLevelId: input.navigationCurrentEntryLevelId ?? requestedLevelId,
      currentLevelIds: uniqueStrings([requestedLevelId, ...navigationLevelIds]),
    }
  }

  if (navigationLevelIds.length > 0) {
    return {
      currentMapLevelId: input.navigationCurrentMapLevelId,
      currentEntryLevelId: input.navigationCurrentEntryLevelId ?? input.navigationCurrentMapLevelId,
      currentLevelIds: uniqueStrings(navigationLevelIds),
    }
  }

  const inferredStage = input.stages.find((stage) => !isDailyReviewStageComplete(stage, input.passedLevelIds))
  const inferredMapLevelId = inferredStage?.items[0]?.levelId ?? null
  const inferredEntryLevelId = inferredStage
    ? getFirstOpenDailyReviewStageLevelId(inferredStage, input.passedLevelIds)
    : null

  return {
    currentMapLevelId: inferredMapLevelId,
    currentEntryLevelId: inferredEntryLevelId,
    currentLevelIds: uniqueStrings([inferredMapLevelId, inferredEntryLevelId]),
  }
}

function normalizeLevelId(levelId?: string | null): string | null {
  const normalized = String(levelId ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

function isDailyReviewStageComplete(stage: LessonStageProblemMenu, passedLevelIds: Set<string>) {
  const displayItems = stage.items.slice(0, 5)
  const requiredPassCount = Math.max(1, Math.min(3, displayItems.length))
  return displayItems.filter((item) => passedLevelIds.has(item.levelId)).length >= requiredPassCount
}

function getFirstOpenDailyReviewStageLevelId(stage: LessonStageProblemMenu, passedLevelIds: Set<string>) {
  const displayItems = stage.items.slice(0, 5)
  return displayItems.find((item) => !passedLevelIds.has(item.levelId))?.levelId ?? stage.items[0]?.levelId ?? null
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
