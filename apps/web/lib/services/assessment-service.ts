import { createHash } from 'node:crypto'
import {
  RANKED_ASSESSMENT_RULES,
  buildRankedAssessmentTitle,
} from '@spcg/shared/ranked-assessment'
import type { AssessmentAttempt, AssessmentAttemptItem, AssessmentSession, Level, RewardGrantResult } from '@spcg/shared/types'
import {
  countAcceptedLevelsSince,
  createAssessmentAttempt,
  finishAssessmentAttempt,
  getAssessmentAttemptForUser,
  getAssessmentAttemptItems,
  getLatestAssessmentAttemptForUserSession,
  getAssessmentSession,
  getOrCreateRankedAssessmentPaper,
  hasPriorCompletedAssessmentAttemptForSameSessionWithinDay,
  isAssessmentAttemptLevelForUser,
  listAssessmentAttemptLevels,
  listRankedAssessmentAttemptsForUser,
  listRankedAssessmentCandidates,
  queueFinalAssessmentSubmissions,
  refreshAssessmentAttemptScore,
  setAssessmentAttemptReward,
  type RankedAssessmentHistoryItem,
} from '@/lib/repositories/assessment-repository'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  RANKED_ASSESSMENT_VIDEO_MONITOR_COIN_BONUS,
  grantAssessmentReward,
  grantRankedAssessmentReward,
} from '@/lib/services/reward-service'
import { ServiceError } from '@/lib/services/errors'
import { formatStudentDateKey } from '@/lib/student-date'
import {
  getFeatureAccess,
  getRankedAssessmentAccess,
  type RankedAssessmentAccessDecision,
} from '@/lib/services/entitlement-service'

export type RankedAssessmentStartResult = {
  attempt: AssessmentAttempt
  session: AssessmentSession
  levels: Level[]
  items: AssessmentAttemptItem[]
  access: RankedAssessmentAccessDecision
}

export type RankedAssessmentDetail = {
  attempt: AssessmentAttempt
  levels: Level[]
  items: AssessmentAttemptItem[]
  access: RankedAssessmentAccessDecision
}

export type { RankedAssessmentHistoryItem }

export async function startAssessmentAttempt(input: {
  userId?: string | null
  sessionId: string
  totalCount: number
}): Promise<AssessmentAttempt> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)

  const session = await getAssessmentSession(input.sessionId)
  if (!session || session.status !== 'published') {
    throw new ServiceError('not_found', 'Assessment session not found.', 404)
  }

  return createAssessmentAttempt({
    userId: input.userId,
    sessionId: session.id,
    totalCount: input.totalCount,
  })
}

export async function startRankedAssessmentAttempt(input: {
  userId?: string | null
  spcgLevel: number
  durationSeconds: number
  videoMonitorEnabled?: boolean
}): Promise<RankedAssessmentStartResult> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  if (![3600, 7200, 10800].includes(input.durationSeconds)) {
    throw new ServiceError('bad_request', '考试时间只能选择 1 小时、2 小时或 3 小时。', 400)
  }
  const access = await getRankedAssessmentAccess({
    userId: input.userId,
    spcgLevel: input.spcgLevel,
  })
  if (!access.allowed) throw new ServiceError('forbidden', access.reason ?? '当前用户类型无法参加该级别段位赛。', 403)

  const dateKey = formatStudentDateKey()
  const candidates = await listRankedAssessmentCandidates({ spcgLevel: input.spcgLevel })
  const paperItems = buildRankedPaperItems(candidates, `${input.spcgLevel}:${dateKey}`)
  const paper = await getOrCreateRankedAssessmentPaper({
    spcgLevel: input.spcgLevel,
    dateKey,
    title: buildRankedAssessmentTitle(input.spcgLevel, dateKey),
    items: paperItems,
  })
  const existingAttempt = await getLatestAssessmentAttemptForUserSession({
    userId: input.userId,
    sessionId: paper.session.id,
  })

  if (existingAttempt && isActiveAssessmentAttempt(existingAttempt)) {
    if (existingAttempt.status === 'scoring') {
      await refreshAssessmentAttemptScore({ attemptId: existingAttempt.id })
    }
    const refreshedAttempt =
      existingAttempt.status === 'scoring'
        ? (await getAssessmentAttemptForUser({ userId: input.userId, attemptId: existingAttempt.id })) ?? existingAttempt
        : existingAttempt
    const rewardedAttempt = await grantRankedAssessmentRewardIfReady({
      userId: input.userId,
      attempt: refreshedAttempt,
    })
    return {
      attempt: rewardedAttempt,
      session: paper.session,
      levels: await maskLevelHintsForUser(input.userId, await listAssessmentAttemptLevels({ userId: input.userId, attemptId: existingAttempt.id })),
      items: await getAssessmentAttemptItems({ userId: input.userId, attemptId: existingAttempt.id }),
      access,
    }
  }

  const attempt = await createAssessmentAttempt({
    userId: input.userId,
    sessionId: paper.session.id,
    totalCount: paper.items.length,
    durationSeconds: input.durationSeconds,
    videoMonitorEnabled: input.videoMonitorEnabled,
    items: paper.items,
  })

  return {
    attempt,
    session: paper.session,
    levels: await maskLevelHintsForUser(input.userId, paper.levels),
    items: await getAssessmentAttemptItems({ userId: input.userId, attemptId: attempt.id }),
    access,
  }
}

export async function getCurrentRankedAssessmentAttempt(input: {
  userId?: string | null
  spcgLevel: number
}): Promise<RankedAssessmentDetail | null> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)

  const dateKey = formatStudentDateKey()
  const access = await getRankedAssessmentAccess({
    userId: input.userId,
    spcgLevel: input.spcgLevel,
  })
  if (!access.allowed) throw new ServiceError('forbidden', access.reason ?? '当前用户类型无法参加该级别段位赛。', 403)

  const sessionId = buildRankedSessionId(input.spcgLevel, dateKey)
  const attempt = await getLatestAssessmentAttemptForUserSession({
    userId: input.userId,
    sessionId,
  })
  if (!attempt || !isActiveAssessmentAttempt(attempt)) return null

  if (attempt.status === 'scoring') {
    await refreshAssessmentAttemptScore({ attemptId: attempt.id })
  }

  const refreshedAttempt =
    attempt.status === 'scoring'
      ? (await getAssessmentAttemptForUser({ userId: input.userId, attemptId: attempt.id })) ?? attempt
      : attempt
  const rewardedAttempt = await grantRankedAssessmentRewardIfReady({
    userId: input.userId,
    attempt: refreshedAttempt,
  })

  return {
    attempt: rewardedAttempt,
    levels: await maskLevelHintsForUser(input.userId, await listAssessmentAttemptLevels({ userId: input.userId, attemptId: attempt.id })),
    items: await getAssessmentAttemptItems({ userId: input.userId, attemptId: attempt.id }),
    access,
  }
}

export async function listRankedAssessmentHistoryForUser(input: {
  userId?: string | null
  limit?: number
  spcgLevel?: number | null
}): Promise<RankedAssessmentHistoryItem[]> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)

  return listRankedAssessmentAttemptsForUser({
    userId: input.userId,
    limit: input.limit ?? 20,
    spcgLevel: input.spcgLevel ?? null,
  })
}

export async function getRankedAssessmentDetail(input: {
  userId?: string | null
  attemptId: string
}): Promise<RankedAssessmentDetail> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)

  const attempt = await getAssessmentAttemptForUser({ userId: input.userId, attemptId: input.attemptId })
  if (!attempt) throw new ServiceError('not_found', '考试记录不存在。', 404)
  const session = await getAssessmentSession(attempt.sessionId)
  const spcgLevel = getRankedSpcgLevelFromSession(attempt.sessionId, session?.title ?? '')
  const access = await getRankedAssessmentAccess({
    userId: input.userId,
    spcgLevel,
  })
  if (!access.allowed) throw new ServiceError('forbidden', access.reason ?? '当前用户类型无法查看该段位赛。', 403)
  if (attempt.status === 'scoring') {
    await refreshAssessmentAttemptScore({ attemptId: attempt.id })
  }

  const refreshedAttempt =
    attempt.status === 'scoring'
      ? (await getAssessmentAttemptForUser({ userId: input.userId, attemptId: input.attemptId })) ?? attempt
      : attempt
  const rewardedAttempt = await grantRankedAssessmentRewardIfReady({
    userId: input.userId,
    attempt: refreshedAttempt,
  })

  return {
    attempt: rewardedAttempt,
    levels: await maskLevelHintsForUser(input.userId, await listAssessmentAttemptLevels({ userId: input.userId, attemptId: input.attemptId })),
    items: await getAssessmentAttemptItems({ userId: input.userId, attemptId: input.attemptId }),
    access,
  }
}

export async function canUserRunAssessmentLevel(input: {
  userId?: string | null
  attemptId: string
  levelId: string
}): Promise<boolean> {
  if (!input.userId) return false
  if (!isDatabaseConfigured()) return false

  const inAttempt = await isAssessmentAttemptLevelForUser({
    userId: input.userId,
    attemptId: input.attemptId,
    levelId: input.levelId,
  })
  if (!inAttempt) return false

  const attempt = await getAssessmentAttemptForUser({ userId: input.userId, attemptId: input.attemptId })
  if (!attempt) return false
  if (!attempt.sessionId.startsWith('ranked-spcg')) return true
  const session = await getAssessmentSession(attempt.sessionId)
  const spcgLevel = getRankedSpcgLevelFromSession(attempt.sessionId, session?.title ?? '')
  const access = await getRankedAssessmentAccess({
    userId: input.userId,
    spcgLevel,
  })
  if (!access.allowed) return false
  const items = await getAssessmentAttemptItems({ userId: input.userId, attemptId: input.attemptId })
  const item = items.find((entry) => entry.levelId === input.levelId)
  return Boolean(item && item.position <= access.visibleQuestionCount)
}

export async function finishUserAssessmentAttempt(input: {
  userId?: string | null
  attemptId: string
  totalCount: number
  expired?: boolean
}): Promise<AssessmentAttempt> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)

  const attempt = await getAssessmentAttemptForUser({
    userId: input.userId,
    attemptId: input.attemptId,
  })
  if (!attempt) throw new ServiceError('not_found', 'Assessment attempt not found.', 404)

  if (attempt.status !== 'in_progress') return attempt

  const session = await getAssessmentSession(attempt.sessionId)
  if (!session) throw new ServiceError('not_found', 'Assessment session not found.', 404)

  const acceptedCount = await countAcceptedLevelsSince({
    userId: input.userId,
    since: attempt.startedAt,
  })
  const totalCount = Math.max(1, input.totalCount || attempt.totalCount)
  const score = Math.round((Math.min(acceptedCount, totalCount) / totalCount) * 100)
  const ratio = Math.min(1, acceptedCount / totalCount)
  const reward = await grantAssessmentReward({
    userId: input.userId,
    attemptId: attempt.id,
    coinReward: Math.round(session.coinReward * ratio),
    garlicReward: acceptedCount > 0 ? Math.max(1, Math.round(session.garlicReward * ratio)) : 0,
    acceptedCount,
    totalCount,
  })

  return finishAssessmentAttempt({
    userId: input.userId,
    attemptId: input.attemptId,
    status: input.expired ? 'expired' : 'completed',
    score,
    acceptedCount,
    totalCount,
    reward,
  })
}

export async function finishRankedAssessmentAttempt(input: {
  userId?: string | null
  attemptId: string
  expired?: boolean
}): Promise<AssessmentAttempt> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)

  const attempt = await queueFinalAssessmentSubmissions({
    userId: input.userId,
    attemptId: input.attemptId,
    expired: input.expired,
  })

  return grantRankedAssessmentRewardIfReady({
    userId: input.userId,
    attempt,
  })
}

async function grantRankedAssessmentRewardIfReady(input: {
  userId: string
  attempt: AssessmentAttempt
}): Promise<AssessmentAttempt> {
  if (!['completed', 'expired'].includes(input.attempt.status)) return input.attempt
  if ((input.attempt.reward?.ledgerIds?.length ?? 0) > 0) return input.attempt

  const hasPriorRewardAttempt = await hasPriorCompletedAssessmentAttemptForSameSessionWithinDay({
    userId: input.userId,
    attemptId: input.attempt.id,
    sessionId: input.attempt.sessionId,
  })

  if (hasPriorRewardAttempt) {
    const reward = buildEmptyRankedAssessmentReward(input.attempt)
    await setAssessmentAttemptReward({
      userId: input.userId,
      attemptId: input.attempt.id,
      reward,
    })

    return (await getAssessmentAttemptForUser({ userId: input.userId, attemptId: input.attempt.id })) ?? {
      ...input.attempt,
      reward,
    }
  }

  const [items, levels] = await Promise.all([
    getAssessmentAttemptItems({ userId: input.userId, attemptId: input.attempt.id }),
    listAssessmentAttemptLevels({ userId: input.userId, attemptId: input.attempt.id }),
  ])
  const reward = await grantRankedAssessmentReward({
    userId: input.userId,
    attemptId: input.attempt.id,
    items,
    levels,
    acceptedCount: input.attempt.acceptedCount,
    totalCount: input.attempt.totalCount,
    videoMonitorBonusCoins: getVideoMonitorBonusCoins(input.attempt),
  })

  await setAssessmentAttemptReward({
    userId: input.userId,
    attemptId: input.attempt.id,
    reward,
  })

  return (await getAssessmentAttemptForUser({ userId: input.userId, attemptId: input.attempt.id })) ?? {
    ...input.attempt,
    reward,
  }
}

function buildEmptyRankedAssessmentReward(attempt: AssessmentAttempt): RewardGrantResult {
  const rank = attempt.reward?.rankBefore ?? attempt.reward?.rankAfter ?? 'scrap_iron'
  return {
    coinDelta: 0,
    garlicDelta: 0,
    items: [],
    rankBefore: rank,
    rankAfter: rank,
    title: attempt.reward?.title ?? '',
    titleAward: attempt.reward?.titleAward ?? null,
    ledgerIds: [],
  }
}

function getVideoMonitorBonusCoins(attempt: AssessmentAttempt): number {
  const videoMonitor = attempt.metadata.videoMonitor
  if (!videoMonitor?.enabled) return 0
  const bonusCoins = typeof videoMonitor.bonusCoins === 'number' ? videoMonitor.bonusCoins : RANKED_ASSESSMENT_VIDEO_MONITOR_COIN_BONUS
  return Math.max(0, Math.floor(bonusCoins))
}

type RankedCandidate = Awaited<ReturnType<typeof listRankedAssessmentCandidates>>[number]

function buildRankedPaperItems(candidates: RankedCandidate[], seed: string) {
  const used = new Set<string>()
  const pickedByRule = RANKED_ASSESSMENT_RULES.map((rule) => ({
    rule,
    picked: pickCandidates(
      candidates,
      seed,
      (item) =>
        item.source === rule.source &&
        (rule.source === 'exam-only' || item.display_mode === rule.candidateMode),
      rule.count,
      used,
    ),
  }))

  const missing = pickedByRule.filter((group) => group.picked.length < group.rule.count)
  if (missing.length > 0) {
    const requirement = RANKED_ASSESSMENT_RULES.map((rule) => `${rule.count} 道${formatRuleLabel(rule)}`).join('、')
    const availability = pickedByRule
      .map((group) => `${formatRuleLabel(group.rule)} ${group.picked.length}/${group.rule.count}`)
      .join('，')
    throw new ServiceError(
      'bad_request',
      `段位赛题源不足：需要 ${requirement}；当前可用 ${availability}。请管理员补齐题单。`,
      400,
    )
  }

  return pickedByRule.flatMap(({ rule, picked }) =>
    picked.map((item) => ({
      levelId: item.level_id,
      displayMode: rule.outputMode,
      source: rule.source,
      maxScore: rule.maxScore,
    })),
  )
}

function formatRuleLabel(rule: (typeof RANKED_ASSESSMENT_RULES)[number]): string {
  if (rule.source === 'exam-only') {
    return rule.outputMode === 'challenge' ? '考试专用挑战题' : '考试专用提高题'
  }
  if (rule.outputMode === 'basic') return '基础题'
  if (rule.outputMode === 'variant') return '变式题'
  return rule.outputMode
}

function pickCandidates(
  candidates: RankedCandidate[],
  seed: string,
  predicate: (candidate: RankedCandidate) => boolean,
  count: number,
  used: Set<string>,
): RankedCandidate[] {
  const picked = candidates
    .filter((candidate) => predicate(candidate) && !used.has(candidate.level_id))
    .sort((left, right) => stableHash(`${seed}:${left.level_id}`).localeCompare(stableHash(`${seed}:${right.level_id}`)))
    .slice(0, count)

  for (const item of picked) used.add(item.level_id)
  return picked
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function isActiveAssessmentAttempt(attempt: AssessmentAttempt): boolean {
  return attempt.status === 'in_progress' || attempt.status === 'scoring'
}

function buildRankedSessionId(spcgLevel: number, dateKey: string): string {
  return `ranked-spcg${spcgLevel}-${dateKey}`
}

function getRankedSpcgLevelFromSession(sessionId: string, title: string): number {
  const fromId = /^ranked-spcg(\d+)-/.exec(sessionId)?.[1]
  if (fromId) return Number(fromId)
  const fromTitle = /SPCG\s*(\d+)级/.exec(title)?.[1]
  return fromTitle ? Number(fromTitle) : 1
}

async function maskLevelHintsForUser(userId: string, levels: Level[]): Promise<Level[]> {
  const hintsAccess = await getFeatureAccess({ userId, feature: 'hints' })
  if (hintsAccess.allowed) return levels
  return levels.map((level) => ({ ...level, hints: [] }))
}
