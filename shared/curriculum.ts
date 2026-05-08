export const V02_LESSON_ITEM_COUNT = 5
export const V02_REQUIRED_ITEM_COUNT = 3

export const LESSON_PROBLEM_ROLES = ['template', 'basic', 'variant', 'advanced', 'challenge'] as const
export const LEGACY_PROBLEM_DISPLAY_MODES = ['primary', 'backup'] as const
export const SPECIAL_PROBLEM_DISPLAY_MODES = ['exam-only'] as const

export const PROBLEM_SET_ITEM_DISPLAY_MODES = [
  ...LESSON_PROBLEM_ROLES,
  ...LEGACY_PROBLEM_DISPLAY_MODES,
  ...SPECIAL_PROBLEM_DISPLAY_MODES,
] as const

export const FRONTEND_LESSON_DISPLAY_MODES = [
  'template',
  'basic',
  'variant',
  'advanced',
  'challenge',
  'primary',
] as const

export type LessonProblemRole = (typeof LESSON_PROBLEM_ROLES)[number]
export type ProblemSetItemDisplayMode = (typeof PROBLEM_SET_ITEM_DISPLAY_MODES)[number]

export type LessonRoleSummary = {
  mode: ProblemSetItemDisplayMode
  label: string
  required: boolean
  v02Role: boolean
}

export const LESSON_ROLE_SUMMARIES: LessonRoleSummary[] = [
  { mode: 'template', label: '模板题', required: true, v02Role: true },
  { mode: 'basic', label: '基础题 1', required: true, v02Role: true },
  { mode: 'variant', label: '基础题 2 / 变式题', required: true, v02Role: true },
  { mode: 'advanced', label: '提高题 1', required: false, v02Role: true },
  { mode: 'challenge', label: '提高题 2 / 挑战题', required: false, v02Role: true },
  { mode: 'exam-only', label: '考试专用', required: false, v02Role: false },
  { mode: 'primary', label: '主线题（旧）', required: true, v02Role: false },
  { mode: 'backup', label: '备用题（旧）', required: false, v02Role: false },
]

const DISPLAY_MODE_SET = new Set<string>(PROBLEM_SET_ITEM_DISPLAY_MODES)
const FRONTEND_LESSON_DISPLAY_MODE_SET = new Set<string>(FRONTEND_LESSON_DISPLAY_MODES)
const MAINLINE_MODE_SET = new Set<ProblemSetItemDisplayMode>(['template', 'primary'])
const REQUIRED_MODE_SET = new Set<ProblemSetItemDisplayMode>(['template', 'basic', 'variant', 'primary'])
const ADVANCED_MODE_SET = new Set<ProblemSetItemDisplayMode>(['advanced', 'challenge', 'backup'])

export function isProblemSetItemDisplayMode(value: unknown): value is ProblemSetItemDisplayMode {
  return typeof value === 'string' && DISPLAY_MODE_SET.has(value)
}

export function isFrontendLessonDisplayMode(value: ProblemSetItemDisplayMode | string): boolean {
  return FRONTEND_LESSON_DISPLAY_MODE_SET.has(value)
}

export function getProblemSetItemDisplayModeLabel(value: ProblemSetItemDisplayMode | string): string {
  return LESSON_ROLE_SUMMARIES.find((item) => item.mode === value)?.label ?? value
}

export function isMainlineProblemDisplayMode(value: ProblemSetItemDisplayMode): boolean {
  return MAINLINE_MODE_SET.has(value)
}

export function isRequiredLessonProblemRole(value: ProblemSetItemDisplayMode): boolean {
  return REQUIRED_MODE_SET.has(value)
}

export function isAdvancedLessonProblemRole(value: ProblemSetItemDisplayMode): boolean {
  return ADVANCED_MODE_SET.has(value)
}
