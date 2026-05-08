import type { RewardRank } from './types.js'

export type RankInfo = {
  rank: RewardRank
  label: string
  minCoins: number
}

export const DEFAULT_REWARD_RANK = 'scrap_iron' satisfies RewardRank

export const REWARD_RANKS = [
  { rank: 'scrap_iron', label: '烂铁', minCoins: 0 },
  { rank: 'bronze', label: '青铜', minCoins: 72 },
  { rank: 'silver', label: '白银', minCoins: 200 },
  { rank: 'gold', label: '黄金', minCoins: 320 },
  { rank: 'platinum', label: '铂金', minCoins: 700 },
  { rank: 'diamond', label: '钻石', minCoins: 1300 },
  { rank: 'stellar', label: '星耀', minCoins: 2200 },
  { rank: 'king', label: '王者', minCoins: 3500 },
  { rank: 'master', label: '大师', minCoins: 4500 },
  { rank: 'grandmaster', label: '宗师', minCoins: 5500 },
  { rank: 'legend', label: '传奇', minCoins: 6500 },
  { rank: 'server', label: '服务器', minCoins: 8000 },
] as const satisfies readonly RankInfo[]

export function getRankForCoins(coinTotal: number): RankInfo {
  const normalizedCoins = Number.isFinite(coinTotal) ? Math.max(0, Math.floor(coinTotal)) : 0
  return [...REWARD_RANKS].reverse().find((rank) => normalizedCoins >= rank.minCoins) ?? REWARD_RANKS[0]!
}

export function getRankLabel(rank: RewardRank | string): string {
  return REWARD_RANKS.find((item) => item.rank === rank)?.label ?? REWARD_RANKS[0]!.label
}

export function generateTitle(input: { garlicBalance: number; rank: RewardRank | string }): string {
  const rankLabel = getRankLabel(input.rank)
  if (input.garlicBalance >= 30) return `${rankLabel}蒜力星尘守卫`
  if (input.garlicBalance >= 12) return `${rankLabel}二分星尘守卫`
  if (input.garlicBalance >= 5) return `${rankLabel}蒜粒收集家`
  return `${rankLabel}晨雾算力学徒`
}
