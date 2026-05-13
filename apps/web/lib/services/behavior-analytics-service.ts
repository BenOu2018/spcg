import { createHash } from 'node:crypto'
import type {
  BehaviorAnalysisProvider,
  BehaviorAnalysisReportSummary,
  BehaviorAnalysisResult,
  BehaviorFocusLevel,
  BehaviorFocusOnCoding,
  BehaviorEventType,
} from '@spcg/shared/types'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  assertBehaviorAnalysisReportTableReady,
  BEHAVIOR_EVENT_TYPES,
  deleteBehaviorAnalysisReportForStudent,
  getBehaviorAnalysisInput,
  insertBehaviorAnalysisReport,
  isUndefinedTableError,
  listBehaviorAnalysisReportsForAdmin,
  listBehaviorAnalysisReportsForStudent,
  recordBehaviorEvents,
  type BehaviorAnalysisInput,
  type BehaviorEventInsert,
} from '@/lib/repositories/behavior-analytics-repository'
import { requireTeacherCanAccessStudent, requireTeacherManagesStudent } from '@/lib/services/teacher-service'
import { ServiceError } from '@/lib/services/errors'
import {
  getMiniMaxCodeHelpConfig,
  type MiniMaxCodeHelpConfig,
} from '@/lib/services/minimax-code-help-client'

export type BehaviorEventBatchInput = {
  userId?: string | null
  clientSessionId?: unknown
  pageViewId?: unknown
  userAgent?: string | null
  events?: unknown
}

type NormalizedBehaviorGenerationInput = {
  studentUserId: string
  periodStart: string
  periodEnd: string
  generatedBy: string | null
}

type MiniMaxBehaviorResponse = BehaviorAnalysisResult & {
  markdown?: unknown
}

type BehaviorFocusSignals = {
  totalVisibleMinutes: number
  codingVisibleMinutes: number
  nonCodingVisibleMinutes: number
  codingVisibleRatio: number | null
  codingPageCount: number
  nonCodingPageCount: number
  ideActionCount: number
  runCount: number
  submitCount: number
  editChangeCount: number
  repairSuccessCount: number
  supportActionCount: number
  clickCount: number
}

const EVENT_TYPE_SET = new Set<BehaviorEventType>(BEHAVIOR_EVENT_TYPES)
const PROMPT_VERSION = 'spcg-behavior-analysis-v2'
const DEFAULT_PERIOD_DAYS = 7
const MAX_EVENTS_PER_BATCH = 80
const MAX_METADATA_CHARS = 2600
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SENSITIVE_QUERY_KEYS = [
  'token',
  'code',
  'password',
  'secret',
  'apikey',
  'api_key',
  'parentinvitecode',
  'invite',
  'phone',
  'email',
  'idcard',
]
const SENSITIVE_METADATA_KEYS = new Set([
  'code',
  'source',
  'sourcecode',
  'stdin',
  'stdout',
  'stderr',
  'errordetail',
  'rawerror',
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'phone',
  'email',
  'idcard',
])

export async function recordUserBehaviorEventBatch(input: BehaviorEventBatchInput): Promise<{ inserted: number }> {
  if (!isDatabaseConfigured()) {
    return { inserted: 0 }
  }
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录，无法记录用户行为。', 401)

  const clientSessionId = normalizeText(input.clientSessionId, 160)
  if (!clientSessionId) throw new ServiceError('bad_request', 'clientSessionId is required.', 400)

  const fallbackPageViewId = normalizeText(input.pageViewId, 160)
  const rawEvents = Array.isArray(input.events) ? input.events.slice(0, MAX_EVENTS_PER_BATCH) : []
  const events = rawEvents
    .map((event) => normalizeBehaviorEvent(event, fallbackPageViewId))
    .filter((event): event is BehaviorEventInsert => Boolean(event))

  try {
    return await recordBehaviorEvents({
      userId: input.userId,
      clientSessionId,
      userAgent: trimText(input.userAgent, 700),
      events,
    })
  } catch (error) {
    if (isUndefinedTableError(error)) return { inserted: 0 }
    throw error
  }
}

export async function getTeacherStudentBehaviorAnalyses(input: {
  teacherUserId?: string | null
  studentUserId: string
  limit?: number
}): Promise<BehaviorAnalysisReportSummary[]> {
  await requireTeacherCanAccessStudent({
    teacherUserId: input.teacherUserId,
    studentUserId: input.studentUserId,
  })
  try {
    return await listBehaviorAnalysisReportsForStudent({
      studentUserId: input.studentUserId,
      limit: input.limit,
    })
  } catch (error) {
    if (isUndefinedTableError(error)) return []
    throw error
  }
}

export async function generateBehaviorAnalysisForTeacherStudent(input: {
  teacherUserId?: string | null
  studentUserId: string
  periodStart?: string | null
  periodEnd?: string | null
  periodDays?: number | null
}): Promise<BehaviorAnalysisReportSummary> {
  const access = await requireTeacherManagesStudent({
    teacherUserId: input.teacherUserId,
    studentUserId: input.studentUserId,
  })
  return generateBehaviorAnalysisReport(
    normalizeBehaviorGenerationInput({
      studentUserId: input.studentUserId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      periodDays: input.periodDays,
      generatedBy: access.teacherUserId,
    }),
  )
}

export async function deleteBehaviorAnalysisForTeacherStudent(input: {
  teacherUserId?: string | null
  studentUserId: string
  reportId: string
}): Promise<void> {
  await requireTeacherManagesStudent({
    teacherUserId: input.teacherUserId,
    studentUserId: input.studentUserId,
  })
  if (!UUID_PATTERN.test(input.reportId)) {
    throw new ServiceError('bad_request', '行为分析报告 ID 不合法。', 400)
  }

  try {
    const deleted = await deleteBehaviorAnalysisReportForStudent({
      studentUserId: input.studentUserId,
      reportId: input.reportId,
    })
    if (!deleted) throw new ServiceError('not_found', '行为分析报告不存在或无权删除。', 404)
  } catch (error) {
    if (isUndefinedTableError(error)) {
      throw new ServiceError(
        'db_unconfigured',
        '行为分析数据表尚未创建，请先执行数据库迁移 npm run db:migrate。',
        503,
      )
    }
    throw error
  }
}

export async function getAdminBehaviorAnalyses(input: {
  studentUserId?: string | null
  userRole?: 'student' | 'teacher' | null
  periodStart?: string | null
  periodEnd?: string | null
  limit?: number
}): Promise<BehaviorAnalysisReportSummary[]> {
  try {
    return await listBehaviorAnalysisReportsForAdmin(input)
  } catch (error) {
    if (isUndefinedTableError(error)) return []
    throw error
  }
}

export async function generateBehaviorAnalysisForAdmin(input: {
  adminUserId?: string | null
  studentUserId: string
  periodStart?: string | null
  periodEnd?: string | null
  periodDays?: number | null
}): Promise<BehaviorAnalysisReportSummary> {
  if (!input.adminUserId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  return generateBehaviorAnalysisReport(
    normalizeBehaviorGenerationInput({
      studentUserId: input.studentUserId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      periodDays: input.periodDays,
      generatedBy: input.adminUserId,
    }),
  )
}

async function generateBehaviorAnalysisReport(input: NormalizedBehaviorGenerationInput): Promise<BehaviorAnalysisReportSummary> {
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  await requireBehaviorAnalysisReportTable()

  const analysisInput = await getBehaviorAnalysisInput({
    studentUserId: input.studentUserId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  })
  const promptHash = buildPromptHash(analysisInput)
  const localAnalysis = buildLocalBehaviorAnalysis(analysisInput)
  const localMarkdown = buildBehaviorMarkdown(analysisInput, localAnalysis)
  let provider: BehaviorAnalysisProvider = 'local'
  let model = 'local-behavior-rules-v1'
  let analysis = localAnalysis
  let markdown = localMarkdown
  let errorMessage: string | null = null

  try {
    const config = await getMiniMaxCodeHelpConfig()
    if (config.configured) {
      const generated = await generateBehaviorAnalysisWithMiniMax(analysisInput, config)
      provider = 'minimax'
      model = generated.model
      analysis = generated.analysis
      markdown = generated.markdown
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'AI 行为分析失败，已使用本地规则生成摘要。'
  }

  try {
    return await insertBehaviorAnalysisReport({
      studentUserId: input.studentUserId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      provider,
      model,
      analysis,
      markdown,
      promptHash,
      generatedBy: input.generatedBy,
      errorMessage,
    })
  } catch (error) {
    if (isUndefinedTableError(error)) {
      throw new ServiceError(
        'db_unconfigured',
        '行为分析数据表尚未创建，请先执行数据库迁移 npm run db:migrate，再重新生成分析。',
        503,
      )
    }
    throw error
  }
}

async function requireBehaviorAnalysisReportTable(): Promise<void> {
  try {
    await assertBehaviorAnalysisReportTableReady()
  } catch (error) {
    if (isUndefinedTableError(error)) {
      throw new ServiceError(
        'db_unconfigured',
        '行为分析数据表尚未创建，请先执行数据库迁移 npm run db:migrate，再重新生成分析。',
        503,
      )
    }
    throw error
  }
}

async function generateBehaviorAnalysisWithMiniMax(
  input: BehaviorAnalysisInput,
  config: MiniMaxCodeHelpConfig,
): Promise<{ analysis: BehaviorAnalysisResult; markdown: string; model: string }> {
  if (!config.apiKey) throw new ServiceError('bad_request', 'MiniMax API Key 未配置，AI 行为分析暂不可用。', 400)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(config.timeoutMs, 120_000))

  try {
    const prompts = buildBehaviorPrompts(input)
    const content =
      config.apiMode === 'openai'
        ? await requestOpenAICompatibleJson(config, config.apiKey, prompts, controller.signal)
        : await requestAnthropicCompatibleJson(config, config.apiKey, prompts, controller.signal)
    const parsed = tryParseJsonObject(content)
    if (!parsed) throw new ServiceError('internal_error', 'MiniMax 未返回合法 JSON。', 502)
    const analysis = normalizeBehaviorAnalysis(parsed)
    const markdown = readOptionalText((parsed as MiniMaxBehaviorResponse).markdown) ?? buildBehaviorMarkdown(input, analysis)
    return { analysis, markdown, model: config.model }
  } finally {
    clearTimeout(timer)
  }
}

function buildBehaviorPrompts(input: BehaviorAnalysisInput): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      '你是 SPCG 的少儿编程学习行为分析助手。',
      '你只能基于聚合行为数据、页面路径、IDE 操作次数、运行提交结果和修错趋势给管理员/老师提供建议。',
      '如果用户角色是 student，重点分析编程学习路线、IDE 习惯和修错闭环；如果用户角色是 teacher，重点分析教学后台使用、学生管理路径和平台使用节奏。',
      'focusOnCoding 只能判断平台内编程学习专注度：用页面可见时长、学习页面占比、IDE 编辑/运行/提交、提示/白板/视频、修错闭环作为证据。',
      'focusOnCoding.level 只能是 high、medium、low、unknown；证据不足时必须使用 unknown，不要猜测学生态度。',
      '不要推断智力、性格、心理健康、家庭背景、性别、收入等敏感画像。',
      '不要要求查看源码、手机号、邮箱、隐藏测试点或原始错误详情。',
      '必须全部使用简体中文回答。',
      '只输出一个合法 JSON 对象，不要 Markdown 代码块，不要额外说明。',
      'JSON 字段必须是：overview:string, learningRhythm:string, routeFindings:string[], ideHabits:string[], focusOnCoding:{level:string, summary:string, evidence:string[], risks:string[]}, debuggingPattern:string, repairProgress:string, stuckRisks:string[], nextActions:string[], confidence:string, markdown:string。',
      'markdown 必须包含“编程学习专注度”小节，列出 focusOnCoding 的判断、证据和风险。',
      'nextActions 给老师可执行的教学动作，3-6 条。',
    ].join('\n'),
    userPrompt: [
      '请分析这名学生在本周期的学习行为，输出 JSON。',
      '',
      `用户：${input.student.displayName} (${input.student.username})`,
      `角色：${input.student.userRole}`,
      `周期：${input.periodStart} 至 ${input.periodEnd}`,
      '',
      '聚合数据：',
      JSON.stringify(buildPromptSafeAnalysisInput(input), null, 2),
    ].join('\n'),
  }
}

function buildPromptSafeAnalysisInput(input: BehaviorAnalysisInput): Record<string, unknown> {
  return {
    pageViews: input.pageViews,
    userRole: input.student.userRole,
    focusSignals: buildFocusSignals(input),
    eventCounts: input.eventCounts,
    ide: input.ide,
    verdictCounts: input.verdictCounts,
    submissionCount: input.submissionCount,
    acceptedSubmissionCount: input.acceptedSubmissionCount,
    levelActivity: input.levelActivity,
    recentEvents: input.recentEvents,
  }
}

function buildFocusSignals(input: BehaviorAnalysisInput): BehaviorFocusSignals {
  const codingPageViews = input.pageViews.filter((view) => isCodingLearningPath(view.path))
  const codingVisibleMs = codingPageViews.reduce((sum, item) => sum + item.totalVisibleDurationMs, 0)
  const totalVisibleMs = input.pageViews.reduce((sum, item) => sum + item.totalVisibleDurationMs, 0)
  const nonCodingVisibleMs = Math.max(0, totalVisibleMs - codingVisibleMs)
  const ideActionCount =
    input.ide.editBatchCount +
    input.ide.runCount +
    input.ide.submitCount +
    input.ide.errorCount +
    input.ide.repairSuccessCount +
    input.ide.aiErrorAnalysisCount +
    input.ide.whiteboardCount
  const supportActionCount = input.ide.hintCount + input.ide.solutionVideoCount + input.ide.whiteboardCount + input.ide.aiErrorAnalysisCount

  return {
    totalVisibleMinutes: Math.round(totalVisibleMs / 60_000),
    codingVisibleMinutes: Math.round(codingVisibleMs / 60_000),
    nonCodingVisibleMinutes: Math.round(nonCodingVisibleMs / 60_000),
    codingVisibleRatio: totalVisibleMs > 0 ? Number((codingVisibleMs / totalVisibleMs).toFixed(2)) : null,
    codingPageCount: codingPageViews.length,
    nonCodingPageCount: Math.max(0, input.pageViews.length - codingPageViews.length),
    ideActionCount,
    runCount: input.ide.runCount,
    submitCount: input.ide.submitCount,
    editChangeCount: input.ide.changeCount,
    repairSuccessCount: input.ide.repairSuccessCount,
    supportActionCount,
    clickCount: input.eventCounts.click,
  }
}

function isCodingLearningPath(path: string): boolean {
  return (
    path === '/' ||
    path === '/map' ||
    path === '/knowledge-tree' ||
    path.startsWith('/level/') ||
    path.startsWith('/test/') ||
    path.startsWith('/exam/') ||
    path.startsWith('/daily-review') ||
    path.startsWith('/me/submissions')
  )
}

function buildLocalBehaviorAnalysis(input: BehaviorAnalysisInput): BehaviorAnalysisResult {
  const totalVisibleMinutes = Math.round(input.pageViews.reduce((sum, item) => sum + item.totalVisibleDurationMs, 0) / 60_000)
  const activeDays = countActiveDays(input.recentEvents)
  const acRate = input.submissionCount > 0 ? Math.round((input.acceptedSubmissionCount / input.submissionCount) * 100) : 0
  const mostVisited = input.pageViews[0]
  const busiestLevel = input.levelActivity[0]
  const nonAcCount = Object.entries(input.verdictCounts)
    .filter(([result]) => result !== 'AC')
    .reduce((sum, [, count]) => sum + count, 0)
  const routeFindings = [
    mostVisited
      ? `停留最多的页面是 ${mostVisited.path}，可见停留约 ${formatMinutes(mostVisited.totalVisibleDurationMs)}。`
      : '本周期暂无可统计的浏览停留数据。',
    input.eventCounts.click > 0
      ? `记录到 ${input.eventCounts.click} 次关键点击，说明学习路线已有可追踪样本。`
      : '关键点击样本较少，后续分析路线偏好时置信度会偏低。',
  ]
  const ideHabits = [
    `IDE 编辑汇总 ${input.ide.editBatchCount} 批，约 ${input.ide.changeCount} 次变更，新增 ${input.ide.insertedChars} 字符、删除 ${input.ide.deletedChars} 字符。`,
    `运行 ${input.ide.runCount} 次、提交 ${input.ide.submitCount} 次，运行/提交比约 ${formatRatio(input.ide.runCount, input.ide.submitCount)}。`,
    input.ide.pasteCount > 0 ? `检测到 ${input.ide.pasteCount} 次疑似粘贴或粘贴操作。` : '未检测到明显粘贴依赖。',
  ]
  const focusOnCoding = buildLocalFocusOnCoding(input, buildFocusSignals(input))
  const stuckRisks: string[] = []
  if (nonAcCount >= Math.max(3, input.acceptedSubmissionCount)) stuckRisks.push(`非 AC 结果 ${nonAcCount} 次，建议优先复盘 WA/CE/TLE 的共性。`)
  if (input.ide.submitCount > 0 && input.ide.runCount === 0) stuckRisks.push('提交前本地运行较少，可能存在直接提交试错。')
  if (busiestLevel && busiestLevel.errorCount >= 3 && busiestLevel.repairSuccessCount === 0) {
    stuckRisks.push(`${busiestLevel.levelTitle} 错误事件较多且暂无修错成功，需要老师介入定位。`)
  }
  if (stuckRisks.length === 0) stuckRisks.push('暂无明显高风险卡点，继续观察连续失败和长时间停留即可。')

  return {
    overview: `本周期记录到 ${activeDays} 个活跃日、约 ${totalVisibleMinutes} 分钟可见学习时间、${input.submissionCount} 次提交，AC 率约 ${acRate}%。`,
    learningRhythm:
      input.submissionCount === 0
        ? '本周期提交较少，建议先恢复短时练习节奏。'
        : input.submissionCount <= 8
          ? '提交节奏偏稳，适合继续推进主线题并穿插修错。'
          : '提交较密集，老师可关注连续失败后的休息和复盘质量。',
    routeFindings,
    ideHabits,
    focusOnCoding,
    debuggingPattern:
      input.ide.errorCount > 0
        ? `记录到 ${input.ide.errorCount} 次 IDE 错误事件，判题分布为 ${formatVerdictCounts(input.verdictCounts)}。`
        : `错误事件较少，判题分布为 ${formatVerdictCounts(input.verdictCounts)}。`,
    repairProgress:
      input.ide.repairSuccessCount > 0
        ? `本周期记录到 ${input.ide.repairSuccessCount} 次修错成功，说明已有从失败到 AC 的闭环。`
        : '本周期尚未记录到明确修错成功，建议老师安排一次“先解释错误再修改”的复盘。',
    stuckRisks,
    nextActions: buildLocalNextActions(input, stuckRisks),
    confidence: input.eventCounts.page_view_start > 0 || input.submissionCount > 0 ? 'medium' : 'low',
  }
}

function buildLocalNextActions(input: BehaviorAnalysisInput, stuckRisks: string[]): string[] {
  const actions = [
    input.student.userRole === 'teacher'
      ? '让老师复盘最近一次学生管理或报告查看路径，确认是否能快速定位重点学生。'
      : '让学生口头复述最近一道错题的输入、处理、输出三步，再动手修改。',
    '鼓励提交前至少运行公开样例一次，并记录样例不通过时的原因。',
  ]
  if (input.ide.repairSuccessCount === 0) actions.push('选择一题非 AC 记录做修错示范，目标是把错误原因写成一句话。')
  if (input.ide.aiErrorAnalysisCount > 0) actions.push('检查 AI 错误分析后的下一次提交是否有改善，避免只看建议不修改。')
  if (stuckRisks.length > 0) actions.push('优先处理风险列表中的第一项，减少连续无效提交。')
  return actions.slice(0, 6)
}

function buildLocalFocusOnCoding(input: BehaviorAnalysisInput, signals: BehaviorFocusSignals): BehaviorFocusOnCoding {
  const evidence: string[] = []
  const risks: string[] = []
  const ratioLabel = signals.codingVisibleRatio === null ? '暂无可见时长样本' : `${Math.round(signals.codingVisibleRatio * 100)}%`
  const codingPaths = input.pageViews.filter((view) => isCodingLearningPath(view.path)).slice(0, 3)

  if (signals.totalVisibleMinutes > 0) {
    evidence.push(`平台可见停留约 ${signals.totalVisibleMinutes} 分钟，其中编程学习页面约 ${signals.codingVisibleMinutes} 分钟，占比 ${ratioLabel}。`)
  }
  if (codingPaths.length > 0) {
    evidence.push(`主要编程学习路径：${codingPaths.map((view) => `${view.path}(${formatMinutes(view.totalVisibleDurationMs)})`).join('、')}。`)
  }
  if (signals.ideActionCount > 0) {
    evidence.push(`IDE 行为 ${signals.ideActionCount} 次：编辑变更 ${signals.editChangeCount} 次、运行 ${signals.runCount} 次、提交 ${signals.submitCount} 次。`)
  }
  if (signals.supportActionCount > 0) {
    evidence.push(`使用提示、白板、视频或 AI 错误分析等学习辅助 ${signals.supportActionCount} 次。`)
  }
  if (signals.repairSuccessCount > 0) {
    evidence.push(`记录到 ${signals.repairSuccessCount} 次修错成功，说明存在从错误到通过的学习闭环。`)
  }
  if (evidence.length === 0 && input.submissionCount > 0) {
    evidence.push(`本周期有 ${input.submissionCount} 次提交，但缺少页面可见时长和 IDE 过程事件。`)
  }

  if (signals.totalVisibleMinutes === 0 && signals.ideActionCount === 0) {
    risks.push('缺少页面可见时长和 IDE 操作样本，无法可靠判断平台内专注度。')
  }
  if (signals.codingVisibleRatio !== null && signals.codingVisibleRatio < 0.45) {
    risks.push('编程学习页面可见时长占比较低，需要确认学生是否主要停留在题目与 IDE。')
  }
  if (input.ide.submitCount > 0 && input.ide.runCount === 0) {
    risks.push('有提交但没有本地运行完成记录，可能存在直接提交试错。')
  }
  if (input.ide.submitCount > 0 && input.ide.changeCount === 0) {
    risks.push('有提交但缺少编辑摘要，可能没有在网页 IDE 内完成主要编码过程。')
  }

  const level = classifyFocusLevel(signals, input)
  const summary =
    level === 'high'
      ? '平台内行为显示学生主要停留在编程学习页面，并伴随较完整的 IDE 操作。'
      : level === 'medium'
        ? '平台内行为显示学生有编程学习投入，但证据还不够连续或完整。'
        : level === 'low'
          ? '平台内行为显示编程学习页面或 IDE 操作占比偏低，需要老师进一步确认学习状态。'
          : '平台内证据不足，暂不能可靠判断编程学习专注度。'

  return {
    level,
    summary,
    evidence: evidence.slice(0, 6),
    risks: risks.slice(0, 6),
  }
}

function classifyFocusLevel(signals: BehaviorFocusSignals, input: BehaviorAnalysisInput): BehaviorFocusLevel {
  const hasProcessEvidence = signals.totalVisibleMinutes > 0 || signals.ideActionCount > 0 || signals.clickCount > 0
  if (!hasProcessEvidence) return 'unknown'

  if (
    (signals.codingVisibleRatio !== null && signals.codingVisibleRatio >= 0.7 && signals.totalVisibleMinutes >= 3 && signals.ideActionCount >= 3) ||
    (signals.ideActionCount >= 6 && signals.editChangeCount >= 10 && (signals.runCount > 0 || signals.submitCount > 0))
  ) {
    return 'high'
  }

  if (signals.codingVisibleRatio !== null && signals.codingVisibleRatio < 0.35 && signals.ideActionCount === 0 && input.submissionCount === 0) {
    return 'low'
  }

  if (
    signals.ideActionCount > 0 ||
    input.submissionCount > 0 ||
    (signals.codingVisibleRatio !== null && signals.codingVisibleRatio >= 0.45)
  ) {
    return 'medium'
  }

  return 'low'
}

function buildBehaviorMarkdown(input: BehaviorAnalysisInput, analysis: BehaviorAnalysisResult): string {
  return [
    `# ${input.student.displayName} 行为分析`,
    '',
    `- 周期：${input.periodStart} 至 ${input.periodEnd}`,
    `- 角色：${input.student.userRole}`,
    `- 提交：${input.submissionCount} 次，AC ${input.acceptedSubmissionCount} 次`,
    `- IDE：运行 ${input.ide.runCount} 次，提交 ${input.ide.submitCount} 次，修错成功 ${input.ide.repairSuccessCount} 次`,
    '',
    '## 总览',
    '',
    analysis.overview,
    '',
    '## 学习节奏',
    '',
    analysis.learningRhythm,
    '',
    '## 浏览路线',
    '',
    formatMarkdownList(analysis.routeFindings),
    '',
    '## IDE 习惯',
    '',
    formatMarkdownList(analysis.ideHabits),
    '',
    '## 编程学习专注度',
    '',
    `- 判断：${formatFocusLevel(analysis.focusOnCoding.level)}。${analysis.focusOnCoding.summary}`,
    '- 证据：',
    formatMarkdownList(analysis.focusOnCoding.evidence),
    '- 风险：',
    formatMarkdownList(analysis.focusOnCoding.risks),
    '',
    '## 调试与修错',
    '',
    `- ${analysis.debuggingPattern}`,
    `- ${analysis.repairProgress}`,
    '',
    '## 风险',
    '',
    formatMarkdownList(analysis.stuckRisks),
    '',
    '## 下一步建议',
    '',
    formatMarkdownList(analysis.nextActions),
    '',
    '## 隐私说明',
    '',
    '- 本分析只使用聚合行为数据、页面路径、IDE 操作次数和判题结果。',
    '- 不包含源码、逐字输入、手机号、邮箱、身份证、隐藏测试点或原始错误详情。',
  ].join('\n')
}

async function requestAnthropicCompatibleJson(
  config: MiniMaxCodeHelpConfig,
  apiKey: string,
  input: { systemPrompt: string; userPrompt: string },
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(buildAnthropicMessagesUrl(config.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1800,
      temperature: 0.2,
      system: input.systemPrompt,
      messages: [{ role: 'user', content: input.userPrompt }],
    }),
    signal,
  })
  const data = (await response.json().catch(() => null)) as {
    content?: Array<{ type?: string; text?: string }>
    error?: { message?: string }
    base_resp?: { status_code?: number; status_msg?: string }
  } | null
  const apiStatusCode = data?.base_resp?.status_code
  if (!response.ok || (typeof apiStatusCode === 'number' && apiStatusCode !== 0)) {
    throw new ServiceError('internal_error', data?.error?.message ?? data?.base_resp?.status_msg ?? `MiniMax 行为分析失败：HTTP ${response.status}`, 502)
  }
  return data?.content?.map((item) => (item.type === 'text' ? item.text?.trim() : '')).filter(Boolean).join('\n') ?? ''
}

async function requestOpenAICompatibleJson(
  config: MiniMaxCodeHelpConfig,
  apiKey: string,
  input: { systemPrompt: string; userPrompt: string },
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(buildOpenAIChatCompletionsUrl(config.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
    }),
    signal,
  })
  const data = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  } | null
  if (!response.ok) {
    throw new ServiceError('internal_error', data?.error?.message ?? `MiniMax 行为分析失败：HTTP ${response.status}`, 502)
  }
  return data?.choices?.[0]?.message?.content ?? ''
}

function normalizeBehaviorGenerationInput(input: {
  studentUserId: string
  periodStart?: string | null
  periodEnd?: string | null
  periodDays?: number | null
  generatedBy?: string | null
}): NormalizedBehaviorGenerationInput {
  const studentUserId = input.studentUserId.trim()
  if (!studentUserId) throw new ServiceError('bad_request', 'User id is required.', 400)
  const hasExplicitPeriod = Boolean(input.periodStart || input.periodEnd)
  if (hasExplicitPeriod) {
    const periodStart = normalizeDate(input.periodStart, 'periodStart')
    const periodEnd = normalizeDate(input.periodEnd, 'periodEnd')
    if (periodStart > periodEnd) throw new ServiceError('bad_request', '分析开始日期不能晚于结束日期。', 400)
    return { studentUserId, periodStart, periodEnd, generatedBy: input.generatedBy ?? null }
  }

  const days = normalizePeriodDays(input.periodDays)
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(end.getUTCDate() - days + 1)
  return {
    studentUserId,
    periodStart: toDateOnly(start),
    periodEnd: toDateOnly(end),
    generatedBy: input.generatedBy ?? null,
  }
}

function normalizeBehaviorEvent(value: unknown, fallbackPageViewId: string | null): BehaviorEventInsert | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const eventType = normalizeEventType(record.type ?? record.eventType)
  const clientEventId = normalizeText(record.clientEventId ?? record.id, 160)
  if (!eventType || !clientEventId) return null
  const clientPageViewId = normalizeText(record.pageViewId ?? record.clientPageViewId, 160) ?? fallbackPageViewId
  const pathAndUrl = sanitizeEventUrl(record.path, record.url)
  const metadata = sanitizeMetadata(record.metadata)

  return {
    clientEventId,
    clientPageViewId,
    eventType,
    occurredAt: normalizeOccurredAt(record.occurredAt),
    path: pathAndUrl.path,
    sanitizedUrl: pathAndUrl.sanitizedUrl,
    title: trimText(record.title, 160),
    levelId: trimText(record.levelId, 120),
    submissionId: normalizeUuid(record.submissionId),
    assessmentAttemptId: normalizeUuid(record.assessmentAttemptId),
    durationMs: normalizeInteger(record.durationMs, 0, 86_400_000),
    count: normalizeInteger(record.count, 0, 1_000_000),
    result: trimText(record.result, 80),
    metadata,
  }
}

function normalizeEventType(value: unknown): BehaviorEventType | null {
  if (typeof value !== 'string') return null
  return EVENT_TYPE_SET.has(value as BehaviorEventType) ? (value as BehaviorEventType) : null
}

function sanitizeEventUrl(pathValue: unknown, urlValue: unknown): { path: string | null; sanitizedUrl: string | null } {
  const rawUrl = typeof urlValue === 'string' ? urlValue : ''
  const rawPath = typeof pathValue === 'string' ? pathValue : ''
  const candidate = rawUrl || rawPath
  if (!candidate) return { path: null, sanitizedUrl: null }

  try {
    const parsed = new URL(candidate, 'https://spcg.local')
    const params = new URLSearchParams()
    parsed.searchParams.forEach((value, key) => {
      params.set(key, isSensitiveKey(key) ? '[redacted]' : value.slice(0, 120))
    })
    const query = params.toString()
    return {
      path: parsed.pathname || '/',
      sanitizedUrl: `${parsed.pathname || '/'}${query ? `?${query}` : ''}`,
    }
  } catch {
    const path = rawPath || rawUrl.split('?')[0] || '/'
    return {
      path: path.slice(0, 500),
      sanitizedUrl: path.slice(0, 700),
    }
  }
}

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeMetadataValue(value, 0)
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return {}
  const json = JSON.stringify(sanitized)
  if (json.length <= MAX_METADATA_CHARS) return sanitized as Record<string, unknown>
  return { truncated: true, size: json.length }
}

function sanitizeMetadataValue(value: unknown, depth: number): unknown {
  if (depth > 3) return undefined
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') return value.length > 500 ? value.slice(0, 500) : value
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMetadataValue(item, depth + 1)).filter((item) => item !== undefined)
  if (typeof value !== 'object') return undefined

  const output: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_METADATA_KEYS.has(key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())) continue
    const sanitized = sanitizeMetadataValue(nestedValue, depth + 1)
    if (sanitized !== undefined) output[key.slice(0, 80)] = sanitized
  }
  return output
}

function normalizeBehaviorAnalysis(value: Record<string, unknown>): BehaviorAnalysisResult {
  return {
    overview: readText(value.overview, '本周期已有可分析的学习行为数据。'),
    learningRhythm: readText(value.learningRhythm, '学习节奏需要结合提交与停留继续观察。'),
    routeFindings: readStringArray(value.routeFindings).slice(0, 8),
    ideHabits: readStringArray(value.ideHabits).slice(0, 8),
    focusOnCoding: normalizeFocusOnCoding(value.focusOnCoding),
    debuggingPattern: readText(value.debuggingPattern, '调试模式需要结合后续提交继续观察。'),
    repairProgress: readText(value.repairProgress, '修错闭环需要结合后续 AC 记录继续观察。'),
    stuckRisks: readStringArray(value.stuckRisks).slice(0, 8),
    nextActions: readStringArray(value.nextActions).slice(0, 8),
    confidence: readText(value.confidence, 'medium'),
  }
}

function normalizeFocusOnCoding(value: unknown): BehaviorFocusOnCoding {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  return {
    level: readFocusLevel(record.level),
    summary: readText(record.summary, '平台内编程学习专注度需要结合页面和 IDE 行为继续观察。'),
    evidence: readStringArray(record.evidence).slice(0, 8),
    risks: readStringArray(record.risks).slice(0, 8),
  }
}

function tryParseJsonObject(content: string): Record<string, unknown> | null {
  const candidate = content.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:json)?\s*|\s*```$/gi, '').trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function buildPromptHash(input: BehaviorAnalysisInput): string {
  return createHash('sha256')
    .update(JSON.stringify({ version: PROMPT_VERSION, input: buildPromptSafeAnalysisInput(input) }))
    .digest('hex')
}

function normalizeOccurredAt(value: unknown): string {
  if (typeof value === 'string') {
    const date = new Date(value)
    if (Number.isFinite(date.getTime())) return date.toISOString()
  }
  return new Date().toISOString()
}

function normalizeDate(value: string | null | undefined, label: string): string {
  const text = value?.trim() ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new ServiceError('bad_request', `${label} must be YYYY-MM-DD.`, 400)
  }
  return text
}

function normalizePeriodDays(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return DEFAULT_PERIOD_DAYS
  return Math.max(1, Math.min(value, 90))
}

function normalizeUuid(value: unknown): string | null {
  const text = trimText(value, 80)
  return text && UUID_PATTERN.test(text) ? text : null
}

function normalizeInteger(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function normalizeText(value: unknown, maxLength: number): string | null {
  return trimText(value, maxLength)
}

function trimText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function readText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function readOptionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
}

function readFocusLevel(value: unknown): BehaviorFocusLevel {
  return value === 'high' || value === 'medium' || value === 'low' || value === 'unknown' ? value : 'unknown'
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  return SENSITIVE_QUERY_KEYS.some((sensitive) => normalized.includes(sensitive))
}

function formatMarkdownList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- 暂无明显信号。'
}

function formatMinutes(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  return `${minutes} 分钟`
}

function formatRatio(runCount: number, submitCount: number): string {
  if (submitCount <= 0) return runCount > 0 ? '仅运行未提交' : '暂无运行提交'
  return `${(runCount / submitCount).toFixed(1)}:1`
}

function formatFocusLevel(level: BehaviorFocusLevel): string {
  if (level === 'high') return '高'
  if (level === 'medium') return '中'
  if (level === 'low') return '低'
  return '证据不足'
}

function formatVerdictCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).filter(([, count]) => count > 0)
  return entries.length > 0 ? entries.map(([result, count]) => `${result}×${count}`).join('、') : '暂无提交结果'
}

function countActiveDays(events: BehaviorAnalysisInput['recentEvents']): number {
  return new Set(events.map((event) => event.occurredAt.slice(0, 10))).size
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function buildAnthropicMessagesUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '')
  if (normalized.endsWith('/v1/messages')) return normalized
  if (normalized.endsWith('/v1')) return `${normalized}/messages`
  return `${normalized}/v1/messages`
}

function buildOpenAIChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '')
  if (normalized.endsWith('/chat/completions')) return normalized
  return `${normalized}/chat/completions`
}
