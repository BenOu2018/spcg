import { createHash } from 'node:crypto'
export { getDifficultyCoefficient, getLevelCoinReward, getLevelLabel } from '@spcg/shared/difficulty'
export {
  DEFAULT_REWARD_RANK,
  generateTitle,
  getRankForCoins,
  getRankLabel,
  REWARD_RANKS,
  REWARD_RANKS as RANKS,
} from '@spcg/shared/reward-ranks'
export type { RankInfo } from '@spcg/shared/reward-ranks'

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
