import type { RewardGrantResult } from '@spcg/shared/types'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  getUserTitleRecordBySubmissionId,
  grantRewards,
  listLedgerBySubmissionId,
  type GrantRewardInput,
} from '@/lib/repositories/reward-repository'
import {
  deterministicGarlicDrop,
  getDifficultyCoefficient,
  getLevelCoinReward,
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
