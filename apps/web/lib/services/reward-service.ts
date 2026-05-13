import type { AssessmentAttemptItem, Level, RewardGrantResult } from '@spcg/shared/types'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  getUserTitleRecordBySubmissionId,
  grantRewards,
  listLedgerByAttemptId,
  listLedgerBySubmissionId,
  type GrantRewardInput,
} from '@/lib/repositories/reward-repository'
import {
  DAILY_REVIEW_COIN_PER_ACCEPTED,
  RANKED_ASSESSMENT_AK_COIN_BONUS,
  deterministicGarlicDrop,
  getDailyReviewCoinReward,
  getDifficultyCoefficient,
  getLevelCoinReward,
  getRankedAssessmentQuestionCoinReward,
  pickItemForKnowledgePoint,
} from '@/lib/reward-rules'
import { ServiceError } from '@/lib/services/errors'

export async function getRewardSummaryForSubmission(input: {
  userId?: string | null
  submissionId: string
}): Promise<RewardGrantResult | null> {
  if (!input.userId || !isDatabaseConfigured()) return null
  const ledger = await listLedgerBySubmissionId(input.userId, input.submissionId)
  if (ledger.length === 0) return null
  const titleRecord = await getUserTitleRecordBySubmissionId(input.userId, input.submissionId)
  const titleAward = titleRecord
    ? {
        titleKey: titleRecord.titleKey,
        titleLabel: titleRecord.titleLabel,
        rankAtAward: titleRecord.rankAtAward,
        poolKey: titleRecord.poolKey,
        levelId: titleRecord.levelId,
        submissionId: titleRecord.submissionId,
        awardedAt: titleRecord.awardedAt,
      }
    : ((ledger[ledger.length - 1]?.metadata.titleAward as RewardGrantResult['titleAward']) ?? null)

  return {
    coinDelta: ledger.reduce((sum, entry) => sum + entry.coinDelta, 0),
    garlicDelta: ledger.reduce((sum, entry) => sum + entry.garlicDelta, 0),
    items: readKnowledgeItemsFromLedger(ledger).concat(
      ledger
        .filter((entry) => entry.itemId && entry.itemQuantity > 0)
        .map((entry) => ({
          itemId: entry.itemId!,
          name: String(entry.metadata.itemName ?? entry.itemId),
          quantity: entry.itemQuantity,
        })),
    ),
    rankBefore: (ledger[0]?.metadata.rankBefore as RewardGrantResult['rankBefore']) ?? 'scrap_iron',
    rankAfter: (ledger[ledger.length - 1]?.metadata.rankAfter as RewardGrantResult['rankAfter']) ?? 'scrap_iron',
    title: titleAward?.titleLabel ?? String(ledger[ledger.length - 1]?.metadata.title ?? ''),
    titleAward,
    ledgerIds: ledger.map((entry) => entry.id),
  }
}

export async function grantAcceptedSubmissionReward(input: {
  userId: string
  levelId: string
  submissionId: string
  spcgLevel: number
  stars: number
  knowledgePoint: string
}): Promise<RewardGrantResult> {
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  return grantAcceptedSubmissionRewardWithRepository(input)
}

export async function grantAcceptedSubmissionRewardWithRepository(input: {
  userId: string
  levelId: string
  submissionId: string
  spcgLevel: number
  stars: number
  knowledgePoint: string
}): Promise<RewardGrantResult> {
  const difficulty = { spcgLevel: input.spcgLevel, stars: input.stars }
  const difficultyCoefficient = getDifficultyCoefficient(difficulty)
  const coinReward = getLevelCoinReward(difficulty)
  const itemId = pickItemForKnowledgePoint(input.knowledgePoint)
  const drop = deterministicGarlicDrop(input)
  const rewards: GrantRewardInput[] = [
    {
      userId: input.userId,
      source: 'level_first_ac',
      sourceRef: input.levelId,
      coinDelta: coinReward,
      itemId,
      itemQuantity: 1,
      metadata: {
        levelId: input.levelId,
        submissionId: input.submissionId,
        knowledgePoint: input.knowledgePoint,
        spcgLevel: input.spcgLevel,
        stars: input.stars,
        difficultyCoefficient,
      },
    },
  ]

  if (drop.dropped) {
    rewards.push({
      userId: input.userId,
      source: 'hidden_garlic_drop',
      sourceRef: input.levelId,
      garlicDelta: drop.garlic,
      metadata: {
        levelId: input.levelId,
        submissionId: input.submissionId,
        roll: drop.roll,
      },
    })
  }

  return grantRewards(rewards)
}

function readKnowledgeItemsFromLedger(
  ledger: Awaited<ReturnType<typeof listLedgerBySubmissionId>>,
): RewardGrantResult['items'] {
  const items: RewardGrantResult['items'] = []
  for (const entry of ledger) {
    const rawItems = entry.metadata.knowledgeItems
    if (!Array.isArray(rawItems)) continue
    for (const rawItem of rawItems) {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue
      const record = rawItem as Record<string, unknown>
      const itemId = typeof record.itemId === 'string' ? record.itemId : typeof record.tagId === 'string' ? record.tagId : ''
      const name = typeof record.name === 'string' ? record.name : typeof record.zhName === 'string' ? record.zhName : itemId
      const quantity = typeof record.quantity === 'number' ? record.quantity : 1
      if (!itemId || quantity <= 0) continue
      items.push({ itemId, name, quantity })
    }
  }
  return items
}

export async function grantAssessmentReward(input: {
  userId: string
  attemptId: string
  coinReward: number
  garlicReward: number
  acceptedCount: number
  totalCount: number
}): Promise<RewardGrantResult> {
  const rewards: GrantRewardInput[] = []
  if (input.coinReward > 0 || input.garlicReward > 0) {
    rewards.push({
      userId: input.userId,
      source: 'assessment_complete',
      sourceRef: input.attemptId,
      coinDelta: input.coinReward,
      garlicDelta: input.garlicReward,
      itemId: input.garlicReward > 0 ? 'exam-garlic-core' : null,
      itemQuantity: input.garlicReward > 0 ? 1 : 0,
      metadata: {
        attemptId: input.attemptId,
        acceptedCount: input.acceptedCount,
        totalCount: input.totalCount,
      },
    })
  }

  if (input.acceptedCount === input.totalCount && input.totalCount > 0) {
    rewards.push({
      userId: input.userId,
      source: 'assessment_rank_bonus',
      sourceRef: input.attemptId,
      garlicDelta: 1,
      metadata: {
        attemptId: input.attemptId,
        reason: 'perfect_score',
      },
    })
  }

  return grantRewards(rewards)
}

export async function grantDailyReviewReward(input: {
  userId: string
  attemptId: string
  acceptedCount: number
  totalCount: number
  spcgLevelRewards: Array<{
    spcgLevel: number
    acceptedCount: number
  }>
}): Promise<RewardGrantResult> {
  const rewards = input.spcgLevelRewards
    .filter((group) => group.acceptedCount > 0)
    .map((group, index): GrantRewardInput => ({
      userId: input.userId,
      source: 'daily_review_complete',
      sourceRef: index === 0 ? input.attemptId : `${input.attemptId}:${group.spcgLevel}`,
      coinDelta: getDailyReviewCoinReward(group.acceptedCount),
      metadata: {
        attemptId: input.attemptId,
        acceptedCount: group.acceptedCount,
        totalCount: input.totalCount,
        spcgLevel: group.spcgLevel,
        coinPerAccepted: DAILY_REVIEW_COIN_PER_ACCEPTED,
        leaderboardQuestionCount: group.acceptedCount,
      },
    }))

  const reward = await grantRewards(rewards)

  if (reward.ledgerIds.length > 0) return reward

  const ledger = await listLedgerByAttemptId(input.userId, input.attemptId)
  if (ledger.length === 0) return reward

  return {
    coinDelta: ledger.reduce((sum, entry) => sum + entry.coinDelta, 0),
    garlicDelta: ledger.reduce((sum, entry) => sum + entry.garlicDelta, 0),
    items: [],
    rankBefore: (ledger[0]?.metadata.rankBefore as RewardGrantResult['rankBefore']) ?? reward.rankBefore,
    rankAfter: (ledger[ledger.length - 1]?.metadata.rankAfter as RewardGrantResult['rankAfter']) ?? reward.rankAfter,
    title: String(ledger[ledger.length - 1]?.metadata.title ?? reward.title),
    titleAward: (ledger[ledger.length - 1]?.metadata.titleAward as RewardGrantResult['titleAward']) ?? null,
    ledgerIds: ledger.map((entry) => entry.id),
  }
}

export async function grantRankedAssessmentReward(input: {
  userId: string
  attemptId: string
  items: AssessmentAttemptItem[]
  levels: Level[]
  acceptedCount: number
  totalCount: number
}): Promise<RewardGrantResult> {
  const levelsById = new Map(input.levels.map((level) => [level.id, level]))
  const rewards: GrantRewardInput[] = []

  for (const item of input.items) {
    const level = levelsById.get(item.levelId)
    if (!level) continue
    const difficulty = {
      spcgLevel: level.difficulty.spcgLevel,
      stars: level.difficulty.stars,
    }
    const difficultyCoefficient = getDifficultyCoefficient(difficulty)
    const coinReward = getRankedAssessmentQuestionCoinReward({
      ...difficulty,
      score: item.score,
      maxScore: item.maxScore,
    })
    if (coinReward <= 0) continue

    rewards.push({
      userId: input.userId,
      source: 'assessment_complete',
      sourceRef: `${input.attemptId}:${item.levelId}`,
      coinDelta: coinReward,
      metadata: {
        attemptId: input.attemptId,
        levelId: item.levelId,
        spcgLevel: difficulty.spcgLevel,
        stars: difficulty.stars,
        score: item.score,
        maxScore: item.maxScore,
        scoreRatio: item.maxScore > 0 ? Math.max(0, Math.min(1, item.score / item.maxScore)) : 0,
        difficultyCoefficient,
        leaderboardQuestionCount: 1,
      },
    })
  }

  if (input.acceptedCount === input.totalCount && input.totalCount > 0) {
    const spcgLevel = input.levels[0]?.difficulty.spcgLevel ?? 1
    rewards.push({
      userId: input.userId,
      source: 'assessment_rank_bonus',
      sourceRef: input.attemptId,
      coinDelta: RANKED_ASSESSMENT_AK_COIN_BONUS,
      metadata: {
        attemptId: input.attemptId,
        spcgLevel,
        reason: 'ranked_assessment_ak',
        leaderboardQuestionCount: 0,
      },
    })
  }

  const reward = await grantRewards(rewards)

  if (reward.ledgerIds.length > 0) return reward

  const ledger = await listLedgerByAttemptId(input.userId, input.attemptId)
  if (ledger.length === 0) return reward

  return {
    coinDelta: ledger.reduce((sum, entry) => sum + entry.coinDelta, 0),
    garlicDelta: ledger.reduce((sum, entry) => sum + entry.garlicDelta, 0),
    items: [],
    rankBefore: (ledger[0]?.metadata.rankBefore as RewardGrantResult['rankBefore']) ?? reward.rankBefore,
    rankAfter: (ledger[ledger.length - 1]?.metadata.rankAfter as RewardGrantResult['rankAfter']) ?? reward.rankAfter,
    title: String(ledger[ledger.length - 1]?.metadata.title ?? reward.title),
    titleAward: (ledger[ledger.length - 1]?.metadata.titleAward as RewardGrantResult['titleAward']) ?? null,
    ledgerIds: ledger.map((entry) => entry.id),
  }
}
