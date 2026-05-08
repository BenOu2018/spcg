import Link from 'next/link'
import type { ReactNode } from 'react'
import { listAdminLevels, listAdminUsers, listAuditLogs, listImportBatches, listProblemSets } from '@/lib/admin-data'
import {
  ADMIN_OVERVIEW_VERDICT_RESULTS,
  getAdminOverview,
  type AdminOverviewVerdictResult,
} from '@/lib/services/admin-overview-service'

export default async function AdminOverviewPage() {
  const [levels, users, problemSets, imports, auditLogs, overview] = await Promise.all([
    listAdminLevels(),
    listAdminUsers(),
    listProblemSets(),
    listImportBatches(),
    listAuditLogs(),
    getAdminOverview(),
  ])

  const publishedLevels = levels.filter((level) => level.status === 'published').length
  const pendingImports = imports.filter((batch) => batch.status === 'validated' || batch.status === 'draft').length
  const verdictTotal = ADMIN_OVERVIEW_VERDICT_RESULTS.reduce(
    (total, result) => total + (overview.dailyStats.verdictCounts[result] ?? 0),
    0,
  )

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Operations</span>
          <h1>Admin Overview</h1>
        </div>
        <Link className="admin-secondary-link" href="/map">
          Back to game
        </Link>
      </header>

      <section className="admin-metrics admin-metrics-wide">
        <AdminMetric label="CPU" value={overview.serverMetrics.cpu.label} hint={overview.serverMetrics.cpu.detail} />
        <AdminMetric label="Memory" value={overview.serverMetrics.memory.label} hint={overview.serverMetrics.memory.detail} />
        <AdminMetric label="Disk" value={overview.serverMetrics.disk.label} hint={overview.serverMetrics.disk.detail} />
        <AdminMetric
          label="Inbound"
          value={overview.serverMetrics.networkInbound.label}
          hint={overview.serverMetrics.networkInbound.detail}
        />
        <AdminMetric
          label="Outbound"
          value={overview.serverMetrics.networkOutbound.label}
          hint={overview.serverMetrics.networkOutbound.detail}
        />
        <AdminMetric
          label="Today In"
          value={overview.serverMetrics.networkTodayInbound.label}
          hint={overview.serverMetrics.networkTodayInbound.detail}
        />
        <AdminMetric
          label="Today Out"
          value={overview.serverMetrics.networkTodayOutbound.label}
          hint={overview.serverMetrics.networkTodayOutbound.detail}
        />
      </section>

      <section className="admin-metrics">
        <AdminMetric label="Active Today" value={overview.dailyStats.activeUsersToday} />
        <AdminMetric label="Submissions Today" value={overview.dailyStats.submissionsToday} />
        <AdminMetric label="Avg Judge Time" value={formatSeconds(overview.dailyStats.averageJudgeSeconds)} />
        <AdminMetric label="Published Levels" value={publishedLevels} />
        <AdminMetric label="Total Levels" value={levels.length} />
        <AdminMetric label="Users" value={users.length} />
        <AdminMetric label="Problem Sets" value={problemSets.length} />
        <AdminMetric label="Pending Imports" value={pendingImports} />
        <AdminMetric label="Queue Pending" value={overview.judgeQueue.pendingCount} />
        <AdminMetric label="Queue Judging" value={overview.judgeQueue.judgingCount} />
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Today Verdict Ratio</h2>
          <small>{verdictTotal} judged submissions</small>
        </div>
        <div className="admin-verdict-ratio">
          {ADMIN_OVERVIEW_VERDICT_RESULTS.map((result) => {
            const count = overview.dailyStats.verdictCounts[result] ?? 0
            const percent = verdictTotal === 0 ? 0 : Math.round((count / verdictTotal) * 100)
            return (
              <div className="admin-verdict-ratio-row" key={result}>
                <span>{result}</span>
                <div className="admin-verdict-meter" aria-label={`${result} ${percent}%`}>
                  <i className={`admin-verdict-fill ${verdictStatusClass(result)}`} style={{ width: `${percent}%` }} />
                </div>
                <strong>{percent}%</strong>
                <small>{count}</small>
              </div>
            )
          })}
        </div>
      </section>

      <section className="admin-grid-2">
        <article className="admin-panel">
          <div className="admin-panel-head">
            <h2>Recent Imports</h2>
            <Link href="/admin/imports">View all</Link>
          </div>
          <div className="admin-list">
            {imports.slice(0, 5).map((batch) => (
              <Link className="admin-list-row" href={`/admin/imports/${batch.id}`} key={batch.id}>
                <span>{batch.batchKey ?? batch.id}</span>
                <AdminStatus status={batch.status} />
              </Link>
            ))}
          </div>
        </article>

        <article className="admin-panel">
          <div className="admin-panel-head">
            <h2>Recent Audit Logs</h2>
            <Link href="/admin/audit-logs">View all</Link>
          </div>
          <div className="admin-list">
            {auditLogs.slice(0, 5).map((log) => (
              <div className="admin-list-row" key={log.id}>
                <span>{log.action}</span>
                <small>{log.resourceType}</small>
              </div>
            ))}
            {auditLogs.length === 0 ? <p className="admin-empty">No audit logs yet.</p> : null}
          </div>
        </article>

        <article className="admin-panel">
          <div className="admin-panel-head">
            <h2>Judge Queue</h2>
            <Link href="/api/mobile/admin/judge-queue">JSON</Link>
          </div>
          <div className="admin-list">
            <div className="admin-list-row">
              <span>Average pending wait</span>
              <small>{formatSeconds(overview.judgeQueue.averagePendingWaitSeconds)}</small>
            </div>
            <div className="admin-list-row">
              <span>Recent failures</span>
              <small>{`${Math.round(overview.judgeQueue.recentFailureRate * 100)}%`}</small>
            </div>
            <div className="admin-list-row">
              <span>Recent completed / errors</span>
              <small>{`${overview.judgeQueue.recentDoneCount} / ${overview.judgeQueue.recentErrorCount}`}</small>
            </div>
          </div>
        </article>

        <article className="admin-panel">
          <div className="admin-panel-head">
            <h2>Stuck Problems</h2>
            <small>Last 7 days</small>
          </div>
          <div className="admin-list">
            {overview.stuckProblems.map((item) => (
              <div className="admin-list-row admin-list-row-stacked" key={`${item.userId}:${item.levelId}`}>
                <span>
                  {item.userDisplayName ?? item.userEmail ?? 'Unknown user'} · {item.levelTitle}
                </span>
                <small>
                  {item.nonAcceptedCount} non-AC · {item.latestResult} · {formatDateTime(item.latestSubmittedAt)}
                </small>
              </div>
            ))}
            {overview.stuckProblems.length === 0 ? <p className="admin-empty">No unresolved stuck problems.</p> : null}
          </div>
        </article>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Recent System Error Logs</h2>
          <small>Latest 50</small>
        </div>
        <div className="admin-error-log-list">
          {overview.systemErrors.map((log) => (
            <div className="admin-error-log-row" key={log.id}>
              <div>
                <em className={`admin-status admin-system-log-${log.level}`}>{log.level}</em>
                <strong>{log.source}</strong>
                <small>{formatDateTime(log.createdAt)}</small>
              </div>
              <p>{log.message}</p>
              <small>
                {[log.method, log.path, log.userDisplayName ?? log.userEmail].filter(Boolean).join(' · ') || 'No request context'}
              </small>
            </div>
          ))}
          {overview.systemErrors.length === 0 ? <p className="admin-empty">No system error logs yet.</p> : null}
        </div>
      </section>
    </section>
  )
}

function AdminMetric({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <article className="admin-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  )
}

function AdminStatus({ status }: { status: string }) {
  return <em className={`admin-status admin-status-${status}`}>{status}</em>
}

function verdictStatusClass(result: AdminOverviewVerdictResult): string {
  if (result === 'AC') return 'admin-verdict-ac'
  if (result === 'WA' || result === 'Judge Error' || result === 'Other') return 'admin-verdict-wa'
  if (result === 'CE') return 'admin-verdict-ce'
  if (result === 'RE') return 'admin-verdict-re'
  if (result === 'TLE' || result === 'MLE') return 'admin-verdict-tle'
  if (result === 'PE') return 'admin-verdict-pe'
  return 'admin-verdict-wa'
}

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}m ${rest}s`
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
