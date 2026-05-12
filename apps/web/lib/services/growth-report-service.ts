import { createHash, randomBytes } from 'crypto'
import type { GrowthReportDelivery, GrowthReportDetail, GrowthReportSettings, GrowthReportSummary } from '@spcg/shared/types'
import {
  createGrowthReportWithDeliveries,
  getGrowthReportAnalysisInput,
  getGrowthReportByTokenHash,
  listGrowthReportsForStudent,
} from '@/lib/repositories/growth-report-repository'
import { canUseSystemSettingsStore, getSystemSetting } from '@/lib/repositories/system-settings-repository'
import { ServiceError } from '@/lib/services/errors'
import { buildGrowthReportDraft } from '@/lib/services/growth-report-analyzer'
import { requireTeacherCanAccessStudent, requireTeacherManagesStudent } from '@/lib/services/teacher-service'
import { requireFeatureAccess } from '@/lib/services/entitlement-service'

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
  const draft = buildGrowthReportDraft(analysis)
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
    periodDays: 7,
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

function normalizePeriod(periodStart?: string | null, periodEnd?: string | null, periodDays = 7) {
  if (periodStart || periodEnd) {
    const start = normalizeDate(periodStart, 'periodStart')
    const end = normalizeDate(periodEnd, 'periodEnd')
    if (start > end) throw new ServiceError('bad_request', '报告开始日期不能晚于结束日期。', 400)
    return { periodStart: start, periodEnd: end }
  }

  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(end.getUTCDate() - Math.max(1, Math.min(periodDays, 31)) + 1)
  return {
    periodStart: toDateOnly(start),
    periodEnd: toDateOnly(end),
  }
}

function normalizeDate(value: string | null | undefined, label: string) {
  const text = value?.trim() ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new ServiceError('bad_request', `${label} must be YYYY-MM-DD.`, 400)
  }
  return text
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
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
    triggerMode: value.triggerMode === 'scheduled' ? 'scheduled' : fallback.triggerMode,
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
