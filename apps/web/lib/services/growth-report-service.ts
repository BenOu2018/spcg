import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import type { GrowthReportDelivery, GrowthReportDetail, GrowthReportSettings, GrowthReportSummary } from '@spcg/shared/types'
import {
  createGrowthReportWithDeliveries,
  getGrowthReportDetailForStudent,
  getGrowthReportGenerationJob,
  getGrowthReportAnalysisInput,
  getGrowthReportByTokenHash,
  getLatestChargeableGrowthReportForStudent,
  listGrowthReportDetailsForStudent,
  listGrowthReportsForStudent,
  markGrowthReportFailed,
  markGrowthReportGenerated,
  type GrowthReportAnalysisInput,
  type GrowthReportDetailRecord,
  type GrowthReportSummaryRecord,
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
import { requireParentOwnsStudent } from '@/lib/services/parent-service'
import { requireFeatureAccess } from '@/lib/services/entitlement-service'
import { getLocalDateRangeEndingToday } from '@/lib/student-date'

const DEFAULT_TOKEN_DAYS = 30
const PARENT_REPORT_COOLDOWN_DAYS = 14
const GROWTH_REPORT_SETTING_KEY = 'growth_report'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,160}$/

type EncryptedGrowthReportToken =
  | {
      algorithm: 'aes-256-gcm'
      iv: string
      tag: string
      ciphertext: string
    }
  | {
      algorithm: 'plain-dev'
      token: string
    }

export type GeneratedGrowthReport = {
  report: GrowthReportDetail
  deliveries: GrowthReportDelivery[]
  publicUrl: string
}

export type GrowthReportRequestAvailability = {
  canRequestReport: boolean
  nextAvailableAt: string | null
  retryAfterSeconds: number | null
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
  return createPendingGrowthReport({
    studentUserId: input.studentUserId,
    generatedBy: access.teacherUserId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  })
}

export async function generateGrowthReportForParentStudent(input: {
  parentUserId?: string | null
  studentUserId: string
}): Promise<GeneratedGrowthReport> {
  if (!input.parentUserId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  await requireParentOwnsStudent({
    parentUserId: input.parentUserId,
    studentUserId: input.studentUserId,
  })
  await requireFeatureAccess({ userId: input.studentUserId, feature: 'parent_reports' })
  const availability = await getGrowthReportRequestAvailability(input.studentUserId)
  if (!availability.canRequestReport) {
    throw new ServiceError(
      'rate_limited',
      '家长报告 14 天内只能申请一次，请稍后再试。',
      429,
      availability.retryAfterSeconds ?? undefined,
    )
  }

  return createPendingGrowthReport({
    studentUserId: input.studentUserId,
    generatedBy: input.parentUserId,
  })
}

async function createPendingGrowthReport(input: {
  studentUserId: string
  generatedBy: string
  periodStart?: string | null
  periodEnd?: string | null
}): Promise<GeneratedGrowthReport> {
  const settings = await getGrowthReportSettings()
  if (!settings.enabled) throw new ServiceError('forbidden', '成长报告功能暂未启用。', 403)
  const period = normalizePeriod(input.periodStart, input.periodEnd, settings.periodDays)
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)
  const publicTokenEncrypted = encryptPublicToken(token)
  const tokenExpiresAt = new Date(Date.now() + settings.tokenTtlDays * 86_400_000).toISOString()

  const created = await createGrowthReportWithDeliveries({
    studentUserId: input.studentUserId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    status: 'pending',
    title: '家长学习报告生成中',
    markdown: buildPendingReportMarkdown(period.periodStart, period.periodEnd),
    summary: buildPendingReportSummary(period.periodStart, period.periodEnd),
    tokenHash,
    publicTokenEncrypted,
    tokenExpiresAt,
    generatedBy: input.generatedBy,
    channels: settings.channels,
  })

  return {
    report: withDetailPublicUrl(created.report),
    deliveries: created.deliveries,
    publicUrl: buildPublicUrl(token),
  }
}

export async function completeGrowthReportGeneration(reportId: string): Promise<GrowthReportDetail | null> {
  const job = await getGrowthReportGenerationJob(reportId)
  if (!job || job.status !== 'pending') return null

  try {
    const analysis = await getGrowthReportAnalysisInput({
      studentUserId: job.studentUserId,
      periodStart: job.periodStart,
      periodEnd: job.periodEnd,
    })
    const draft = await buildGrowthReportDraftWithOptionalMiniMax(analysis)
    const report = await markGrowthReportGenerated({
      reportId,
      title: draft.title,
      markdown: draft.markdown,
      summary: draft.summary,
    })
    return report ? withDetailPublicUrl(report) : null
  } catch (error) {
    await markGrowthReportFailed({
      reportId,
      errorMessage: toGrowthReportFailureMessage(error),
    }).catch(() => null)
    return null
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
  const reports = await listGrowthReportsForStudent(input.studentUserId, input.limit)
  return reports.map(withSummaryPublicUrl)
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
  const reports = await listGrowthReportDetailsForStudent(input.studentUserId, input.limit)
  return reports.map(withDetailPublicUrl)
}

export async function getParentStudentGrowthReports(input: {
  parentUserId?: string | null
  studentUserId: string
  limit?: number
}): Promise<GrowthReportSummary[]> {
  if (!input.parentUserId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  await requireParentOwnsStudent({
    parentUserId: input.parentUserId,
    studentUserId: input.studentUserId,
  })
  const reports = await listGrowthReportsForStudent(input.studentUserId, input.limit)
  return reports.map(withSummaryPublicUrl)
}

export async function getParentStudentGrowthReportDetail(input: {
  parentUserId?: string | null
  studentUserId: string
  reportId: string
}): Promise<GrowthReportDetail> {
  if (!input.parentUserId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  await requireParentOwnsStudent({
    parentUserId: input.parentUserId,
    studentUserId: input.studentUserId,
  })
  const report = await getGrowthReportDetailForStudent({
    studentUserId: input.studentUserId,
    reportId: input.reportId,
  })
  if (!report) throw new ServiceError('not_found', '没有找到这份家长报告。', 404)
  return withDetailPublicUrl(report)
}

export async function getGrowthReportRequestAvailability(studentUserId: string): Promise<GrowthReportRequestAvailability> {
  const latest = await getLatestChargeableGrowthReportForStudent(studentUserId)
  if (!latest) return { canRequestReport: true, nextAvailableAt: null, retryAfterSeconds: null }

  const nextAvailableAt = new Date(new Date(latest.createdAt).getTime() + PARENT_REPORT_COOLDOWN_DAYS * 86_400_000)
  const retryAfterSeconds = Math.ceil((nextAvailableAt.getTime() - Date.now()) / 1000)
  if (retryAfterSeconds <= 0) return { canRequestReport: true, nextAvailableAt: null, retryAfterSeconds: null }

  return {
    canRequestReport: false,
    nextAvailableAt: nextAvailableAt.toISOString(),
    retryAfterSeconds,
  }
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

function buildPublicUrl(token: string) {
  return `/reports/growth/${token}`
}

function buildPendingReportMarkdown(periodStart: string, periodEnd: string) {
  return [
    '# 家长学习报告',
    '',
    `报告周期：${periodStart} 至 ${periodEnd}。`,
    '',
    '报告正在生成中，请稍后在列表中打开查看。',
  ].join('\n')
}

function buildPendingReportSummary(periodStart: string, periodEnd: string): Record<string, unknown> {
  return {
    reportVersion: 'parent-learning-report-v2',
    periodStart,
    periodEnd,
    headline: '报告正在生成中。',
    confidence: 'low',
    confidenceReason: '报告尚未完成生成。',
    submissionCount: 0,
    acceptedCount: 0,
    passedProblemCount: 0,
    pendingRepairCount: 0,
    weakVerdicts: [],
    knowledgePoints: [],
    nextActions: [],
    generationProvider: 'local',
  }
}

function withSummaryPublicUrl(report: GrowthReportSummaryRecord): GrowthReportSummary {
  const { publicTokenEncrypted: _publicTokenEncrypted, ...safeReport } = report
  const token = decryptPublicToken(report.publicTokenEncrypted)
  return {
    ...safeReport,
    publicUrl: token ? buildPublicUrl(token) : null,
  }
}

function withDetailPublicUrl(report: GrowthReportDetailRecord): GrowthReportDetail {
  const { publicTokenEncrypted: _publicTokenEncrypted, ...safeReport } = report
  const token = decryptPublicToken(report.publicTokenEncrypted)
  return {
    ...safeReport,
    publicUrl: token ? buildPublicUrl(token) : null,
  }
}

function encryptPublicToken(token: string): EncryptedGrowthReportToken {
  const key = getPublicTokenEncryptionKey()
  if (!key) return { algorithm: 'plain-dev', token }

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

function decryptPublicToken(value: Record<string, unknown> | null | undefined): string | null {
  if (!value) return null
  if (value.algorithm === 'plain-dev' && typeof value.token === 'string') return value.token
  if (
    value.algorithm !== 'aes-256-gcm' ||
    typeof value.iv !== 'string' ||
    typeof value.tag !== 'string' ||
    typeof value.ciphertext !== 'string'
  ) {
    return null
  }

  const key = getPublicTokenEncryptionKey()
  if (!key) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

function getPublicTokenEncryptionKey(): Buffer | null {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  return secret ? createHash('sha256').update(secret).digest() : null
}

function toGrowthReportFailureMessage(error: unknown) {
  if (error instanceof ServiceError && error.status < 500) return error.message.slice(0, 500)
  return '报告生成失败，请稍后重试。'
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
