import {
  LESSON_PROBLEM_ROLES,
  V02_LESSON_ITEM_COUNT,
  V02_REQUIRED_ITEM_COUNT,
  getProblemSetItemDisplayModeLabel,
  isProblemSetItemDisplayMode,
  type LessonProblemRole,
} from '@spcg/shared/curriculum'
import { listGameChapters } from '@spcg/shared/game-chapters'
import type { Difficulty, Hint, Solution, TestCase } from '@spcg/shared/types'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  listLaunchReadinessLessonSets,
  type LaunchReadinessProblem,
  type LaunchReadinessProblemSet,
} from '@/lib/repositories/launch-readiness-repository'

export type LaunchReadinessIssueSeverity = 'blocking' | 'warning'

export type LaunchReadinessIssue = {
  severity: LaunchReadinessIssueSeverity
  code: string
  message: string
  levelId?: string
}

export type LaunchReadinessRoleStatus = {
  role: LessonProblemRole
  label: string
  required: boolean
  levelId: string | null
  title: string | null
  status: 'ready' | 'blocking' | 'warning' | 'missing' | 'waived'
  issues: LaunchReadinessIssue[]
}

export type LaunchReadinessStageReport = {
  spcgLevel: number
  stageNo: number
  expectedTitle: string
  expectedKnowledgePoint: string
  problemSetId: string | null
  problemSetTitle: string | null
  lessonFocus: string | null
  status: 'ready' | 'blocking' | 'warning'
  issueCount: number
  blockingIssueCount: number
  warningIssueCount: number
  duplicateProblemSetIds: string[]
  roles: LaunchReadinessRoleStatus[]
  extraItems: Array<{ levelId: string; title: string | null; displayMode: string; position: number }>
  issues: LaunchReadinessIssue[]
}

export type LaunchReadinessOutOfPlanLessonSet = {
  spcgLevel: number
  stageNo: number
  problemSetId: string
  problemSetTitle: string
  lessonFocus: string | null
  status: string
  visibility: string
  itemCount: number
  v02RoleCount: number
  examOnlyCount: number
  note: string
}

export type LaunchReadinessReport = {
  generatedAt: string
  targetLevels: number[]
  expectedStages: number
  outOfPlanLessonSetCount: number
  readyStages: number
  blockingStages: number
  warningStages: number
  checkedProblems: number
  readyProblems: number
  blockingIssues: number
  warningIssues: number
  stages: LaunchReadinessStageReport[]
  outOfPlanLessonSets: LaunchReadinessOutOfPlanLessonSet[]
}

const TARGET_SPCG_LEVELS = [1, 2, 3] as const

type LaunchReadinessValidationContext = {
  spcgLevel: number
  stageNo: number
}

export async function getLaunchReadinessReport(): Promise<LaunchReadinessReport> {
  const generatedAt = new Date().toISOString()
  if (!isDatabaseConfigured()) {
    return {
      generatedAt,
      targetLevels: [...TARGET_SPCG_LEVELS],
      expectedStages: 0,
      outOfPlanLessonSetCount: 0,
      readyStages: 0,
      blockingStages: 0,
      warningStages: 0,
      checkedProblems: 0,
      readyProblems: 0,
      blockingIssues: 1,
      warningIssues: 0,
      stages: [
        {
          spcgLevel: 0,
          stageNo: 0,
          expectedTitle: 'DATABASE_URL 未配置',
          expectedKnowledgePoint: '',
          problemSetId: null,
          problemSetTitle: null,
          lessonFocus: null,
          status: 'blocking',
          issueCount: 1,
          blockingIssueCount: 1,
          warningIssueCount: 0,
          duplicateProblemSetIds: [],
          roles: buildMissingRoles(),
          extraItems: [],
          issues: [issue('blocking', 'database_missing', 'DATABASE_URL 未配置，无法生成上线完整度报表。')],
        },
      ],
      outOfPlanLessonSets: [],
    }
  }

  const sets = await listLaunchReadinessLessonSets(TARGET_SPCG_LEVELS)
  const setsByStage = groupSetsByStage(sets)
  const expectedStages = listExpectedStages()
  const expectedStageKeys = new Set(expectedStages.map((stage) => stageKey(stage.spcgLevel, stage.stageNo)))
  const stages = expectedStages.map((expected) => {
    const stageSets = setsByStage.get(stageKey(expected.spcgLevel, expected.stageNo)) ?? []
    return buildStageReport(expected, stageSets)
  })
  const outOfPlanLessonSets = sets
    .filter((set) => !expectedStageKeys.has(stageKey(set.spcgLevel, set.stageNo)))
    .map(buildOutOfPlanLessonSet)
  const allIssues = stages.flatMap((stage) => stage.issues.concat(stage.roles.flatMap((role) => role.issues)))
  const uniqueProblems = new Map<string, LaunchReadinessRoleStatus>()
  for (const stage of stages) {
    for (const role of stage.roles) {
      if (role.levelId) uniqueProblems.set(role.levelId, role)
    }
  }

  return {
    generatedAt,
    targetLevels: [...TARGET_SPCG_LEVELS],
    expectedStages: stages.length,
    outOfPlanLessonSetCount: outOfPlanLessonSets.length,
    readyStages: stages.filter((stage) => stage.status === 'ready').length,
    blockingStages: stages.filter((stage) => stage.status === 'blocking').length,
    warningStages: stages.filter((stage) => stage.status === 'warning').length,
    checkedProblems: uniqueProblems.size,
    readyProblems: [...uniqueProblems.values()].filter((role) => role.status === 'ready').length,
    blockingIssues: allIssues.filter((item) => item.severity === 'blocking').length,
    warningIssues: allIssues.filter((item) => item.severity === 'warning').length,
    stages,
    outOfPlanLessonSets,
  }
}

function listExpectedStages() {
  return listGameChapters()
    .filter((chapter) => TARGET_SPCG_LEVELS.includes(chapter.spcgLevel as (typeof TARGET_SPCG_LEVELS)[number]))
    .sort((a, b) => a.spcgLevel - b.spcgLevel)
    .flatMap((chapter) =>
      chapter.levelPlan.map((stage, index) => ({
        spcgLevel: chapter.spcgLevel,
        stageNo: index + 1,
        expectedTitle: stage.title,
        expectedKnowledgePoint: stage.knowledgePoint,
      })),
    )
}

function buildStageReport(
  expected: { spcgLevel: number; stageNo: number; expectedTitle: string; expectedKnowledgePoint: string },
  stageSets: LaunchReadinessProblemSet[],
): LaunchReadinessStageReport {
  const selectedSet = chooseProblemSet(stageSets)
  const issues: LaunchReadinessIssue[] = []

  if (!selectedSet) {
    issues.push(issue('blocking', 'lesson_set_missing', `缺少 ${expected.spcgLevel}级第${expected.stageNo}关 A 线课程题单。`))
    return finalizeStage({
      ...expected,
      problemSetId: null,
      problemSetTitle: null,
      lessonFocus: null,
      duplicateProblemSetIds: [],
      roles: buildMissingRoles(),
      extraItems: [],
      issues,
    })
  }

  const duplicateProblemSetIds = stageSets.filter((set) => set.id !== selectedSet.id).map((set) => set.id)
  if (duplicateProblemSetIds.length > 0) {
    issues.push(
      issue(
        'blocking',
        'duplicate_lesson_sets',
        `${expected.spcgLevel}级第${expected.stageNo}关存在多个未归档 A 线课程题单：${[selectedSet.id, ...duplicateProblemSetIds].join(', ')}。`,
      ),
    )
  }
  if (selectedSet.status !== 'published') {
    issues.push(issue('blocking', 'lesson_set_unpublished', `题单 ${selectedSet.id} 状态为 ${selectedSet.status}，需要 published。`))
  }
  if (selectedSet.visibility !== 'student') {
    issues.push(issue('blocking', 'lesson_set_not_student_visible', `题单 ${selectedSet.id} 可见性为 ${selectedSet.visibility}，需要 student。`))
  }
  if (!selectedSet.lessonFocus?.trim()) {
    issues.push(issue('warning', 'lesson_focus_missing', `题单 ${selectedSet.id} 缺少 lessonFocus / 算法内容。`))
  }

  const roleItems = selectedSet.items.filter((item) => LESSON_PROBLEM_ROLES.includes(item.displayMode as LessonProblemRole))
  const missingRoles = LESSON_PROBLEM_ROLES.filter((role) => !roleItems.some((item) => item.displayMode === role))
  const unwaivedMissingRoles = missingRoles.filter((role) => !isWaivedMissingRole(expected, role))
  if (roleItems.length !== V02_LESSON_ITEM_COUNT && unwaivedMissingRoles.length > 0) {
    issues.push(
      issue(
        'blocking',
        'lesson_role_count_invalid',
        `v0.2 题位数量为 ${roleItems.length}，需要正好 ${V02_LESSON_ITEM_COUNT} 道 template/basic/variant/advanced/challenge。`,
      ),
    )
  }

  const roles = LESSON_PROBLEM_ROLES.map((role) => buildRoleStatus(role, selectedSet, expected))
  const extraItems = selectedSet.items
    .filter((item) => !LESSON_PROBLEM_ROLES.includes(item.displayMode as LessonProblemRole))
    .map((item) => ({ levelId: item.levelId, title: item.title, displayMode: item.displayMode, position: item.position }))

  if (extraItems.some((item) => item.displayMode === 'primary')) {
    issues.push(issue('warning', 'legacy_primary_mode', '题单中仍存在旧 primary 题位；上线 A 线建议统一改为 template/basic/variant/advanced/challenge。'))
  }
  if (extraItems.length > 0) {
    const labels = extraItems.map((item) => `${item.levelId}(${formatDisplayMode(item.displayMode)})`).join('、')
    issues.push(issue('warning', 'extra_non_v02_items', `题单还包含非 v0.2 五题位项目：${labels}。`))
  }

  return finalizeStage({
    ...expected,
    problemSetId: selectedSet.id,
    problemSetTitle: selectedSet.title,
    lessonFocus: selectedSet.lessonFocus,
    duplicateProblemSetIds,
    roles,
    extraItems,
    issues,
  })
}

function buildOutOfPlanLessonSet(set: LaunchReadinessProblemSet): LaunchReadinessOutOfPlanLessonSet {
  const v02RoleCount = set.items.filter((item) => LESSON_PROBLEM_ROLES.includes(item.displayMode as LessonProblemRole)).length
  const examOnlyCount = set.items.filter((item) => item.displayMode === 'exam-only').length

  return {
    spcgLevel: set.spcgLevel,
    stageNo: set.stageNo,
    problemSetId: set.id,
    problemSetTitle: set.title,
    lessonFocus: set.lessonFocus,
    status: set.status,
    visibility: set.visibility,
    itemCount: set.items.length,
    v02RoleCount,
    examOnlyCount,
    note:
      examOnlyCount > 0
        ? '考试/综合题单，不计入主线五题关卡阻塞。'
        : '不在当前地图关卡配置中，请确认是否应加入主线或归档。',
  }
}

function buildRoleStatus(
  role: LessonProblemRole,
  set: LaunchReadinessProblemSet,
  context: LaunchReadinessValidationContext,
): LaunchReadinessRoleStatus {
  const items = set.items.filter((item) => item.displayMode === role)
  const item = items[0]
  const issues: LaunchReadinessIssue[] = []
  const required = role === 'template' || role === 'basic' || role === 'variant'

  if (!item) {
    if (isWaivedMissingRole(context, role)) {
      return {
        role,
        label: formatDisplayMode(role),
        required,
        levelId: null,
        title: '启蒙关卡已豁免',
        status: 'waived',
        issues,
      }
    }

    issues.push(issue('blocking', 'role_missing', `缺少 ${formatDisplayMode(role)}。`))
    return {
      role,
      label: formatDisplayMode(role),
      required,
      levelId: null,
      title: null,
      status: 'missing',
      issues,
    }
  }

  if (items.length > 1) {
    issues.push(issue('blocking', 'role_duplicate', `${formatDisplayMode(role)} 重复配置了 ${items.length} 道题。`, item.levelId))
  }
  if (required && !item.required) {
    issues.push(issue('blocking', 'required_role_not_required', `${formatDisplayMode(role)} 应标记为必做 required=true。`, item.levelId))
  }
  if (!required && item.required) {
    issues.push(issue('warning', 'optional_role_required', `${formatDisplayMode(role)} 是提高/挑战题，建议 required=false，避免阻塞主线推进。`, item.levelId))
  }

  issues.push(...validateProblem(item, context))

  return {
    role,
    label: formatDisplayMode(role),
    required,
    levelId: item.levelId,
    title: item.title,
    status: issues.some((entry) => entry.severity === 'blocking')
      ? 'blocking'
      : issues.length > 0
        ? 'warning'
        : 'ready',
    issues,
  }
}

function validateProblem(item: LaunchReadinessProblem, context: LaunchReadinessValidationContext): LaunchReadinessIssue[] {
  const issues: LaunchReadinessIssue[] = []
  const problemLabel = item.title ? `${item.levelId}《${item.title}》` : item.levelId

  if (!item.title?.trim()) issues.push(issue('blocking', 'problem_title_missing', `${problemLabel} 缺少题目标题。`, item.levelId))
  if (item.status !== 'published') {
    issues.push(issue('blocking', 'problem_unpublished', `${problemLabel} 状态为 ${item.status ?? 'missing'}，需要 published。`, item.levelId))
  }
  if (!item.knowledgePoint?.trim()) issues.push(issue('blocking', 'knowledge_point_missing', `${problemLabel} 缺少知识点。`, item.levelId))
  if (!item.description?.trim()) issues.push(issue('blocking', 'description_missing', `${problemLabel} 缺少题面 description。`, item.levelId))
  if (!item.inputFormat?.trim()) issues.push(issue('blocking', 'input_format_missing', `${problemLabel} 缺少输入格式。`, item.levelId))
  if (!item.outputFormat?.trim()) issues.push(issue('blocking', 'output_format_missing', `${problemLabel} 缺少输出格式。`, item.levelId))
  if (!item.officialCode?.trim()) issues.push(issue('blocking', 'official_code_missing', `${problemLabel} 缺少官方代码。`, item.levelId))
  if (!item.starterCode?.trim()) issues.push(issue('blocking', 'starter_code_missing', `${problemLabel} 缺少 starter code。`, item.levelId))

  issues.push(...validateDifficulty(problemLabel, item.levelId, item.difficulty, context.spcgLevel))
  issues.push(...validateTestCases(problemLabel, item.levelId, item.testCases, context))
  issues.push(...validateHints(problemLabel, item.levelId, item.hints))
  issues.push(...validateSolution(problemLabel, item.levelId, item.solution))

  if (!isProblemSetItemDisplayMode(item.displayMode)) {
    issues.push(issue('blocking', 'invalid_display_mode', `${problemLabel} displayMode=${item.displayMode} 不合法。`, item.levelId))
  }

  return issues
}

function validateDifficulty(label: string, levelId: string, difficulty: Difficulty | null, spcgLevel: number): LaunchReadinessIssue[] {
  if (!isRecord(difficulty)) return [issue('blocking', 'difficulty_missing', `${label} 缺少 difficulty。`, levelId)]

  const issues: LaunchReadinessIssue[] = []
  if (difficulty.spcgLevel !== spcgLevel) {
    issues.push(issue('blocking', 'difficulty_level_mismatch', `${label} difficulty.spcgLevel=${difficulty.spcgLevel}，应为 ${spcgLevel}。`, levelId))
  }
  if (difficulty.levelLabel !== `SPCG ${spcgLevel}级`) {
    issues.push(issue('blocking', 'difficulty_label_mismatch', `${label} difficulty.levelLabel 应为 SPCG ${spcgLevel}级。`, levelId))
  }
  if (typeof difficulty.stars !== 'number' || difficulty.stars < 1 || difficulty.stars > 5) {
    issues.push(issue('blocking', 'difficulty_stars_invalid', `${label} difficulty.stars 必须是 1-5。`, levelId))
  }
  if (!difficulty.label) {
    issues.push(issue('blocking', 'difficulty_layer_label_missing', `${label} 缺少 difficulty.label。`, levelId))
  }

  return issues
}

function validateTestCases(
  label: string,
  levelId: string,
  testCases: TestCase[] | null,
  context: LaunchReadinessValidationContext,
): LaunchReadinessIssue[] {
  if (!Array.isArray(testCases)) return [issue('blocking', 'test_cases_missing', `${label} 缺少测试点。`, levelId)]

  const issues: LaunchReadinessIssue[] = []
  const allowSimpleStarterCases = isWaivedSimpleStarterTestCases(context)
  if (!allowSimpleStarterCases && testCases.length !== 20) {
    issues.push(issue('blocking', 'test_case_count_invalid', `${label} 测试点数量为 ${testCases.length}，需要 20。`, levelId))
  }

  const publicCount = testCases.filter((testCase) => testCase.visibility === 'public').length
  const hiddenCount = testCases.filter((testCase) => testCase.visibility === 'hidden').length
  if (!allowSimpleStarterCases && (publicCount < 2 || publicCount > 3)) {
    issues.push(issue('blocking', 'public_case_count_invalid', `${label} public 测试点为 ${publicCount}，需要 2-3。`, levelId))
  }
  if (publicCount + hiddenCount !== testCases.length) {
    issues.push(issue('blocking', 'test_case_visibility_invalid', `${label} 存在 visibility 非 public/hidden 的测试点。`, levelId))
  }
  if (testCases.some((testCase) => typeof testCase.input !== 'string' || typeof testCase.expectedOutput !== 'string')) {
    issues.push(issue('blocking', 'test_case_io_invalid', `${label} 存在输入或输出不是字符串的测试点。`, levelId))
  }

  return issues
}

function validateHints(label: string, levelId: string, hints: Hint[] | null): LaunchReadinessIssue[] {
  if (!Array.isArray(hints)) return [issue('blocking', 'hints_missing', `${label} 缺少 hints。`, levelId)]

  const issues: LaunchReadinessIssue[] = []
  if (hints.length !== 3) {
    issues.push(issue('blocking', 'hints_count_invalid', `${label} hints 数量为 ${hints.length}，需要 3。`, levelId))
  }
  for (const step of [1, 2, 3] as const) {
    const hint = hints.find((item) => item.step === step)
    if (!hint?.title?.trim() || !hint.content?.trim()) {
      issues.push(issue('blocking', 'hint_step_missing', `${label} 缺少第 ${step} 步提示标题或内容。`, levelId))
    }
  }

  return issues
}

function validateSolution(label: string, levelId: string, solution: Solution | null): LaunchReadinessIssue[] {
  if (!isRecord(solution)) return [issue('blocking', 'solution_missing', `${label} 缺少题解 solution。`, levelId)]

  const issues: LaunchReadinessIssue[] = []
  if (typeof solution.explanation !== 'string' || !solution.explanation.trim()) {
    issues.push(issue('blocking', 'solution_explanation_missing', `${label} 缺少题解 explanation。`, levelId))
  }
  if (!Array.isArray(solution.keyPoints) || solution.keyPoints.length === 0) {
    issues.push(issue('blocking', 'solution_key_points_missing', `${label} 缺少题解 keyPoints。`, levelId))
  }
  if (!isRecord(solution.complexity) || typeof solution.complexity.time !== 'string' || typeof solution.complexity.memory !== 'string') {
    issues.push(issue('blocking', 'solution_complexity_missing', `${label} 缺少题解复杂度 time/memory。`, levelId))
  }

  return issues
}

function finalizeStage(
  input: Omit<
    LaunchReadinessStageReport,
    'status' | 'issueCount' | 'blockingIssueCount' | 'warningIssueCount'
  >,
): LaunchReadinessStageReport {
  const allIssues = input.issues.concat(input.roles.flatMap((role) => role.issues))
  const blockingIssueCount = allIssues.filter((item) => item.severity === 'blocking').length
  const warningIssueCount = allIssues.filter((item) => item.severity === 'warning').length

  return {
    ...input,
    status: blockingIssueCount > 0 ? 'blocking' : warningIssueCount > 0 ? 'warning' : 'ready',
    issueCount: allIssues.length,
    blockingIssueCount,
    warningIssueCount,
  }
}

function chooseProblemSet(sets: LaunchReadinessProblemSet[]): LaunchReadinessProblemSet | null {
  if (sets.length === 0) return null

  return (
    sets.find((set) => set.status === 'published' && set.visibility === 'student') ??
    sets.find((set) => set.status === 'published') ??
    sets[0] ??
    null
  )
}

function groupSetsByStage(sets: LaunchReadinessProblemSet[]): Map<string, LaunchReadinessProblemSet[]> {
  const grouped = new Map<string, LaunchReadinessProblemSet[]>()
  for (const set of sets) {
    const key = stageKey(set.spcgLevel, set.stageNo)
    grouped.set(key, [...(grouped.get(key) ?? []), set])
  }
  return grouped
}

function stageKey(spcgLevel: number, stageNo: number): string {
  return `${spcgLevel}:${stageNo}`
}

function buildMissingRoles(): LaunchReadinessRoleStatus[] {
  return LESSON_PROBLEM_ROLES.map((role) => ({
    role,
    label: formatDisplayMode(role),
    required: role === 'template' || role === 'basic' || role === 'variant',
    levelId: null,
    title: null,
    status: 'missing',
    issues: [issue('blocking', 'role_missing', `缺少 ${formatDisplayMode(role)}。`)],
  }))
}

function isWaivedMissingRole(context: LaunchReadinessValidationContext, role: LessonProblemRole): boolean {
  return context.spcgLevel === 1 && context.stageNo === 1 && (role === 'advanced' || role === 'challenge')
}

function isWaivedSimpleStarterTestCases(context: LaunchReadinessValidationContext): boolean {
  return context.spcgLevel === 1 && (context.stageNo === 1 || context.stageNo === 2)
}

function issue(
  severity: LaunchReadinessIssueSeverity,
  code: string,
  message: string,
  levelId?: string,
): LaunchReadinessIssue {
  return { severity, code, message, levelId }
}

function formatDisplayMode(displayMode: string): string {
  return getProblemSetItemDisplayModeLabel(displayMode)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
