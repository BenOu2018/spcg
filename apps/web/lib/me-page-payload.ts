import type { Session } from 'next-auth'
import type {
  AssessmentAttempt,
  Level,
  Progress,
  RewardLedgerEntry,
  UiLocale,
  UserInventoryItem,
  UserTitleRecord,
  WalletSummary,
} from '@spcg/shared/types'
import type { ProfileSubmissionItem } from '@/components/ProfileSubmissionList'
import type { StudentUiMessages } from '@/lib/student-ui'

export type MeAssessmentHistoryItem = AssessmentAttempt & {
  sessionTitle: string
  spcgLevel: number | null
  dateKey: string | null
}

export type MePagePayloadInput = {
  userId: string
  uiLocale: UiLocale
  session: Session | null
  levels: Level[]
  progressRecords: Progress[]
  wallet: WalletSummary | null
  inventory: UserInventoryItem[]
  titles: UserTitleRecord[]
  rewards: RewardLedgerEntry[]
  assessmentHistory: MeAssessmentHistoryItem[]
  submissionHistory: {
    items: ProfileSubmissionItem[]
  }
  messages: StudentUiMessages
  canShowPricingMenu: boolean
}

export type MePagePayload = MePagePayloadInput & {
  version: 1
  cachedAt: string
}

export const ME_PAGE_PAYLOAD_VERSION = 1

export function createCacheableMePagePayload(input: MePagePayloadInput, cachedAt = new Date().toISOString()): MePagePayload {
  return {
    ...input,
    version: ME_PAGE_PAYLOAD_VERSION,
    cachedAt,
    levels: input.levels.map(sanitizeLevelForCache),
  }
}

function sanitizeLevelForCache(level: Level): Level {
  return {
    ...level,
    solutionUnlocked: false,
    solution: undefined,
    officialCode: undefined,
    solutionVideoUrl: null,
  }
}
