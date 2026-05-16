import {
  createSystemBug,
  getSystemBug,
  listSystemBugs,
  updateSystemBugStatus,
  type SystemBugRecord,
  type SystemBugStatus,
} from '@/lib/repositories/system-bug-repository'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import { getUserRole } from '@/lib/repositories/user-repository'
import { getBugReportRuntimeSettings } from '@/lib/services/system-settings-service'
import { ServiceError } from '@/lib/services/errors'
import { RATE_LIMIT_ACTIONS, consumeUserRateLimit } from '@/lib/services/rate-limit-service'

export type SystemBugIdeContext = {
  levelId: string
  levelTitle: string
  language: string
  resolvedLanguage: string
  code: string
}

export type SubmitSystemBugInput = {
  userId?: string | null
  url: string
  pathname: string
  description: string
  ideContext?: SystemBugIdeContext | null
  userAgent?: string | null
  viewport?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export type SubmitSystemBugResult =
  | { ok: true; bugId: string }
  | {
      ok: false
      error: string
      code: 'disabled' | 'unauthorized' | 'invalid' | 'db_unconfigured' | 'rate_limited'
      retryAfterSeconds?: number
    }

const MAX_DESCRIPTION_LENGTH = 2000
const MAX_CODE_LENGTH = 200_000
const TEACHER_BUG_REPORT_RATE_LIMIT_SECONDS = 60
const STUDENT_BUG_REPORT_RATE_LIMIT_SECONDS = 300

const validStatuses = new Set<SystemBugStatus>(['open', 'triaged', 'resolved', 'ignored'])

export async function submitSystemBugReport(input: SubmitSystemBugInput): Promise<SubmitSystemBugResult> {
  if (!isDatabaseConfigured()) return { ok: false, code: 'db_unconfigured', error: '数据库未配置，无法提交问题。' }

  const settings = await getBugReportRuntimeSettings()
  if (!settings.enabled) return { ok: false, code: 'disabled', error: 'Bug 提交功能已关闭。' }

  if (!input.userId) return { ok: false, code: 'unauthorized', error: '请先登录后再提交问题。' }

  const description = normalizeDescription(input.description)
  if (!description) return { ok: false, code: 'invalid', error: '请填写问题描述。' }

  const url = normalizeText(input.url, 2048)
  const pathname = normalizeText(input.pathname, 512)
  if (!url || !pathname) return { ok: false, code: 'invalid', error: '页面地址缺失，无法提交问题。' }

  const role = await getUserRole(input.userId)
  const rateLimitSeconds =
    role === 'teacher'
      ? TEACHER_BUG_REPORT_RATE_LIMIT_SECONDS
      : role === 'student'
        ? STUDENT_BUG_REPORT_RATE_LIMIT_SECONDS
        : 0
  if (rateLimitSeconds > 0) {
    const rateLimit = await consumeUserRateLimit({
      userId: input.userId,
      actionKey: RATE_LIMIT_ACTIONS.bugSubmit,
      windowSeconds: rateLimitSeconds,
    })
    if (!rateLimit.allowed) {
      return {
        ok: false,
        code: 'rate_limited',
        error: rateLimit.message,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      }
    }
  }

  const ideContext = normalizeIdeContext(input.ideContext ?? null)
  const bug = await createSystemBug({
    userId: input.userId,
    url,
    pathname,
    description,
    ideLevelId: ideContext?.levelId ?? null,
    ideLevelTitle: ideContext?.levelTitle ?? null,
    ideLanguage: ideContext?.language ?? null,
    ideResolvedLanguage: ideContext?.resolvedLanguage ?? null,
    ideCode: ideContext?.code ?? null,
    userAgent: normalizeText(input.userAgent ?? '', 1024) || null,
    viewport: normalizeObject(input.viewport),
    metadata: normalizeObject(input.metadata),
  })

  return { ok: true, bugId: bug.id }
}

export async function getAdminSystemBugs(limit = 100): Promise<SystemBugRecord[]> {
  if (!isDatabaseConfigured()) return []
  return listSystemBugs(limit)
}

export async function getAdminSystemBug(id: string): Promise<SystemBugRecord | null> {
  if (!isDatabaseConfigured()) return null
  if (!id) return null
  return getSystemBug(id)
}

export async function updateAdminSystemBug(input: {
  id: string
  status: string
  adminNote: string | null
  admin: {
    userId: string
    role: string
  }
}): Promise<SystemBugRecord> {
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
  if (!validStatuses.has(input.status as SystemBugStatus)) {
    throw new ServiceError('bad_request', '无效的 Bug 状态。', 400)
  }

  return updateSystemBugStatus({
    id: input.id,
    status: input.status as SystemBugStatus,
    adminNote: normalizeText(input.adminNote ?? '', 2000) || null,
    audit: input.admin,
  })
}

function normalizeDescription(value: string): string {
  return normalizeText(value, MAX_DESCRIPTION_LENGTH)
}

function normalizeIdeContext(value: SystemBugIdeContext | null): SystemBugIdeContext | null {
  if (!value || typeof value !== 'object') return null
  const levelId = normalizeText(value.levelId, 200)
  const levelTitle = normalizeText(value.levelTitle, 300)
  const language = normalizeText(value.language, 40)
  const resolvedLanguage = normalizeText(value.resolvedLanguage, 40)
  const code = normalizeText(value.code, MAX_CODE_LENGTH)

  if (!levelId && !code) return null

  return {
    levelId,
    levelTitle,
    language,
    resolvedLanguage,
    code,
  }
}

function normalizeText(value: string, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function normalizeObject(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}
