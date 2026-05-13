import { createHash, randomBytes } from 'crypto'
import type { GrowthReportDelivery, GrowthReportDetail, GrowthReportSettings, GrowthReportSummary } from '@spcg/shared/types'
import {
  createGrowthReportWithDeliveries,
  getGrowthReportAnalysisInput,
  getGrowthReportByTokenHash,
  listGrowthReportDetailsForStudent,
  listGrowthReportsForStudent,
  type GrowthReportAnalysisInput,
} from '@/lib/repositories/growth-report-repository'
import { canUseSystemSettingsStore, getSystemSetting } from '@/lib/repositories/system-settings-repository'
import { ServiceError } from '@/lib/services/errors'
import {
  buildGrowthReportDraft,
  buildGrowthReportPromptPayload,
  buildLocalGrowthReportSections,
  normalizeGrowthReportSections,
  type GrowthReportDraft,
} from '@/lib/services/growth-report-analyzer'
import { generateMiniMaxJsonText } from '@/lib/services/minimax-code-help-client'
import { requireTeacherCanAccessStudent, requireTeacherManagesStudent } from '@/lib/services/teacher-service'
import { requireFeatureAccess } from '@/lib/services/entitlement-service'
import { getLocalDateRangeEndingToday } from '@/lib/student-date'

const DEFAULT_TOKEN_DAYS = 30
const GROWTH_REPORT_SETTING_KEY = 'growth_report'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,160}$/

export type GeneratedGrowthReport = {
  report: GrowthReportDetail
  deliveries: GrowthReportDelivery[]
  publicUrl: string
}

export async function generateGrowthReportForTeacherStudent(input: {
  teacherUserId?: string | null
  studentUserId: string
  periodStart?: string | null
  periodEnd?: string | null
}): Promise<GeneratedGrowthReport> {
  const access = await requireTeacherManagesStudent({
    teacherUserId: input.teacherUserId,
    studentUserId: input.studentUserId,
  })
  await requireFeatureAccess({ userId: input.studentUserId, feature: 'parent_reports' })
  const settings = await getGrowthReportSettings()
  if (!settings.enabled) throw new ServiceError('forbidden', '成长报告功能暂未启用。', 403)
  const period = normalizePeriod(input.periodStart, input.periodEnd, settings.periodDays)
  const analysis = await getGrowthReportAnalysisInput({
    studentUserId: input.studentUserId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  })
  const draft = await buildGrowthReportDraftWithOptionalMiniMax(analysis)
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)
  const tokenExpiresAt = new Date(Date.now() + settings.tokenTtlDays * 86_400_000).toISOString()

  const created = await createGrowthReportWithDeliveries({
    studentUserId: input.studentUserId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    title: draft.title,
    markdown: draft.markdown,
    summary: draft.summary,
    tokenHash,
    tokenExpiresAt,
    generatedBy: access.teacherUserId,
    channels: settings.channels,
  })

  return {
    ...created,
    publicUrl: `/reports/growth/${token}`,
  }
}

export async function getTeacherStudentGrowthReports(input: {
  teacherUserId?: string | null
  studentUserId: string
  limit?: number
}): Promise<GrowthReportSummary[]> {
  await requireTeacherCanAccessStudent({
    teacherUserId: input.teacherUserId,
    studentUserId: input.studentUserId,
  })
  return listGrowthReportsForStudent(input.studentUserId, input.limit)
}

export async function getTeacherStudentGrowthReportDetails(input: {
  teacherUserId?: string | null
  studentUserId: string
  limit?: number
}): Promise<GrowthReportDetail[]> {
  await requireTeacherCanAccessStudent({
    teacherUserId: input.teacherUserId,
    studentUserId: input.studentUserId,
  })
  return listGrowthReportDetailsForStudent(input.studentUserId, input.limit)
}

export async function getPublicGrowthReportByToken(token: string): Promise<GrowthReportDetail | null> {
  const normalized = token.trim()
  if (!TOKEN_PATTERN.test(normalized)) return null
  const report = await getGrowthReportByTokenHash(hashToken(normalized))
  if (!report) return null
  if (report.status !== 'generated') return null
  if (new Date(report.tokenExpiresAt).getTime() <= Date.now()) return null
  return report
}

export function getDefaultGrowthReportSettings(): GrowthReportSettings {
  return {
    enabled: true,
    triggerMode: 'manual',
    frequency: 'weekly',
    periodDays: 14,
    tokenTtlDays: DEFAULT_TOKEN_DAYS,
    channels: ['email', 'sms'],
  }
}

export async function getGrowthReportSettings(): Promise<GrowthReportSettings> {
  const fallback = getDefaultGrowthReportSettings()
  if (!canUseSystemSettingsStore()) return fallback
  try {
    const record = await getSystemSetting<Record<string, unknown>>(GROWTH_REPORT_SETTING_KEY)
    if (!record) return fallback
    return normalizeGrowthReportSettings(record.value, fallback)
  } catch {
    return fallback
  }
}

async function buildGrowthReportDraftWithOptionalMiniMax(input: GrowthReportAnalysisInput): Promise<GrowthReportDraft> {
  const localSections = buildLocalGrowthReportSections(input)

  try {
    const generated = await generateMiniMaxJsonText(buildGrowthReportPrompts(input))
    const parsed = tryParseJsonObject(generated.content)
    const aiSections = normalizeGrowthReportSections(parsed, localSections)
    if (aiSections) {
      return buildGrowthReportDraft(input, {
        sections: aiSections,
        generationProvider: 'minimax',
        generationModel: generated.model,
      })
    }
  } catch {
    // Parent reports must still be generated when MiniMax is unavailable or unsafe.
  }

  return buildGrowthReportDraft(input, {
    sections: localSections,
    generationProvider: 'local',
  })
}

function buildGrowthReportPrompts(input: GrowthReportAnalysisInput): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      '你是 SPCG 的家长学习报告撰写助手。',
      '你只能基于输入 JSON 中已经计算好的聚合指标组织表达，不要自行编造数字、题目、结论或诊断。',
      '报告面向家长，必须温和、清楚、可执行；少用 AC/WA/CE 等术语，如需表达请使用“通过、答案错误、编译错误”等中文说法。',
      '当 totalVisibleMinutes 为 0 但 submissionCount 或 IDE 行为大于 0 时，必须写“页面可见时长数据不足”，禁止写成“学习 0 分钟”。',
      '样本较少或置信度 low 时，只能给温和提醒，不能强判断能力。',
      '不要推断智力、性格、心理健康、家庭背景、性别、收入等敏感画像。',
      '不要输出源码、手机号、邮箱、身份证、隐藏测试点、原始错误详情、stdout、stderr 或 Markdown 代码块。',
      '只输出一个合法 JSON 对象，不要 Markdown 代码块，不要额外说明。',
      'JSON 字段必须是：headline:string, overview:string[], mastery:string[], practiceHabits:string[], debugging:string[], parentActions:string[], dataNotes:string[], confidence:string, confidenceReason:string。',
      'parentActions 输出 3 条以内；每个数组条目都要是短句。',
    ].join('\n'),
    userPrompt: [
      '请基于以下预计算指标生成家长学习报告 JSON。',
      '',
      JSON.stringify(buildGrowthReportPromptPayload(input), null, 2),
    ].join('\n'),
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

function normalizePeriod(periodStart?: string | null, periodEnd?: string | null, periodDays = 14) {
  if (periodStart || periodEnd) {
    const start = normalizeDate(periodStart, 'periodStart')
    const end = normalizeDate(periodEnd, 'periodEnd')
    if (start > end) throw new ServiceError('bad_request', '报告开始日期不能晚于结束日期。', 400)
    return { periodStart: start, periodEnd: end }
  }

  const end = new Date()
  const period = getLocalDateRangeEndingToday(Math.max(1, Math.min(periodDays, 31)), end)
  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  }
}

function normalizeDate(value: string | null | undefined, label: string) {
  const text = value?.trim() ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new ServiceError('bad_request', `${label} must be YYYY-MM-DD.`, 400)
  }
  return text
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function normalizeGrowthReportSettings(
  value: Record<string, unknown>,
  fallback: GrowthReportSettings,
): GrowthReportSettings {
  const channels = Array.isArray(value.channels)
    ? value.channels.filter((channel): channel is 'email' | 'sms' => channel === 'email' || channel === 'sms')
    : fallback.channels
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : fallback.enabled,
    triggerMode: 'manual',
    frequency: value.frequency === 'monthly' ? 'monthly' : fallback.frequency,
    periodDays: normalizePositiveInt(value.periodDays, fallback.periodDays, 1, 31),
    tokenTtlDays: normalizePositiveInt(value.tokenTtlDays, fallback.tokenTtlDays, 1, 365),
    channels: channels.length > 0 ? channels : fallback.channels,
  }
}

function normalizePositiveInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}
