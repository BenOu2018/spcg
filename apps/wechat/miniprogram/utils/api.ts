import { API_BASE_URL } from '../config'

const TOKEN_STORAGE_KEY = 'spcg_parent_mobile_token'

type HttpMethod = 'GET' | 'POST'

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | {
      ok: false
      error: {
        code: string
        message: string
        retryAfterSeconds?: number
      }
    }

export type ReportAvailability = {
  canRequestReport: boolean
  nextAvailableAt: string | null
  retryAfterSeconds: number | null
}

export type ParentAccount = {
  id: string
  username: string
  email: string | null
  displayName: string | null
  avatarUrl: string | null
}

export type GrowthReportSummary = {
  id: string
  studentUserId: string
  title: string
  periodStart: string
  periodEnd: string
  status: 'pending' | 'generated' | 'failed' | 'revoked'
  publicUrl: string | null
  errorMessage: string | null
  tokenExpiresAt: string
  createdAt: string
}

export type GrowthReportDetail = GrowthReportSummary & {
  markdown: string
  summary: Record<string, unknown>
}

export type ParentStudentSummary = {
  studentUserId: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  currentLevelId: string | null
  currentLevelTitle: string | null
  currentSpcgLevel: number | null
  passedCount: number
  submissionCount: number
  activeDaysLast14: number
  learningStreakDays: number
  lastSubmittedAt: string | null
  latestReport: GrowthReportSummary | null
  reportAvailability: ReportAvailability
}

export type ParentDashboard = {
  parent: ParentAccount
  students: ParentStudentSummary[]
}

export type ParentAuthResult = ParentDashboard & {
  token: string
  expiresAt: string
}

export class ApiRequestError extends Error {
  code: string
  retryAfterSeconds: number | null
  statusCode: number | null

  constructor(message: string, code = 'request_failed', retryAfterSeconds: number | null = null, statusCode: number | null = null) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
    this.statusCode = statusCode
  }
}

export function getStoredToken(): string | null {
  const token = wx.getStorageSync(TOKEN_STORAGE_KEY)
  return typeof token === 'string' && token ? token : null
}

export function setStoredToken(token: string): void {
  wx.setStorageSync(TOKEN_STORAGE_KEY, token)
}

export function clearStoredToken(): void {
  wx.removeStorageSync(TOKEN_STORAGE_KEY)
}

export function registerParent(data: {
  email: string
  displayName: string
  password: string
  confirmPassword: string
  inviteCode: string
}): Promise<ParentAuthResult> {
  return request<ParentAuthResult>({ path: '/api/mobile/parent/auth/register', method: 'POST', data })
}

export function signInParent(data: {
  email: string
  password: string
}): Promise<ParentAuthResult> {
  return request<ParentAuthResult>({ path: '/api/mobile/parent/auth/sign-in', method: 'POST', data })
}

export function signOutParent(token: string): Promise<{ signedOut: boolean }> {
  return request<{ signedOut: boolean }>({ path: '/api/mobile/parent/auth/sign-out', method: 'POST', token })
}

export function getParentDashboard(token: string): Promise<ParentDashboard> {
  return request<ParentDashboard>({ path: '/api/mobile/parent/me', token })
}

export function bindStudent(token: string, inviteCode: string): Promise<ParentDashboard> {
  return request<ParentDashboard>({ path: '/api/mobile/parent/students/bind', method: 'POST', token, data: { inviteCode } })
}

export function getStudentReports(token: string, studentUserId: string): Promise<{
  reports: GrowthReportSummary[]
  reportAvailability: ReportAvailability
}> {
  return request<{ reports: GrowthReportSummary[]; reportAvailability: ReportAvailability }>({
    path: `/api/mobile/parent/students/${studentUserId}/reports`,
    token,
  })
}

export function requestStudentReport(token: string, studentUserId: string): Promise<{
  report: GrowthReportDetail
  reportAvailability: ReportAvailability
}> {
  return request<{ report: GrowthReportDetail; reportAvailability: ReportAvailability }>({
    path: `/api/mobile/parent/students/${studentUserId}/reports`,
    method: 'POST',
    token,
  })
}

export function getStudentReportDetail(token: string, studentUserId: string, reportId: string): Promise<{
  report: GrowthReportDetail
}> {
  return request<{ report: GrowthReportDetail }>({
    path: `/api/mobile/parent/students/${studentUserId}/reports/${reportId}`,
    token,
  })
}

function request<T>(options: {
  path: string
  method?: HttpMethod
  data?: Record<string, unknown>
  token?: string | null
}): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${options.path}`,
      method: options.method ?? 'GET',
      data: options.data,
      header: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      success(response) {
        const body = response.data as ApiEnvelope<T> | undefined
        if (body?.ok) {
          resolve(body.data)
          return
        }
        reject(
          new ApiRequestError(
            body?.error?.message ?? '请求失败，请稍后再试。',
            body?.error?.code,
            body?.error?.retryAfterSeconds ?? null,
            response.statusCode,
          ),
        )
      },
      fail() {
        reject(new ApiRequestError('网络连接失败，请检查 API 地址。'))
      },
    })
  })
}
