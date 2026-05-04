import { createHash } from 'node:crypto'
import type { RewardRank } from '@spcg/shared/types'
export { getDifficultyCoefficient, getLevelCoinReward, getLevelLabel } from '@spcg/shared/difficulty'

export type RankInfo = {
  rank: RewardRank
  label: string
  minCoins: number
}

export const RANKS: RankInfo[] = [
  { rank: 'bronze', label: '青铜', minCoins: 0 },
  { rank: 'silver', label: '白银', minCoins: 120 },
  { rank: 'gold', label: '黄金', minCoins: 320 },
  { rank: 'platinum', label: '铂金', minCoins: 700 },
  { rank: 'diamond', label: '钻石', minCoins: 1300 },
  { rank: 'stellar', label: '星耀', minCoins: 2200 },
]

export function getRankForCoins(coinTotal: number): RankInfo {
  return [...RANKS].reverse().find((rank) => coinTotal >= rank.minCoins) ?? RANKS[0]!
}

export function getRankLabel(rank: RewardRank): string {
  return RANKS.find((item) => item.rank === rank)?.label ?? '青铜'
}

export function generateTitle(input: { garlicBalance: number; rank: RewardRank }): string {
  const rankLabel = getRankLabel(input.rank)
  if (input.garlicBalance >= 30) return `${rankLabel}蒜力星尘守卫`
  if (input.garlicBalance >= 12) return `${rankLabel}二分星尘守卫`
  if (input.garlicBalance >= 5) return `${rankLabel}蒜粒收集家`
  return `${rankLabel}晨雾算力学徒`
}

export function pickItemForKnowledgePoint(knowledgePoint: string): string {
  if (/二分|查找|搜索/.test(knowledgePoint)) return 'binary-scope'
  if (/递归/.test(knowledgePoint)) return 'recursion-cloak'
  if (/if|分支|判断/.test(knowledgePoint)) return 'branch-badge'
  if (/循环|for|while/.test(knowledgePoint)) return 'loop-charm'
  return 'loop-charm'
}

export function deterministicGarlicDrop(input: {
  userId: string
  levelId: string
  submissionId: string
  salt?: string
}): { dropped: boolean; garlic: number; roll: number } {
  const salt = input.salt ?? process.env.REWARD_SALT ?? 'spcg-local-reward-salt'
  const hash = createHash('sha256')
    .update(`${input.userId}:${input.levelId}:${input.submissionId}:${salt}`)
    .digest('hex')
  const roll = Number.parseInt(hash.slice(0, 8), 16) % 100
  return {
    dropped: roll < 8,
    garlic: roll < 2 ? 2 : 1,
    roll,
  }
}
