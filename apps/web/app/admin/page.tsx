import Link from 'next/link'
import { listAdminLevels, listAdminUsers, listAuditLogs, listImportBatches, listProblemSets } from '@/lib/admin-data'
import { getJudgeQueueHealth } from '@/lib/services/submission-service'

export default async function AdminOverviewPage() {
  const [levels, users, problemSets, imports, auditLogs, judgeQueue] = await Promise.all([
    listAdminLevels(),
    listAdminUsers(),
    listProblemSets(),
    listImportBatches(),
    listAuditLogs(),
    getJudgeQueueHealth().catch(() => null),
  ])

  const publishedLevels = levels.filter((level) => level.status === 'published').length
  const pendingImports = imports.filter((batch) => batch.status === 'validated' || batch.status === 'draft').length

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

      <section className="admin-metrics">
        <AdminMetric label="Published Levels" value={publishedLevels} />
        <AdminMetric label="Total Levels" value={levels.length} />
        <AdminMetric label="Users" value={users.length} />
        <AdminMetric label="Problem Sets" value={problemSets.length} />
        <AdminMetric label="Pending Imports" value={pendingImports} />
        <AdminMetric label="Queue Pending" value={judgeQueue?.pendingCount ?? 0} />
        <AdminMetric label="Queue Judging" value={judgeQueue?.judgingCount ?? 0} />
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
              <small>{judgeQueue ? `${judgeQueue.averagePendingWaitSeconds}s` : '-'}</small>
            </div>
            <div className="admin-list-row">
              <span>Recent failures</span>
              <small>{judgeQueue ? `${Math.round(judgeQueue.recentFailureRate * 100)}%` : '-'}</small>
            </div>
            <div className="admin-list-row">
              <span>Recent completed / errors</span>
              <small>{judgeQueue ? `${judgeQueue.recentDoneCount} / ${judgeQueue.recentErrorCount}` : '-'}</small>
            </div>
          </div>
        </article>
      </section>
    </section>
  )
}

function AdminMetric({ label, value }: { label: string; value: number }) {
  return (
    <article className="admin-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function AdminStatus({ status }: { status: string }) {
  return <em className={`admin-status admin-status-${status}`}>{status}</em>
}
