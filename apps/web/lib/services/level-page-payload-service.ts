import type { Session } from 'next-auth'
import { createCacheableLevelPagePayload, type LevelPagePayload, type LevelPagePayloadInput } from '@/lib/level-page-payload'
import { getProgrammingLevelPageDataForUser } from '@/lib/level-data'
import { getCanShowPricingMenu } from '@/lib/services/account-menu-service'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

export type LevelPageLoadResult =
  | { status: 'ok'; cachePayload: LevelPagePayload; viewPayload: LevelPagePayloadInput }
  | { status: 'not-found' }
  | { status: 'redirect'; href: string }
  | { status: 'upgrade-required'; reason: string }

export async function getLevelPagePayloadForSession(input: {
  explicitStageSelection: boolean
  levelId: string
  session: Session
}): Promise<LevelPageLoadResult> {
  const [uiLocale, canShowPricingMenu, levelData] = await Promise.all([
    getRequestUiLocale(input.session.user.id),
    getCanShowPricingMenu(input.session.user.id),
    getProgrammingLevelPageDataForUser(input.session.user.id, input.levelId),
  ])
  const messages = getStudentUiMessages(uiLocale)
  const { level, levels, progressRecords, stageMenu, stageLevels, access, hintsAccess } = levelData

  if (!level) return { status: 'not-found' }
  if (!access) return { status: 'redirect', href: '/map' }
  if (!access.allowed) {
    if (access.upgradeRequired) {
      return { status: 'upgrade-required', reason: access.reason ?? '当前用户类型无法访问该关卡。' }
    }
    return { status: 'redirect', href: access.redirectLevelId ? `/level/${access.redirectLevelId}` : '/map' }
  }

  const passedLevelIds = new Set(progressRecords.filter((progress) => progress.passed).map((progress) => progress.levelId))
  const nextStageLevelId = getProgressAwareStageLevelId({
    currentLevelId: level.id,
    passedLevelIds,
    stageItems: stageMenu?.items ?? null,
  })
  const isCurrentStudyStage =
    stageMenu?.items.some((item) => item.levelId === access.currentMapLevelId || item.levelId === access.currentEntryLevelId) ??
    false

  if (
    !access.canFreeJump &&
    isCurrentStudyStage &&
    !input.explicitStageSelection &&
    nextStageLevelId &&
    nextStageLevelId !== level.id
  ) {
    return { status: 'redirect', href: `/level/${nextStageLevelId}` }
  }

  const displayLevel = hintsAccess?.allowed ? level : { ...level, hints: [] }
  const displayStageLevels = hintsAccess?.allowed ? stageLevels : stageLevels.map((item) => ({ ...item, hints: [] }))
  const viewPayload: LevelPagePayloadInput = {
    userId: input.session.user.id,
    levelId: displayLevel.id,
    uiLocale,
    level: displayLevel,
    levels,
    stageLevels: displayStageLevels,
    session: input.session,
    stageMenu,
    progressRecords,
    canViewHints: hintsAccess?.allowed ?? false,
    hintsUpgradeMessage: hintsAccess?.reason ?? undefined,
    messages,
    canShowPricingMenu,
    canFreeJump: access.canFreeJump,
  }

  return {
    status: 'ok',
    viewPayload,
    cachePayload: createCacheableLevelPagePayload(viewPayload),
  }
}

type StageMenuItem = NonNullable<Awaited<ReturnType<typeof getProgrammingLevelPageDataForUser>>['stageMenu']>['items'][number]

function getProgressAwareStageLevelId({
  currentLevelId,
  passedLevelIds,
  stageItems,
}: {
  currentLevelId: string
  passedLevelIds: Set<string>
  stageItems: StageMenuItem[] | null
}) {
  if (!stageItems || stageItems.length === 0) return null

  const orderedItems = stageItems.slice().sort((a, b) => a.position - b.position).slice(0, 5)
  const currentItem = orderedItems.find((item) => item.levelId === currentLevelId)
  if (!currentItem || !passedLevelIds.has(currentItem.levelId)) return null

  return orderedItems.find((item) => !passedLevelIds.has(item.levelId))?.levelId ?? null
}
