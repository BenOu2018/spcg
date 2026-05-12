import type { GrowthReportStructuredSummary } from '@spcg/shared/types'
import type { GrowthReportAnalysisInput } from '@/lib/repositories/growth-report-repository'

export type GrowthReportDraft = {
  title: string
  markdown: string
  summary: GrowthReportStructuredSummary
}

export function buildGrowthReportDraft(input: GrowthReportAnalysisInput): GrowthReportDraft {
  const attemptedProblems = input.progress.filter((item) => item.attemptCount > 0)
  const passedProblems = input.progress.filter((item) => item.passed)
  const pendingRepair = input.progress.filter((item) => !item.passed && item.attemptCount > 0)
  const repairedProblems = input.progress.filter((item) => item.passed && item.attemptCount > 1)
  const weakVerdicts = buildWeakVerdicts(input.verdictCounts)
  const knowledgePoints = buildKnowledgePoints(passedProblems)
  const rhythm = describeLearningRhythm(input.submissionCount, input.periodStart, input.periodEnd)
  const nextActions = buildNextActions({ pendingRepairCount: pendingRepair.length, weakVerdicts, knowledgePoints })

  const title = `${input.student.displayName ?? input.student.username ?? '学员'} 成长报告`
  const summary: GrowthReportStructuredSummary = {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    submissionCount: input.submissionCount,
    acceptedCount: input.acSubmissionCount,
    passedProblemCount: passedProblems.length,
    pendingRepairCount: pendingRepair.length,
    weakVerdicts,
    knowledgePoints,
    nextActions,
  }

  const markdown = [
    `# ${title}`,
    '',
    '## 报告周期',
    '',
    `- 时间：${input.periodStart} 至 ${input.periodEnd}`,
    `- 学员：${input.student.displayName ?? input.student.username ?? input.student.userId}`,
    '',
    '## 学习概览',
    '',
    `- 提交次数：${input.submissionCount}`,
    `- AC 次数：${input.acSubmissionCount}`,
    `- 已通过题目：${passedProblems.length}`,
    `- 待修错题：${pendingRepair.length}`,
    `- 修错成功题：${repairedProblems.length}`,
    `- 本周期金币变化：${input.rewardCoinDelta}`,
    `- 本周期蒜粒变化：${input.rewardGarlicDelta}`,
    '',
    '## 判题结果分布',
    '',
    buildVerdictTable(input.verdictCounts),
    '',
    '## 知识点覆盖',
    '',
    knowledgePoints.length > 0
      ? knowledgePoints.map((point) => `- ${point}`).join('\n')
      : '- 本周期暂无可统计的已通过知识点。',
    '',
    '## 待修错题',
    '',
    pendingRepair.length > 0
      ? pendingRepair
          .slice(0, 10)
          .map((item) => `- ${item.title}：已尝试 ${item.attemptCount} 次，最近提交 ${formatDateTime(item.lastSubmittedAt)}`)
          .join('\n')
      : '- 暂无待修错题。',
    '',
    '## 考试与段位',
    '',
    `- 当前段位：${input.wallet?.title ?? input.wallet?.rank ?? '暂无段位数据'}`,
    `- 当前金币：${input.wallet?.coinTotal ?? 0}`,
    input.assessments.length > 0
      ? input.assessments
          .slice(0, 5)
          .map((attempt) => `- ${attempt.title ?? '段位赛'}：${attempt.score ?? 0} 分，通过 ${attempt.acceptedCount}/${attempt.totalCount} 题，${attempt.status}`)
          .join('\n')
      : '- 本周期暂无考试记录。',
    '',
    '## 学习节奏',
    '',
    `- ${rhythm}`,
    '',
    '## 下一步建议',
    '',
    nextActions.map((action) => `- ${action}`).join('\n'),
    '',
    '## 说明',
    '',
    '- 本报告只基于学习行为、提交结果、知识点覆盖和考试记录生成。',
    '- 报告不包含源码、手机号、邮箱、隐藏测试点输入输出，也不生成性别、智力、EQ、性格等敏感画像。',
  ].join('\n')

  return { title, markdown, summary }
}

function buildVerdictTable(verdictCounts: Record<string, number>) {
  const rows = ['AC', 'WA', 'CE', 'RE', 'TLE', 'MLE', 'PE'].map((verdict) => `| ${verdict} | ${verdictCounts[verdict] ?? 0} |`)
  return ['| 结果 | 次数 |', '|---|---:|', ...rows].join('\n')
}

function buildWeakVerdicts(verdictCounts: Record<string, number>) {
  return Object.entries(verdictCounts)
    .filter(([verdict, count]) => verdict !== 'AC' && count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([verdict, count]) => `${verdict}×${count}`)
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

function buildNextActions(input: {
  pendingRepairCount: number
  weakVerdicts: string[]
  knowledgePoints: string[]
}) {
  const actions: string[] = []
  if (input.pendingRepairCount > 0) {
    actions.push(`优先完成 ${input.pendingRepairCount} 道待修错题，先把最近 WA/CE 的题修到 AC。`)
  } else {
    actions.push('保持当前节奏，可尝试本关提高题或下一关基础题。')
  }
  if (input.weakVerdicts.length > 0) {
    actions.push(`重点复盘 ${input.weakVerdicts.join('、')} 对应的错误原因。`)
  }
  if (input.knowledgePoints.length > 0) {
    actions.push('把已通过知识点整理成一页错题/模板笔记，方便下次考试前复习。')
  }
  actions.push('建议每次练习控制在 30-45 分钟，连续失败时先看样例、画图或向老师提问。')
  return actions
}

function describeLearningRhythm(submissionCount: number, periodStart: string, periodEnd: string) {
  const start = new Date(`${periodStart}T00:00:00.000Z`)
  const end = new Date(`${periodEnd}T00:00:00.000Z`)
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
  const average = submissionCount / days
  if (submissionCount === 0) return '本周期暂无提交记录，建议先安排一次短时复习或模板题练习。'
  if (average < 1) return '提交节奏偏低，可从每日 1 道复习题开始恢复手感。'
  if (average <= 8) return '提交节奏较稳定，适合继续推进主线题和修错题。'
  return '提交较密集，建议关注连续失败和长时间练习后的休息。'
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}
