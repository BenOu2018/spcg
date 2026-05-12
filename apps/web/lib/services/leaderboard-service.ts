import type { LevelLeaderboardEntry, LevelLeaderboardSummary, SpcgLevel } from '@spcg/shared/types'
import { listGameChapters } from '@spcg/shared/game-chapters'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  getLevelLeaderboardRank,
  getLevelLeaderboardStats,
  listLevelLeaderboardEntries,
} from '@/lib/repositories/leaderboard-repository'

const DEFAULT_LEADERBOARD_LIMIT = 50

export async function getLevelLeaderboard(input: {
  spcgLevel: number
  currentUserId?: string | null
  limit?: number
}): Promise<LevelLeaderboardSummary> {
  const spcgLevel = normalizeLeaderboardLevel(input.spcgLevel)
  const chapter = getLeaderboardChapter(spcgLevel)

  if (!isDatabaseConfigured()) {
    return emptySummary(spcgLevel, chapter)
  }

  const [topEntries, stats, currentUser] = await Promise.all([
    listLevelLeaderboardEntries({ spcgLevel, limit: input.limit ?? DEFAULT_LEADERBOARD_LIMIT }),
    getLevelLeaderboardStats(spcgLevel),
    input.currentUserId ? getLevelLeaderboardRank({ spcgLevel, userId: input.currentUserId }) : Promise.resolve(null),
  ])

  return {
    spcgLevel,
    levelName: chapter.displayName,
    hudTitle: chapter.hudTitle,
    mapAsset: chapter.mapAsset,
    levelTotal: stats.totalLevels,
    totalParticipants: stats.totalParticipants,
    todayPassedCount: stats.todayPassedCount,
    totalCoins: stats.totalCoins,
    topEntries,
    podium: buildPodium(topEntries),
    currentUser,
  }
}

export function normalizeLeaderboardLevel(value: unknown): SpcgLevel {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw)
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 9) return parsed as SpcgLevel
  return 1
}

function getLeaderboardChapter(spcgLevel: SpcgLevel) {
  return listGameChapters().find((chapter) => chapter.spcgLevel === spcgLevel) ?? listGameChapters()[0]!
}

function buildPodium(entries: LevelLeaderboardEntry[]): LevelLeaderboardEntry[] {
  const byRank = new Map(entries.slice(0, 3).map((entry) => [entry.rank, entry]))
  return [byRank.get(2), byRank.get(1), byRank.get(3)].filter((entry): entry is LevelLeaderboardEntry => Boolean(entry))
}

function emptySummary(spcgLevel: SpcgLevel, chapter: ReturnType<typeof getLeaderboardChapter>): LevelLeaderboardSummary {
  return {
    spcgLevel,
    levelName: chapter.displayName,
    hudTitle: chapter.hudTitle,
    mapAsset: chapter.mapAsset,
    levelTotal: chapter.levelPlan.length,
    totalParticipants: 0,
    todayPassedCount: 0,
    totalCoins: 0,
    topEntries: [],
    podium: [],
    currentUser: null,
  }
}
