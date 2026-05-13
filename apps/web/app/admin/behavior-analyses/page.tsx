import { requireAdmin } from '@/lib/admin-auth'
import { listAdminUsers, type AdminUser } from '@/lib/admin-data'
import { getAdminBehaviorAnalyses } from '@/lib/services/behavior-analytics-service'
import { StatementMarkdown } from '@/components/StatementMarkdown'
import { AdminEmpty, AdminFilterBar, AdminPageHeader, AdminPanel, AdminStatCard } from '../components/AdminChrome'
import { generateAdminBehaviorAnalysisAction } from './actions'

export const dynamic = 'force-dynamic'

type AdminBehaviorAnalysesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

export default async function AdminBehaviorAnalysesPage({ searchParams }: AdminBehaviorAnalysesPageProps) {
  await requireAdmin('support')
  const params = (await searchParams) ?? {}
  const filters = {
    userId: readParam(params.userId) ?? readParam(params.studentUserId),
    userRole: normalizeBehaviorUserRole(readParam(params.userRole)),
    periodStart: readParam(params.periodStart),
    periodEnd: readParam(params.periodEnd),
    behaviorError: readParam(params.behaviorError),
    behaviorMessage: readParam(params.behaviorMessage),
    behaviorReportId: readParam(params.behaviorReportId),
  }
  const [users, analyses] = await Promise.all([
    listAdminUsers(),
    getAdminBehaviorAnalyses({
      studentUserId: filters.userId,
      userRole: filters.userRole,
      periodStart: filters.periodStart,
      periodEnd: filters.periodEnd,
      limit: 120,
    }),
  ])
  const behaviorUsers = users.filter((user) => user.userRole === 'student' || user.userRole === 'teacher')
  const usersById = new Map(users.map((user) => [user.id, user]))
  const minimaxCount = analyses.filter((item) => item.provider === 'minimax').length
  const localCount = analyses.filter((item) => item.provider === 'local').length
  const studentCount = analyses.filter((item) => usersById.get(item.studentUserId)?.userRole === 'student').length
  const teacherCount = analyses.filter((item) => usersById.get(item.studentUserId)?.userRole === 'teacher').length
  const selectedAnalysis = filters.behaviorReportId
    ? analyses.find((analysis) => analysis.id === filters.behaviorReportId) ?? null
    : null

  return (
    <section className="admin-stack">
      <AdminPageHeader
        description="查看和手动生成学生/老师聚合行为分析。分析只使用页面路线、IDE 操作次数、后台路径和判题结果，不包含源码或逐字输入。"
        eyebrow="Behavior"
        title="Behavior Analyses"
      />

      <section className="admin-metrics admin-metrics-wide">
        <AdminStatCard label="Loaded" value={analyses.length} detail="latest matching reports" />
        <AdminStatCard label="MiniMax" value={minimaxCount} detail="AI generated" tone="good" />
        <AdminStatCard label="Local" value={localCount} detail="fallback summaries" />
        <AdminStatCard label="Students" value={studentCount} detail="student reports" />
        <AdminStatCard label="Teachers" value={teacherCount} detail="teacher reports" />
      </section>

      <AdminPanel className="admin-behavior-filter-panel" title="筛选与生成">
        {filters.behaviorError ? <p className="admin-inline-warning">{filters.behaviorError}</p> : null}
        {filters.behaviorMessage ? <p className="admin-inline-success">{filters.behaviorMessage}</p> : null}
        <datalist id="behavior-user-options">
          {behaviorUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {formatAdminBehaviorUser(user)}
            </option>
          ))}
        </datalist>
        <div className="admin-behavior-filter-row">
          <form action="/admin/behavior-analyses" method="get">
            <AdminFilterBar>
              <label>
                <span>User Role</span>
                <select name="userRole" defaultValue={filters.userRole ?? ''}>
                  <option value="">student + teacher</option>
                  <option value="student">student</option>
                  <option value="teacher">teacher</option>
                </select>
              </label>
              <label>
                <span>User ID</span>
                <input name="userId" list="behavior-user-options" placeholder="student or teacher user id" defaultValue={filters.userId ?? ''} />
              </label>
              <label>
                <span>Period From</span>
                <input name="periodStart" type="date" defaultValue={filters.periodStart ?? ''} />
              </label>
              <label>
                <span>Period To</span>
                <input name="periodEnd" type="date" defaultValue={filters.periodEnd ?? ''} />
              </label>
              <button className="admin-button" type="submit">
                Filter
              </button>
            </AdminFilterBar>
          </form>

          <form action={generateAdminBehaviorAnalysisAction}>
            <AdminFilterBar>
              <label>
                <span>Generate Role</span>
                <select name="userRole" defaultValue={filters.userRole ?? 'student'}>
                  <option value="student">student</option>
                  <option value="teacher">teacher</option>
                </select>
              </label>
              <label>
                <span>Generate User ID</span>
                <input name="targetUserId" list="behavior-user-options" placeholder="student or teacher user id" defaultValue={filters.userId ?? ''} required />
              </label>
              <label>
                <span>Quick Period</span>
                <select name="periodDays" defaultValue="7">
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                </select>
              </label>
              <label>
                <span>From</span>
                <input name="periodStart" type="date" />
              </label>
              <label>
                <span>To</span>
                <input name="periodEnd" type="date" />
              </label>
              <button className="admin-button" type="submit">
                Generate
              </button>
            </AdminFilterBar>
          </form>
        </div>
      </AdminPanel>

      <section className="admin-behavior-analysis-layout">
        <AdminPanel title="Reports" description={`${analyses.length} reports`}>
          <div className="admin-behavior-report-list">
            {analyses.map((analysis) => (
              <a
                className={`admin-behavior-report-row${analysis.id === filters.behaviorReportId ? ' active' : ''}`}
                href={buildBehaviorReportHref({ ...filters, behaviorReportId: analysis.id })}
                key={analysis.id}
              >
                <div>
                  <strong>{formatAdminBehaviorUser(usersById.get(analysis.studentUserId), analysis.studentUserId)}</strong>
                  <span>
                    {analysis.periodStart} 至 {analysis.periodEnd} · {new Date(analysis.createdAt).toLocaleString()}
                  </span>
                </div>
                <em className="admin-status">{analysis.analysis.confidence}</em>
              </a>
            ))}
            {analyses.length === 0 ? <AdminEmpty>No behavior analyses match the current filters.</AdminEmpty> : null}
          </div>
        </AdminPanel>

        <AdminPanel
          className="admin-behavior-report-detail-panel"
          title="报告详细内容"
          description={selectedAnalysis ? `${selectedAnalysis.periodStart} 至 ${selectedAnalysis.periodEnd}` : 'Select one report from the left'}
        >
          {selectedAnalysis ? (
            <article className="behavior-analysis-card admin-behavior-detail-card">
              <header>
                <div>
                  <strong>{formatAdminBehaviorUser(usersById.get(selectedAnalysis.studentUserId), selectedAnalysis.studentUserId)}</strong>
                  <span>
                    {selectedAnalysis.periodStart} 至 {selectedAnalysis.periodEnd} · {new Date(selectedAnalysis.createdAt).toLocaleString()} · {selectedAnalysis.provider}/{selectedAnalysis.model}
                  </span>
                </div>
                <em className="admin-status">{selectedAnalysis.analysis.confidence}</em>
              </header>
              {selectedAnalysis.errorMessage ? <p className="admin-muted">{selectedAnalysis.errorMessage}</p> : null}
              <StatementMarkdown markdown={selectedAnalysis.markdown} assets={[]} hideImages />
            </article>
          ) : (
            <AdminEmpty>请选择左侧的一份行为分析报告查看详情。</AdminEmpty>
          )}
        </AdminPanel>
      </section>
    </section>
  )
}

function readParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  const text = raw?.trim() ?? ''
  return text || null
}

function normalizeBehaviorUserRole(value: string | null): 'student' | 'teacher' | null {
  return value === 'student' || value === 'teacher' ? value : null
}

function formatAdminBehaviorUser(user: AdminUser | undefined, fallbackId?: string): string {
  if (!user) return fallbackId ?? 'Unknown user'
  const name = user.displayName ?? user.username ?? user.id
  return `${name} · ${user.userRole} · ${user.username ?? user.id}`
}

function buildBehaviorReportHref(input: {
  userId: string | null
  userRole: 'student' | 'teacher' | null
  periodStart: string | null
  periodEnd: string | null
  behaviorReportId: string
}): string {
  const params = new URLSearchParams()
  if (input.userId) params.set('userId', input.userId)
  if (input.userRole) params.set('userRole', input.userRole)
  if (input.periodStart) params.set('periodStart', input.periodStart)
  if (input.periodEnd) params.set('periodEnd', input.periodEnd)
  params.set('behaviorReportId', input.behaviorReportId)
  return `/admin/behavior-analyses?${params.toString()}`
}
