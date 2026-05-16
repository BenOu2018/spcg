import type { Session } from 'next-auth'
import { createCacheableMePagePayload, type MePagePayload, type MePagePayloadInput } from '@/lib/me-page-payload'
import { getAllLevelsForUser } from '@/lib/services/level-service'
import { getProgressForUser } from '@/lib/services/progress-service'
import { requireUserInventory } from '@/lib/services/inventory-service'
import { listRankedAssessmentHistoryForUser } from '@/lib/services/assessment-service'
import { getUserRecentSubmissions } from '@/lib/services/submission-service'
import { requireRewardHistory, requireTitleHistory, requireWalletSummary } from '@/lib/services/wallet-service'
import { getCanShowPricingMenu } from '@/lib/services/account-menu-service'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

export type MePageLoadResult = {
  cachePayload: MePagePayload
  viewPayload: MePagePayloadInput
}

export async function getMePagePayloadForSession(session: Session): Promise<MePageLoadResult> {
  const userId = session.user.id
  const [
    uiLocale,
    canShowPricingMenu,
    levels,
    progressRecords,
    wallet,
    inventory,
    titles,
    rewards,
    assessmentHistory,
    submissionHistory,
  ] = await Promise.all([
    getRequestUiLocale(userId),
    getCanShowPricingMenu(userId),
    getAllLevelsForUser({ userId, allowMockFallback: true }),
    getProgressForUser({ userId, allowMockFallback: true }),
    requireWalletSummary(userId).catch(() => null),
    requireUserInventory(userId).catch(() => []),
    requireTitleHistory(userId).catch(() => []),
    requireRewardHistory(userId).catch(() => []),
    listRankedAssessmentHistoryForUser({ userId, limit: 20 }).catch(() => []),
    getUserRecentSubmissions({ userId, limit: 500 }).catch(() => ({ items: [] })),
  ])

  const viewPayload: MePagePayloadInput = {
    userId,
    uiLocale,
    session,
    levels,
    progressRecords,
    wallet,
    inventory,
    titles,
    rewards,
    assessmentHistory,
    submissionHistory,
    messages: getStudentUiMessages(uiLocale),
    canShowPricingMenu,
  }

  return {
    viewPayload,
    cachePayload: createCacheableMePagePayload(viewPayload),
  }
}
