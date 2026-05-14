import { createHash, randomBytes } from 'node:crypto'
import type { GrowthReportDetail, GrowthReportSummary } from '@spcg/shared/types'
import { emailExists, usernameExists } from '@/lib/repositories/auth-account-repository'
import {
  bindParentAccountToStudentWithInvite,
  createParentAccountAndBindStudent,
  findParentMobileAuthUserByEmail,
  getParentStudentLearningSummary,
  listParentStudentLearningSummaries,
  ParentInviteConsumeError,
  type ParentMobileAccountRecord,
  type ParentStudentLearningSummaryRecord,
} from '@/lib/repositories/parent-mobile-repository'
import {
  createMobileSessionRecord,
  getActiveMobileSessionAccount,
  revokeMobileSessionByTokenHash,
  touchMobileSession,
} from '@/lib/repositories/mobile-session-repository'
import { findActiveStudentByParentInviteHash } from '@/lib/repositories/student-parent-invite-repository'
import { hashPassword, verifyPassword } from '@/lib/password'
import { hashParentInviteCode } from '@/lib/parent-invite-code'
import { ServiceError } from '@/lib/services/errors'
import {
  generateGrowthReportForParentStudent,
  getGrowthReportRequestAvailability,
  getParentStudentGrowthReportDetail,
  getParentStudentGrowthReports,
  type GeneratedGrowthReport,
  type GrowthReportRequestAvailability,
} from '@/lib/services/growth-report-service'

const MOBILE_SESSION_DAYS = 90

export type ParentMobileStudentSummary = ParentStudentLearningSummaryRecord & {
  latestReport: GrowthReportSummary | null
  reportAvailability: GrowthReportRequestAvailability
}

export type ParentMobileDashboard = {
  parent: ParentMobileAccountRecord
  students: ParentMobileStudentSummary[]
}

export type ParentMobileAuthResult = ParentMobileDashboard & {
  token: string
  expiresAt: string
}

export async function registerParentMobile(input: {
  email: string
  displayName: string
  password: string
  confirmPassword: string
  inviteCode: string
  userAgent?: string | null
}): Promise<ParentMobileAuthResult> {
  const email = normalizeEmail(input.email)
  const displayName = input.displayName.trim()

  if (!isValidEmail(email)) throw new ServiceError('bad_request', '请输入有效的邮箱地址。', 400)
  if (displayName.length < 2 || displayName.length > 24) {
    throw new ServiceError('bad_request', '昵称需要 2-24 个字符。', 400)
  }
  if (input.password.length < 8) throw new ServiceError('bad_request', '密码至少需要 8 位。', 400)
  if (input.password !== input.confirmPassword) throw new ServiceError('bad_request', '两次输入的密码不一致。', 400)
  if (await emailExists(email)) throw new ServiceError('conflict', '这个邮箱已经注册。', 409)

  const invite = await resolveStudentInviteCode(input.inviteCode)
  const passwordHash = await hashPassword(input.password)
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const username = await generateUsernameFromEmail(email, attempt)
    try {
      const parent = await createParentAccountAndBindStudent({
        username,
        email,
        displayName,
        passwordHash,
        studentUserId: invite.studentUserId,
        inviteCodeHash: invite.inviteCodeHash,
      })
      return createParentMobileAuthResult(parent, input.userAgent)
    } catch (error) {
      if (error instanceof ParentInviteConsumeError) throw inviteConsumedError()
      if (isUniqueViolation(error) && isEmailUniqueViolation(error)) {
        throw new ServiceError('conflict', '这个邮箱已经注册。', 409)
      }
      if (isUniqueViolation(error)) continue
      throw error
    }
  }

  throw new Error('Failed to allocate a unique parent username')
}

export async function signInParentMobile(input: {
  email: string
  password: string
  userAgent?: string | null
}): Promise<ParentMobileAuthResult> {
  const email = normalizeEmail(input.email)
  if (!isValidEmail(email)) throw new ServiceError('bad_request', '请输入有效的邮箱地址。', 400)

  const user = await findParentMobileAuthUserByEmail(email)
  if (!user || user.accountStatus === 'suspended' || user.accountStatus === 'deleted') {
    throw new ServiceError('unauthorized', '邮箱或密码不正确。', 401)
  }
  const passwordValid = await verifyPassword(input.password, user.passwordHash)
  if (!passwordValid) throw new ServiceError('unauthorized', '邮箱或密码不正确。', 401)
  if (user.role !== 'parent') throw new ServiceError('forbidden', '该账号不是家长账号。', 403)

  return createParentMobileAuthResult(user, input.userAgent)
}

export async function signOutParentMobile(token: string | null): Promise<void> {
  if (!token) return
  await revokeMobileSessionByTokenHash(hashMobileToken(token))
}

export async function getParentMobileDashboard(token: string | null): Promise<ParentMobileDashboard> {
  const account = await requireParentMobileAccount(token)
  return buildParentMobileDashboard(account)
}

export async function bindStudentForParentMobile(input: {
  token: string | null
  inviteCode: string
}): Promise<ParentMobileDashboard> {
  const account = await requireParentMobileAccount(input.token)
  const invite = await resolveStudentInviteCode(input.inviteCode)
  if (invite.studentUserId === account.id) throw new ServiceError('bad_request', '家长账号不能绑定自己。', 400)
  try {
    await bindParentAccountToStudentWithInvite({
      parentUserId: account.id,
      studentUserId: invite.studentUserId,
      inviteCodeHash: invite.inviteCodeHash,
    })
  } catch (error) {
    if (error instanceof ParentInviteConsumeError) throw inviteConsumedError()
    throw error
  }
  return buildParentMobileDashboard(account)
}

export async function getParentMobileStudent(input: {
  token: string | null
  studentUserId: string
}): Promise<ParentMobileStudentSummary> {
  const account = await requireParentMobileAccount(input.token)
  const summary = await getParentStudentLearningSummary({
    parentUserId: account.id,
    studentUserId: input.studentUserId,
  })
  if (!summary) throw new ServiceError('forbidden', '不能访问未绑定的学生。', 403)
  return enrichStudentSummary(account.id, summary)
}

export async function getParentMobileReports(input: {
  token: string | null
  studentUserId: string
  limit?: number
}): Promise<{
  reports: GrowthReportSummary[]
  reportAvailability: GrowthReportRequestAvailability
}> {
  const account = await requireParentMobileAccount(input.token)
  const reports = await getParentStudentGrowthReports({
    parentUserId: account.id,
    studentUserId: input.studentUserId,
    limit: input.limit,
  })
  const reportAvailability = await getGrowthReportRequestAvailability(input.studentUserId)
  return { reports, reportAvailability }
}

export async function requestParentMobileReport(input: {
  token: string | null
  studentUserId: string
}): Promise<GeneratedGrowthReport & { reportAvailability: GrowthReportRequestAvailability }> {
  const account = await requireParentMobileAccount(input.token)
  const result = await generateGrowthReportForParentStudent({
    parentUserId: account.id,
    studentUserId: input.studentUserId,
  })
  const reportAvailability = await getGrowthReportRequestAvailability(input.studentUserId)
  return { ...result, reportAvailability }
}

export async function getParentMobileReportDetail(input: {
  token: string | null
  studentUserId: string
  reportId: string
}): Promise<GrowthReportDetail> {
  const account = await requireParentMobileAccount(input.token)
  return getParentStudentGrowthReportDetail({
    parentUserId: account.id,
    studentUserId: input.studentUserId,
    reportId: input.reportId,
  })
}

export function readBearerToken(authorizationHeader: string | null): string | null {
  const header = authorizationHeader?.trim() ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() || null
}

async function requireParentMobileAccount(token: string | null): Promise<ParentMobileAccountRecord> {
  if (!token) throw new ServiceError('unauthorized', '当前未登录。', 401)
  const session = await getActiveMobileSessionAccount(hashMobileToken(token))
  if (!session) throw new ServiceError('unauthorized', '登录已过期，请重新登录。', 401)
  if (session.accountStatus === 'suspended' || session.accountStatus === 'deleted') {
    throw new ServiceError('forbidden', '该账号暂不可用。', 403)
  }
  if (session.role !== 'parent') throw new ServiceError('forbidden', '需要家长权限。', 403)
  await touchMobileSession(session.sessionId)
  return {
    id: session.userId,
    username: session.username,
    email: session.email,
    displayName: session.displayName,
    avatarUrl: session.avatarUrl,
  }
}

async function createParentMobileAuthResult(
  parent: ParentMobileAccountRecord,
  userAgent?: string | null,
): Promise<ParentMobileAuthResult> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + MOBILE_SESSION_DAYS * 86_400_000).toISOString()
  const session = await createMobileSessionRecord({
    userId: parent.id,
    tokenHash: hashMobileToken(token),
    expiresAt,
    deviceLabel: 'wechat-miniprogram',
    userAgent,
  })
  const dashboard = await buildParentMobileDashboard(parent)
  return {
    ...dashboard,
    token,
    expiresAt: session.expiresAt,
  }
}

async function buildParentMobileDashboard(parent: ParentMobileAccountRecord): Promise<ParentMobileDashboard> {
  const summaries = await listParentStudentLearningSummaries(parent.id)
  const students = await Promise.all(summaries.map((summary) => enrichStudentSummary(parent.id, summary)))
  return { parent, students }
}

async function enrichStudentSummary(
  parentUserId: string,
  summary: ParentStudentLearningSummaryRecord,
): Promise<ParentMobileStudentSummary> {
  const [reports, reportAvailability] = await Promise.all([
    getParentStudentGrowthReports({
      parentUserId,
      studentUserId: summary.studentUserId,
      limit: 1,
    }),
    getGrowthReportRequestAvailability(summary.studentUserId),
  ])
  return {
    ...summary,
    latestReport: reports[0] ?? null,
    reportAvailability,
  }
}

async function resolveStudentInviteCode(inviteCode: string): Promise<{ studentUserId: string; inviteCodeHash: string }> {
  const code = inviteCode.trim()
  if (!code) throw new ServiceError('bad_request', '请输入学生邀请码。', 400)
  const inviteCodeHash = hashParentInviteCode(code)
  const studentUserId = await findActiveStudentByParentInviteHash(inviteCodeHash)
  if (!studentUserId) throw new ServiceError('not_found', '学生邀请码无效或已失效。', 404)
  return { studentUserId, inviteCodeHash }
}

function inviteConsumedError(): ServiceError {
  return new ServiceError('not_found', '学生邀请码无效、已绑定或已失效。', 404)
}

function hashMobileToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function generateUsernameFromEmail(email: string, attempt: number): Promise<string> {
  const [localPart] = email.split('@')
  const base = normalizeUsernameBase(localPart ?? '')
  const candidate = attempt === 0 ? base : `${base.slice(0, Math.max(3, 24 - 5))}-${randomBytes(2).toString('hex')}`
  if (!(await usernameExists(candidate))) return candidate
  return `${base.slice(0, Math.max(3, 24 - 5))}-${randomBytes(2).toString('hex')}`
}

function normalizeUsernameBase(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 24)
  if (normalized.length >= 3) return normalized
  return `parent-${randomBytes(4).toString('hex')}`.slice(0, 24)
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

function isEmailUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('constraint' in error)) return false
  return String(error.constraint).toLowerCase().includes('email')
}
