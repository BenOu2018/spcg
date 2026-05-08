import type { SpcgLevel } from './types.js'

export type RankedAssessmentSource = 'lesson' | 'exam-only'
export type RankedAssessmentRole = 'basic' | 'variant' | 'advanced' | 'challenge'

export type RankedAssessmentRule = {
  source: RankedAssessmentSource
  candidateMode: RankedAssessmentRole | 'exam-only'
  outputMode: RankedAssessmentRole
  count: number
  maxScore: number
}

export const RANKED_ASSESSMENT_ENABLED_LEVELS = [1, 2, 3] as const satisfies readonly SpcgLevel[]

export const RANKED_ASSESSMENT_DURATION_OPTIONS = [
  { seconds: 3600, label: '1 小时' },
  { seconds: 7200, label: '2 小时' },
  { seconds: 10800, label: '3 小时' },
] as const

export const RANKED_ASSESSMENT_RULES: RankedAssessmentRule[] = [
  { source: 'lesson', candidateMode: 'basic', outputMode: 'basic', count: 2, maxScore: 40 },
  { source: 'lesson', candidateMode: 'variant', outputMode: 'variant', count: 1, maxScore: 40 },
  { source: 'exam-only', candidateMode: 'exam-only', outputMode: 'advanced', count: 2, maxScore: 60 },
  { source: 'exam-only', candidateMode: 'exam-only', outputMode: 'challenge', count: 1, maxScore: 60 },
]

export const RANKED_ASSESSMENT_TOTAL_SCORE = RANKED_ASSESSMENT_RULES.reduce(
  (sum, rule) => sum + rule.count * rule.maxScore,
  0,
)

export const RANKED_ASSESSMENT_TOTAL_QUESTIONS = RANKED_ASSESSMENT_RULES.reduce((sum, rule) => sum + rule.count, 0)

export function isRankedAssessmentEnabledLevel(spcgLevel: number): spcgLevel is (typeof RANKED_ASSESSMENT_ENABLED_LEVELS)[number] {
  return RANKED_ASSESSMENT_ENABLED_LEVELS.includes(spcgLevel as (typeof RANKED_ASSESSMENT_ENABLED_LEVELS)[number])
}

export function buildRankedAssessmentRoute(spcgLevel: number): string {
  return `/exam/spcg-level-${spcgLevel}`
}

export function buildRankedAssessmentTitle(spcgLevel: number, dateKey?: string): string {
  return `SPCG ${spcgLevel}级段位赛${dateKey ? ` ${dateKey}` : ''}`
}
