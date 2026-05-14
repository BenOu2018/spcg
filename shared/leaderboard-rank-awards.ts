import type { InventoryRarity } from './types.js'

export type LeaderboardRankAward = {
  itemId: string
  label: string
  description: string
  threshold: 1 | 3 | 6
  rarity: InventoryRarity
  icon: string
}

export const LEADERBOARD_RANK_AWARDS = [
  {
    itemId: 'leaderboard-top-six',
    label: '老六',
    description: '进入本级挑战榜前六时获得的排名荣誉物品。',
    threshold: 6,
    rarity: 'rare',
    icon: '/assets/art/ui/rewards/leaderboard-top-six.svg',
  },
  {
    itemId: 'leaderboard-top-three',
    label: '上榜',
    description: '进入本级挑战榜前三时获得的排名荣誉物品。',
    threshold: 3,
    rarity: 'epic',
    icon: '/assets/art/ui/rewards/leaderboard-top-three.svg',
  },
  {
    itemId: 'leaderboard-champion',
    label: '霸榜',
    description: '获得本级挑战榜第一时获得的最高排名荣誉物品。',
    threshold: 1,
    rarity: 'legendary',
    icon: '/assets/art/ui/rewards/leaderboard-champion.svg',
  },
] as const satisfies readonly LeaderboardRankAward[]

export const LEADERBOARD_RANK_AWARD_MIN_PARTICIPANTS = 10

export function getLeaderboardRankAwards(rank: number): LeaderboardRankAward[] {
  if (!Number.isInteger(rank) || rank <= 0) return []
  return LEADERBOARD_RANK_AWARDS.filter((award) => rank <= award.threshold)
}

export function canGrantLeaderboardRankAwards(totalParticipants: number): boolean {
  return Number.isInteger(totalParticipants) && totalParticipants >= LEADERBOARD_RANK_AWARD_MIN_PARTICIPANTS
}

export function getEligibleLeaderboardRankAwards(rank: number, totalParticipants: number): LeaderboardRankAward[] {
  if (!canGrantLeaderboardRankAwards(totalParticipants)) return []
  return getLeaderboardRankAwards(rank)
}

export function isLeaderboardRankAwardItemId(itemId: string): boolean {
  return LEADERBOARD_RANK_AWARDS.some((award) => award.itemId === itemId)
}
