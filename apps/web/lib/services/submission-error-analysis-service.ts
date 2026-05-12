import { createHash } from 'node:crypto'
import type { CodeErrorAnalysis, SubmissionErrorAnalysis, TestCase, Verdict } from '@spcg/shared/types'
import { getLanguageLabel, normalizeLanguageMode } from '@spcg/shared/language-config'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  findLatestSubmissionErrorAnalysis,
  getSubmissionErrorAnalysisContextForAdmin,
  getSubmissionErrorAnalysisContextForTeacher,
  getSubmissionErrorAnalysisContextForUser,
  insertSubmissionErrorAnalysis,
  type SubmissionErrorAnalysisContext,
} from '@/lib/repositories/submission-error-analysis-repository'
import { requireTeacher } from '@/lib/services/teacher-service'
import { requireFeatureAccess } from '@/lib/services/entitlement-service'
import {
  generateCodeErrorAnalysisWithMiniMax,
  getMiniMaxCodeHelpConfig,
  type MiniMaxCodeHelpConfig,
} from '@/lib/services/minimax-code-help-client'

export type ExplainSubmissionErrorResult =
  | {
      ok: true
      analysis: CodeErrorAnalysis
      record: SubmissionErrorAnalysis
      cached: boolean
    }
  | {
      ok: false
      error: string
    }

const PROVIDER = 'minimax'
const PROMPT_VERSION = 'spcg-error-analysis-v2'
const ANALYZABLE_RESULTS = new Set<Verdict['result']>(['WA', 'TLE', 'MLE', 'RE', 'CE', 'PE', 'Judge Error'])
const OLD_NON_STRUCTURED_FALLBACK_SUMMARY = 'AI 返回了非结构化分析。'

export async function explainSubmissionErrorForUser(input: {
  userId?: string | null
  submissionId: string
}): Promise<ExplainSubmissionErrorResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: '数据库未配置，无法保存 AI 错误分析。' }
  if (!input.userId) return { ok: false, error: '当前未登录，无法生成 AI 错误分析。' }
  if (!input.submissionId) return { ok: false, error: '提交记录不存在。' }

  const context = await getSubmissionErrorAnalysisContextForUser({
    submissionId: input.submissionId,
    userId: input.userId,
  })

  if (!context) return { ok: false, error: '提交记录不存在。' }
  try {
    await requireFeatureAccess({ userId: input.userId, feature: 'ai_analysis' })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '当前用户类型无法使用 AI 错误分析。' }
  }
  return explainSubmissionErrorWithContext(context)
}

export async function explainSubmissionErrorForAdmin(input: {
  submissionId: string
}): Promise<ExplainSubmissionErrorResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: '数据库未配置，无法保存 AI 错误分析。' }
  if (!input.submissionId) return { ok: false, error: '提交记录不存在。' }

  const context = await getSubmissionErrorAnalysisContextForAdmin({
    submissionId: input.submissionId,
  })

  if (!context) return { ok: false, error: '提交记录不存在。' }
  return explainSubmissionErrorWithContext(context)
}

export async function explainSubmissionErrorForTeacher(input: {
  teacherUserId?: string | null
  submissionId: string
}): Promise<ExplainSubmissionErrorResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: '数据库未配置，无法保存 AI 错误分析。' }
  const teacher = await requireTeacher(input.teacherUserId)
  if (!input.submissionId) return { ok: false, error: '提交记录不存在。' }

  const context = await getSubmissionErrorAnalysisContextForTeacher({
    submissionId: input.submissionId,
    teacherUserId: teacher.userId,
  })

  if (!context) return { ok: false, error: '提交记录不存在，或你没有查看这个学生提交的权限。' }
  try {
    await requireFeatureAccess({ userId: context.userId, feature: 'ai_analysis' })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '该学生用户类型无法使用 AI 错误分析。' }
  }
  return explainSubmissionErrorWithContext(context)
}

async function explainSubmissionErrorWithContext(
  context: SubmissionErrorAnalysisContext,
): Promise<ExplainSubmissionErrorResult> {
  if (!context.verdict || context.status === 'pending' || context.status === 'judging') {
    return { ok: false, error: '判题尚未完成，请等结果出来后再分析。' }
  }
  if (!ANALYZABLE_RESULTS.has(context.verdict.result)) {
    return { ok: false, error: 'AC 提交不需要错误分析。' }
  }

  const existing = await findLatestSubmissionErrorAnalysis({
    submissionId: context.submissionId,
    provider: PROVIDER,
  })

  if (existing) {
    if (existing.analysis.summary !== OLD_NON_STRUCTURED_FALLBACK_SUMMARY) {
      return { ok: true, analysis: existing.analysis, record: existing, cached: true }
    }
  }

  const config = await getMiniMaxCodeHelpConfig()
  const promptHash = buildPromptHash(context, config)

  if (!config.configured) {
    return { ok: false, error: config.enabled ? 'MiniMax API Key 未配置，AI 错误分析暂不可用。' : 'AI 错误分析已关闭。' }
  }

  try {
    const { analysis, model } = await generateCodeErrorAnalysisWithMiniMax(buildPrompts(context))
    const record = await insertSubmissionErrorAnalysis({
      submissionId: context.submissionId,
      provider: PROVIDER,
      model,
      verdictResult: context.verdict.result as Exclude<Verdict['result'], 'AC'>,
      analysis,
      rawError: context.verdict.errorDetail ?? context.verdict.childFriendlyMessage ?? null,
      promptHash,
    })

    return { ok: true, analysis, record, cached: false }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'AI 错误分析失败。',
    }
  }
}

function buildPromptHash(context: SubmissionErrorAnalysisContext, config: MiniMaxCodeHelpConfig): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: PROMPT_VERSION,
        apiMode: config.apiMode,
        model: config.model,
        submissionId: context.submissionId,
        levelId: context.levelId,
        code: context.code,
        language: context.resolvedLanguage ?? context.language,
        verdict: context.verdict,
        publicCases: context.level.publicCases,
      }),
    )
    .digest('hex')
}

function buildPrompts(context: SubmissionErrorAnalysisContext): {
  systemPrompt: string
  userPrompt: string
} {
  const language = getLanguageLabel(normalizeLanguageMode(context.resolvedLanguage ?? context.language))
  const verdict = context.verdict
  const publicCases = context.level.publicCases.slice(0, 3).map(formatPublicCase).join('\n\n') || '无公开样例。'

  return {
    systemPrompt: [
      '你是 SPCG 的少儿编程教练，专门帮助学生理解编译错误、运行错误和错误答案。',
      '你只能解释错误原因、定位思路、下一步修改方向，不能直接给完整 AC 代码。',
      '不要使用隐藏测试点，不要猜测未提供的隐藏样例。',
      '必须全部使用简体中文回答；除了 C++、Python、WA、CE、RE、TLE、AC、变量名、函数名、编译器原文片段外，禁止输出英文解释句。',
      '如果判题错误详情是英文，你必须先理解后用简体中文解释，不要直接照抄英文长句。',
      '只输出一个合法 JSON 对象，不要 Markdown，不要代码块，不要额外说明，不要 thinking。',
      '输出必须能被 JSON.parse 直接解析；不要使用 ```json，不要在 JSON 前后加文字。',
      '回答顺序必须先突出“错在哪里”，再用列表分析原因。',
      'JSON 字段必须是：whereWrong:string, summary:string, likelyCause:string, reasonList:string[], lineHints:string[], nextSteps:string[], fixedConcept:string。',
      'whereWrong 用 1 句中文直接指出最关键错误位置或错误行为。',
      'reasonList 用 2-5 条中文列表说明原因，每条短而具体。',
      'lineHints 用 1-5 条中文定位提示，尽量指出相关代码行、变量、循环、条件或输出格式。',
      'nextSteps 用 2-5 条中文步骤，指导学生如何验证和修正，但不要给完整 AC 代码。',
    ].join('\n'),
    userPrompt: [
      '请严格按 system 指定 JSON schema 输出。所有解释必须是简体中文。',
      '你最终只能返回下面这种 JSON 对象结构，字段名不能变，不能补充其他文本：',
      '{"whereWrong":"一句话指出错误位置","summary":"一句话总结","likelyCause":"主要原因","reasonList":["原因1","原因2"],"lineHints":["定位提示1"],"nextSteps":["步骤1","步骤2"],"fixedConcept":"相关知识点"}',
      '请先判断“错在哪里”，再用列表分析原因。',
      '',
      `题目：${context.level.title}`,
      `知识点：${context.level.knowledgePoint}`,
      `语言：${language}`,
      `时间限制：${context.level.timeLimitMs} ms`,
      `内存限制：${context.level.memoryLimitMb} MB`,
      '',
      '题目描述：',
      context.level.description,
      '',
      '输入格式：',
      context.level.inputFormat,
      '',
      '输出格式：',
      context.level.outputFormat,
      '',
      '公开样例：',
      publicCases,
      '',
      '判题结果：',
      JSON.stringify(
        {
          result: verdict?.result,
          passedCases: verdict?.passedCases,
          totalCases: verdict?.totalCases,
          failedCaseIndex: verdict?.failedCaseIndex,
          message: verdict?.childFriendlyMessage,
          errorDetail: verdict?.errorDetail,
        },
        null,
        2,
      ),
      '',
      '学生提交代码：',
      context.code,
    ].join('\n'),
  }
}

function formatPublicCase(testCase: TestCase, index: number): string {
  return [
    `样例 ${index + 1}:`,
    `输入：\n${testCase.input || '(无输入)'}`,
    `期望输出：\n${testCase.expectedOutput || '(无输出)'}`,
    testCase.note ? `说明：${testCase.note}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
