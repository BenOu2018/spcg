import type { GrowthReportStructuredSummary } from '@spcg/shared/types'
import type { GrowthReportAnalysisInput } from '@/lib/repositories/growth-report-repository'

export type GrowthReportDraft = {
  title: string
  markdown: string
  summary: GrowthReportStructuredSummary
}

export type ParentGrowthReportSections = {
  headline: string
  overview: string[]
  mastery: string[]
  practiceHabits: string[]
  debugging: string[]
  parentActions: string[]
  dataNotes: string[]
  confidence: 'high' | 'medium' | 'low'
  confidenceReason: string
}

export type GrowthReportDraftOptions = {
  sections?: ParentGrowthReportSections
  generationProvider?: 'local' | 'minimax'
  generationModel?: string
}

const REPORT_VERSION = 'parent-learning-report-v2'

export function buildGrowthReportDraft(input: GrowthReportAnalysisInput, options: GrowthReportDraftOptions = {}): GrowthReportDraft {
  const localSections = buildLocalGrowthReportSections(input)
  const sections = options.sections ?? localSections
  const periodPassedProblems = input.progress.filter((item) => item.periodAcceptedCount > 0)
  const pendingRepair = input.progress.filter((item) => !item.passed && item.attemptCount > 0)
  const weakVerdicts = buildWeakVerdicts(input.verdictCounts)
  const knowledgePoints = buildKnowledgePoints(periodPassedProblems)
  const title = `${input.student.displayName ?? input.student.username ?? '学员'} 学习报告`

  const summary: GrowthReportStructuredSummary = {
    reportVersion: REPORT_VERSION,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    headline: sections.headline,
    confidence: sections.confidence,
    confidenceReason: sections.confidenceReason,
    submissionCount: input.submissionCount,
    acceptedCount: input.acSubmissionCount,
    passedProblemCount: periodPassedProblems.length,
    pendingRepairCount: pendingRepair.length,
    activeDays: input.activeDays,
    practiceHabitSummary: sections.practiceHabits,
    repairSummary: sections.debugging,
    dataQualityNotes: sections.dataNotes,
    weakVerdicts,
    knowledgePoints,
    nextActions: sections.parentActions,
    generationProvider: options.generationProvider ?? 'local',
    generationModel: options.generationModel,
  }

  return {
    title,
    markdown: renderGrowthReportMarkdown(input, title, sections),
    summary,
  }
}

export function buildLocalGrowthReportSections(input: GrowthReportAnalysisInput): ParentGrowthReportSections {
  const periodAttemptedProblems = input.progress.filter((item) => item.periodAttemptCount > 0)
  const periodPassedProblems = input.progress.filter((item) => item.periodAcceptedCount > 0)
  const pendingRepair = input.progress.filter((item) => !item.passed && item.attemptCount > 0)
  const recentPendingRepair = periodAttemptedProblems.filter((item) => !item.passed)
  const weakVerdicts = buildWeakVerdicts(input.verdictCounts)
  const knowledgePoints = buildKnowledgePoints(periodPassedProblems)
  const confidence = classifyConfidence(input)
  const confidenceReason = describeConfidence(input, confidence)
  const acRate = input.submissionCount > 0 ? Math.round((input.acSubmissionCount / input.submissionCount) * 100) : 0
  const hasVisibleTimeGap = input.behavior.totalVisibleMinutes === 0 && (input.submissionCount > 0 || totalIdeActions(input) > 0)
  const repairedCount = input.repairChains.length

  const headline =
    input.submissionCount === 0
      ? '本周期还没有形成可统计的做题记录，建议先安排一次短练习恢复节奏。'
      : confidence === 'low'
        ? `本周期有 ${input.activeDays || 1} 个活跃日、${input.submissionCount} 次提交、${input.acSubmissionCount} 次通过；样本较少，适合先看练习习惯和待修错题。`
        : `本周期有 ${input.activeDays} 个活跃日、${input.submissionCount} 次提交、${input.acSubmissionCount} 次通过，整体通过率约 ${acRate}%。`

  const overview = compactList([
    `报告周期：${input.periodStart} 至 ${input.periodEnd}。`,
    input.activeDays > 0 ? `活跃练习日：${input.activeDays} 天。` : '本周期暂未记录到提交活跃日。',
    input.submissionCount > 0
      ? `判题提交：${input.submissionCount} 次，其中通过 ${input.acSubmissionCount} 次。`
      : '本周期暂无判题提交。',
    periodAttemptedProblems.length > 0
      ? `练习题目：本周期触达 ${periodAttemptedProblems.length} 题，通过 ${periodPassedProblems.length} 题。`
      : '本周期暂无可统计的练习题目。',
    pendingRepair.length > 0 ? `当前待修错题：${pendingRepair.length} 题。` : '当前暂无待修错题。',
    input.rewardCoinDelta || input.rewardGarlicDelta
      ? `奖励变化：金币 ${formatSigned(input.rewardCoinDelta)}，蒜粒 ${formatSigned(input.rewardGarlicDelta)}。`
      : null,
    input.assessments.length > 0
      ? `测评/段位：${input.assessments.slice(0, 2).map(formatAssessment).join('；')}。`
      : null,
    hasVisibleTimeGap ? '页面可见时长数据不足，本报告主要参考提交、进度和 IDE 行为。' : formatVisibleTime(input),
  ])

  const mastery = compactList([
    knowledgePoints.length > 0
      ? `本周期通过知识点：${knowledgePoints.slice(0, 5).join('、')}。`
      : '本周期暂无新增通过知识点，建议从最近练习题继续巩固。',
    periodPassedProblems.length > 0
      ? `新增通过题目：${periodPassedProblems.slice(0, 5).map((item) => item.title).join('、')}。`
      : null,
    recentPendingRepair.length > 0
      ? `本周期仍需修错：${recentPendingRepair.slice(0, 5).map((item) => item.title).join('、')}。`
      : null,
    weakVerdicts.length > 0
      ? `主要错误类型：${weakVerdicts.join('、')}。这些更适合做短复盘，不建议只看通过率。`
      : input.submissionCount > 0
        ? '本周期未出现明显集中的错误类型。'
        : null,
  ])

  const practiceHabits = compactList([
    describeRunSubmitHabit(input),
    describeSupportUsage(input),
    describeCodeQuality(input),
    describeNonLearningRoute(input),
  ])

  const debugging = compactList([
    repairedCount > 0
      ? `本周期记录到 ${repairedCount} 条“先出错、再通过”的修错链路：${input.repairChains.slice(0, 3).map(formatRepairChain).join('；')}。`
      : null,
    input.behavior.ide.repairSuccessCount > 0 && repairedCount === 0
      ? `IDE 行为中记录到 ${input.behavior.ide.repairSuccessCount} 次修错成功。`
      : null,
    input.submissionCount > input.acSubmissionCount
      ? `还有 ${input.submissionCount - input.acSubmissionCount} 次未通过提交，适合让孩子说清“输入是什么、处理什么、输出什么”。`
      : input.submissionCount > 0
        ? '本周期提交结果整体顺利，可以继续保持提交前自测习惯。'
        : null,
    input.behavior.aiAnalysisCount > 0
      ? `使用 AI 错误分析 ${input.behavior.aiAnalysisCount} 次，其中 ${input.behavior.improvedAfterAiCount} 次后续出现同题通过记录。`
      : null,
  ])

  const parentActions = buildParentActions({
    pendingRepairCount: pendingRepair.length,
    recentPendingRepairCount: recentPendingRepair.length,
    weakVerdicts,
    submitWithoutRun: input.behavior.submitCountWithoutPriorRun,
    submissionCount: input.submissionCount,
    confidence,
  })

  const dataNotes = compactList([
    '本报告由后台手动触发生成，默认覆盖最近 14 天；老师也可以在后台手动选择起止日期。',
    hasVisibleTimeGap ? '页面停留统计可能缺失或被浏览器后台限制，因此没有把“0 分钟”当作真实学习时长。' : null,
    confidence === 'low' ? '本周期样本较少，报告只给温和建议，不对能力做强判断。' : null,
    '代码合理性只使用服务端聚合特征，例如代码规模、空提交风险、疑似固定输出和基础结构；报告不展示源码。',
    '报告不包含手机号、邮箱、身份证、源码、隐藏测试点输入输出或原始错误详情，也不生成性别、智力、性格、心理健康等敏感画像。',
  ])

  return {
    headline,
    overview,
    mastery,
    practiceHabits,
    debugging,
    parentActions,
    dataNotes,
    confidence,
    confidenceReason,
  }
}

export function buildGrowthReportPromptPayload(input: GrowthReportAnalysisInput): Record<string, unknown> {
  const localSections = buildLocalGrowthReportSections(input)
  return {
    reportVersion: REPORT_VERSION,
    student: {
      displayName: input.student.displayName,
      username: input.student.username,
    },
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    metrics: {
      activeDays: input.activeDays,
      submissionCount: input.submissionCount,
      acceptedCount: input.acSubmissionCount,
      verdictCounts: input.verdictCounts,
      periodAttemptedProblemCount: input.progress.filter((item) => item.periodAttemptCount > 0).length,
      periodPassedProblemCount: input.progress.filter((item) => item.periodAcceptedCount > 0).length,
      pendingRepairCount: input.progress.filter((item) => !item.passed && item.attemptCount > 0).length,
      rewardCoinDelta: input.rewardCoinDelta,
      rewardGarlicDelta: input.rewardGarlicDelta,
    },
    behavior: {
      totalVisibleMinutes: input.behavior.totalVisibleMinutes,
      codingVisibleMinutes: input.behavior.codingVisibleMinutes,
      nonLearningVisibleMinutes: input.behavior.nonLearningVisibleMinutes,
      ide: input.behavior.ide,
      submitCountWithPriorRun: input.behavior.submitCountWithPriorRun,
      submitCountWithoutPriorRun: input.behavior.submitCountWithoutPriorRun,
      supportUsage: {
        hintCount: input.behavior.ide.hintCount,
        whiteboardCount: input.behavior.ide.whiteboardCount,
        solutionVideoCount: input.behavior.ide.solutionVideoCount,
        aiAnalysisCount: input.behavior.aiAnalysisCount,
        improvedAfterAiCount: input.behavior.improvedAfterAiCount,
      },
      topLearningPaths: input.behavior.topLearningPaths,
      topNonLearningPaths: input.behavior.topNonLearningPaths,
    },
    mastery: {
      knowledgePoints: buildKnowledgePoints(input.progress.filter((item) => item.periodAcceptedCount > 0)),
      recentPassedProblems: input.progress
        .filter((item) => item.periodAcceptedCount > 0)
        .slice(0, 8)
        .map((item) => item.title),
      recentPendingRepair: input.progress
        .filter((item) => item.periodAttemptCount > 0 && !item.passed)
        .slice(0, 8)
        .map((item) => item.title),
    },
    repairChains: input.repairChains,
    codeQuality: input.codeQuality,
    localBaseline: localSections,
  }
}

export function normalizeGrowthReportSections(value: unknown, fallback: ParentGrowthReportSections): ParentGrowthReportSections | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const sections: ParentGrowthReportSections = {
    headline: readText(record.headline, fallback.headline),
    overview: readStringArray(record.overview).slice(0, 8),
    mastery: readStringArray(record.mastery).slice(0, 8),
    practiceHabits: readStringArray(record.practiceHabits).slice(0, 8),
    debugging: readStringArray(record.debugging).slice(0, 8),
    parentActions: readStringArray(record.parentActions).slice(0, 5),
    dataNotes: readStringArray(record.dataNotes).slice(0, 8),
    confidence: readConfidence(record.confidence, fallback.confidence),
    confidenceReason: readText(record.confidenceReason, fallback.confidenceReason),
  }

  if (
    sections.overview.length === 0 ||
    sections.mastery.length === 0 ||
    sections.practiceHabits.length === 0 ||
    sections.debugging.length === 0 ||
    sections.parentActions.length === 0 ||
    sections.dataNotes.length === 0
  ) {
    return null
  }

  const allText = [
    sections.headline,
    sections.confidenceReason,
    ...sections.overview,
    ...sections.mastery,
    ...sections.practiceHabits,
    ...sections.debugging,
    ...sections.parentActions,
    ...sections.dataNotes,
  ].join('\n')

  return isUnsafeGeneratedReportText(allText) ? null : sections
}

function renderGrowthReportMarkdown(input: GrowthReportAnalysisInput, title: string, sections: ParentGrowthReportSections): string {
  return [
    `# ${title}`,
    '',
    '## 本周期结论',
    '',
    sections.headline,
    '',
    `- 数据置信度：${formatConfidence(sections.confidence)}。${sections.confidenceReason}`,
    '',
    '## 学习概览',
    '',
    formatMarkdownList(sections.overview),
    '',
    '## 掌握情况',
    '',
    formatMarkdownList(sections.mastery),
    '',
    '## 做题习惯',
    '',
    formatMarkdownList(sections.practiceHabits),
    '',
    '## 修错能力',
    '',
    formatMarkdownList(sections.debugging),
    '',
    '## 家长建议',
    '',
    formatMarkdownList(sections.parentActions),
    '',
    '## 数据说明',
    '',
    formatMarkdownList(sections.dataNotes),
    '',
    '<!-- parent-report-schema: parent-learning-report-v2 -->',
  ].join('\n')
}

function buildWeakVerdicts(verdictCounts: Record<string, number>) {
  return Object.entries(verdictCounts)
    .filter(([verdict, count]) => verdict !== 'AC' && count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([verdict, count]) => `${formatVerdictForParent(verdict)}×${count}`)
}

function buildKnowledgePoints(progress: GrowthReportAnalysisInput['progress']) {
  const points = new Map<string, number>()
  for (const item of progress) {
    const key = item.knowledgePoint?.trim() || `SPCG ${item.spcgLevel || '-'}级`
    points.set(key, (points.get(key) ?? 0) + 1)
  }
  return [...points.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([point, count]) => `${point}（通过 ${count} 题）`)
}

function buildParentActions(input: {
  pendingRepairCount: number
  recentPendingRepairCount: number
  weakVerdicts: string[]
  submitWithoutRun: number
  submissionCount: number
  confidence: 'high' | 'medium' | 'low'
}) {
  const actions: string[] = []
  if (input.pendingRepairCount > 0) {
    actions.push(`先陪孩子选 1 道待修错题，请孩子用“输入、处理、输出”三句话讲清楚，再动手改。`)
  } else if (input.submissionCount > 0) {
    actions.push('让孩子挑 1 道本周期通过的题，复述解题思路，确认不是只记答案。')
  } else {
    actions.push('先安排一次 20-30 分钟短练习，以恢复打开题目、读题、运行样例的节奏。')
  }
  if (input.submitWithoutRun > 0) {
    actions.push('约定每次提交前先运行公开样例，样例不通过时先说出原因再提交。')
  } else {
    actions.push('继续保持提交前自测的习惯，重点观察孩子能否解释每次修改的目的。')
  }
  if (input.confidence === 'low') {
    actions.push('本周期样本少，下个周期先看是否能稳定完成 2-3 次短练习。')
  } else if (input.weakVerdicts.length > 0) {
    actions.push(`把 ${input.weakVerdicts[0]} 对应的错题整理成一句“我错在什么”。`)
  } else {
    actions.push('如果孩子讲得清楚，可以让他尝试同关卡提高题或下一题。')
  }
  return actions.slice(0, 3)
}

function describeRunSubmitHabit(input: GrowthReportAnalysisInput): string {
  const ide = input.behavior.ide
  if (ide.submitCount === 0 && input.submissionCount > 0) {
    return '判题表有提交记录，但网页 IDE 行为事件不足，做题过程只能部分还原。'
  }
  if (ide.submitCount === 0) return '本周期暂无可统计的 IDE 提交过程。'
  if (input.behavior.submitCountWithoutPriorRun > 0) {
    return `IDE 记录到 ${ide.submitCount} 次提交，其中 ${input.behavior.submitCountWithoutPriorRun} 次提交前 90 分钟内没有公开样例运行记录，建议减少直接提交试错。`
  }
  return `IDE 记录到 ${ide.runCount} 次运行、${ide.submitCount} 次提交，提交前自测习惯较清晰。`
}

function describeSupportUsage(input: GrowthReportAnalysisInput): string | null {
  const ide = input.behavior.ide
  const supportCount = ide.hintCount + ide.whiteboardCount + ide.solutionVideoCount + input.behavior.aiAnalysisCount
  if (supportCount === 0) return '本周期暂未明显使用提示、白板、讲解视频或 AI 错误分析。'
  const parts = compactList([
    ide.hintCount > 0 ? `提示 ${ide.hintCount} 次` : null,
    ide.whiteboardCount > 0 ? `白板 ${ide.whiteboardCount} 次` : null,
    ide.solutionVideoCount > 0 ? `讲解视频 ${ide.solutionVideoCount} 次` : null,
    input.behavior.aiAnalysisCount > 0 ? `AI 错误分析 ${input.behavior.aiAnalysisCount} 次` : null,
  ])
  return `学习辅助使用：${parts.join('、')}。建议关注“看完后是否能自己修改”。`
}

function describeCodeQuality(input: GrowthReportAnalysisInput): string | null {
  const quality = input.codeQuality
  if (quality.analyzedSubmissionCount === 0) return null
  const notes: string[] = [
    `本周期服务端只记录代码聚合特征：平均约 ${quality.averageLineCount} 行、${quality.averageNonWhitespaceChars} 个非空白字符。`,
  ]
  if (quality.emptyLikeSubmissionCount > 0) {
    notes.push(`${quality.emptyLikeSubmissionCount} 次提交代码规模过小，需要确认是否空提交或误提交。`)
  }
  if (quality.suspiciousHardcodeCount > 0) {
    notes.push(`${quality.suspiciousHardcodeCount} 次提交有疑似固定输出特征，建议让孩子解释代码为什么适用于不同输入。`)
  }
  if (quality.controlFlowSubmissionCount === 0 && quality.analyzedSubmissionCount >= 3) {
    notes.push('本周期提交中暂未看到明显分支或循环特征，若题目需要判断/重复处理，应重点复盘。')
  }
  return notes.join(' ')
}

function describeNonLearningRoute(input: GrowthReportAnalysisInput): string | null {
  if (input.behavior.nonLearningVisibleMinutes <= 0) return null
  const leaderboard = input.behavior.topNonLearningPaths.find((item) => item.path.startsWith('/leaderboard'))
  if (!leaderboard || leaderboard.visibleMinutes <= 0) return null
  return `挑战榜页面可见停留约 ${leaderboard.visibleMinutes} 分钟；这不一定是问题，但家长版不把它计入主要学习成果。`
}

function classifyConfidence(input: GrowthReportAnalysisInput): 'high' | 'medium' | 'low' {
  if (input.submissionCount === 0 && !input.behavior.hasBehaviorEvents) return 'low'
  if (input.submissionCount < 5 || input.activeDays <= 1) return 'low'
  if (input.submissionCount < 10 || input.activeDays < 3) return 'medium'
  return 'high'
}

function describeConfidence(input: GrowthReportAnalysisInput, confidence: 'high' | 'medium' | 'low') {
  if (confidence === 'high') return '提交、活跃天数和过程数据较完整，可以观察趋势。'
  if (confidence === 'medium') return '已有一定提交和过程样本，但仍建议结合下一周期继续观察。'
  if (input.submissionCount > 0) return '本周期样本较少或活跃日偏少，适合作为提醒，不适合做强结论。'
  return '缺少提交和过程样本，只能给练习安排建议。'
}

function formatVisibleTime(input: GrowthReportAnalysisInput): string | null {
  if (input.behavior.totalVisibleMinutes <= 0) return null
  return `平台可见停留约 ${input.behavior.totalVisibleMinutes} 分钟，其中编程学习页面约 ${input.behavior.codingVisibleMinutes} 分钟。`
}

function formatAssessment(input: GrowthReportAnalysisInput['assessments'][number]) {
  return `${input.title} ${input.score ?? 0} 分，通过 ${input.acceptedCount}/${input.totalCount} 题`
}

function formatRepairChain(input: GrowthReportAnalysisInput['repairChains'][number]) {
  return `${input.title}（先出现 ${input.errorCountBeforeAccepted} 次未通过，后通过）`
}

function formatVerdictForParent(verdict: string) {
  const labels: Record<string, string> = {
    AC: '通过',
    WA: '答案错误',
    CE: '编译错误',
    RE: '运行错误',
    TLE: '超时',
    MLE: '内存超限',
    PE: '格式错误',
    'Judge Error': '判题异常',
  }
  return labels[verdict] ?? verdict
}

function totalIdeActions(input: GrowthReportAnalysisInput) {
  const ide = input.behavior.ide
  return (
    ide.editBatchCount +
    ide.runCount +
    ide.submitCount +
    ide.errorCount +
    ide.repairSuccessCount +
    ide.aiErrorAnalysisCount +
    ide.whiteboardCount +
    ide.hintCount +
    ide.solutionVideoCount
  )
}

function formatConfidence(value: 'high' | 'medium' | 'low') {
  if (value === 'high') return '高'
  if (value === 'medium') return '中'
  return '低'
}

function formatMarkdownList(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- 暂无可统计数据。'
}

function compactList(values: Array<string | null | undefined | false>) {
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

function formatSigned(value: number) {
  if (value > 0) return `+${value}`
  return `${value}`
}

function readText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, 500) : fallback
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 500))
}

function readConfidence(value: unknown, fallback: 'high' | 'medium' | 'low'): 'high' | 'medium' | 'low' {
  return value === 'high' || value === 'medium' || value === 'low' ? value : fallback
}

function isUnsafeGeneratedReportText(value: string): boolean {
  const lower = value.toLowerCase()
  if (/#include|int\s+main|using\s+namespace|```|stderr|stdout/.test(lower)) return true
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) return true
  if (/(?:\+?86[- ]?)?1[3-9]\d{9}/.test(value)) return true
  return ['智商', '性格缺陷', '心理健康', '家庭背景', '收入水平', '性别判断', '懒惰'].some((term) => value.includes(term))
}
