import type { Difficulty, DifficultyLayerLabel, DifficultyLevelLabel, DifficultyStars, SpcgLevel } from './types.js'

export const SPCG_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const satisfies readonly SpcgLevel[]
export const DIFFICULTY_STARS = [1, 2, 3, 4, 5] as const satisfies readonly DifficultyStars[]
export const DIFFICULTY_LAYER_LABELS = ['入门', '基础', '提高', '挑战', '综合'] as const satisfies readonly DifficultyLayerLabel[]

export type DifficultyInput = Pick<Difficulty, 'spcgLevel' | 'stars'> | {
  spcgLevel?: number | null
  stars?: number | null
}

export const DAILY_REVIEW_COIN_PER_ACCEPTED = 2
export const RANKED_ASSESSMENT_AK_COIN_BONUS = 10

export function isSpcgLevel(value: number): value is SpcgLevel {
  return Number.isInteger(value) && value >= 1 && value <= 10
}

export function isDifficultyStars(value: number): value is DifficultyStars {
  return Number.isInteger(value) && value >= 1 && value <= 5
}

export function getLevelLabel(spcgLevel: number): DifficultyLevelLabel {
  if (!isSpcgLevel(spcgLevel)) throw new Error(`Invalid SPCG level: ${spcgLevel}`)
  return `SPCG ${spcgLevel}级` as DifficultyLevelLabel
}

export function getDifficultyCoefficient(input: DifficultyInput): number {
  const spcgLevel = normalizeSpcgLevel(input.spcgLevel)
  const stars = normalizeStars(input.stars)
  return spcgLevel * stars
}

export function getLevelCoinReward(input: DifficultyInput): number {
  return getDifficultyCoefficient(input)
}

export function getDailyReviewCoinReward(acceptedCount: number): number {
  const normalizedCount = Number.isFinite(acceptedCount) ? Math.max(0, Math.floor(acceptedCount)) : 0
  return normalizedCount * DAILY_REVIEW_COIN_PER_ACCEPTED
}

export function getRankedAssessmentQuestionCoinReward(input: DifficultyInput & {
  score: number
  maxScore: number
}): number {
  const score = Number.isFinite(input.score) ? input.score : 0
  const maxScore = Number.isFinite(input.maxScore) ? input.maxScore : 0
  const ratio = maxScore > 0 ? Math.max(0, Math.min(1, score / maxScore)) : 0
  return Math.round(ratio * getDifficultyCoefficient(input))
}

function normalizeSpcgLevel(value: number | null | undefined): SpcgLevel {
  if (typeof value === 'number' && isSpcgLevel(value)) return value
  return 1
}

function normalizeStars(value: number | null | undefined): DifficultyStars {
  if (typeof value === 'number' && isDifficultyStars(value)) return value
  return 1
}
