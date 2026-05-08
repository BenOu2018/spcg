import {
  ADMIN_OVERVIEW_VERDICT_RESULTS,
  getAdminOverviewDailyStats,
  listStuckProblemRank,
  type AdminOverviewVerdictResult,
  type AdminOverviewDailyStats,
  type StuckProblemRankItem,
} from '@/lib/repositories/admin-overview-repository'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import { getJudgeQueueStats, type JudgeQueueStats } from '@/lib/repositories/submission-repository'
import { getRecentSystemErrorLogs } from '@/lib/services/system-error-log-service'
import { logSystemError } from '@/lib/services/system-error-log-service'
import { getServerMetrics, type ServerMetrics } from '@/lib/services/server-metrics-service'
import type { SystemErrorLogRecord } from '@/lib/repositories/system-error-log-repository'

export { ADMIN_OVERVIEW_VERDICT_RESULTS }
export type { AdminOverviewVerdictResult }

export type AdminOverview = {
  serverMetrics: ServerMetrics
  dailyStats: AdminOverviewDailyStats
  judgeQueue: JudgeQueueStats
  systemErrors: SystemErrorLogRecord[]
  stuckProblems: StuckProblemRankItem[]
}

const EMPTY_DAILY_STATS: AdminOverviewDailyStats = {
  activeUsersToday: 0,
  submissionsToday: 0,
  averageJudgeSeconds: 0,
  verdictCounts: ADMIN_OVERVIEW_VERDICT_RESULTS.reduce(
    (counts, result) => {
      counts[result] = 0
      return counts
    },
    {} as AdminOverviewDailyStats['verdictCounts'],
  ),
}

const EMPTY_QUEUE_STATS: JudgeQueueStats = {
  pendingCount: 0,
  judgingCount: 0,
  averagePendingWaitSeconds: 0,
  recentFailureRate: 0,
  recentDoneCount: 0,
  recentErrorCount: 0,
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const [serverMetrics, dailyStats, judgeQueue, systemErrors, stuckProblems] = await Promise.all([
    safeRead('admin-overview.serverMetrics', () => getServerMetrics(), fallbackServerMetrics()),
    readDatabaseMetric('admin-overview.dailyStats', () => getAdminOverviewDailyStats(), EMPTY_DAILY_STATS),
    readDatabaseMetric('admin-overview.judgeQueue', () => getJudgeQueueStats(), EMPTY_QUEUE_STATS),
    readDatabaseMetric('admin-overview.systemErrors', () => getRecentSystemErrorLogs(50), []),
    readDatabaseMetric('admin-overview.stuckProblems', () => listStuckProblemRank(10), []),
  ])

  return {
    serverMetrics,
    dailyStats,
    judgeQueue,
    systemErrors,
    stuckProblems,
  }
}

async function readDatabaseMetric<T>(source: string, task: () => Promise<T>, fallback: T): Promise<T> {
  if (!isDatabaseConfigured()) return fallback
  return safeRead(source, task, fallback)
}

async function safeRead<T>(source: string, task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task()
  } catch (error) {
    await logSystemError({ source, error })
    return fallback
  }
}

function fallbackServerMetrics(): ServerMetrics {
  const unavailable = {
    available: false,
    value: null,
    label: '-',
    detail: 'unavailable',
  }

  return {
    cpu: unavailable,
    memory: unavailable,
    disk: unavailable,
    networkInbound: unavailable,
    networkOutbound: unavailable,
    networkTodayInbound: unavailable,
    networkTodayOutbound: unavailable,
  }
}
