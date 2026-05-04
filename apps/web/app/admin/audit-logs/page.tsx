import { listAuditLogs } from '@/lib/admin-data'

export default async function AdminAuditLogsPage() {
  const logs = await listAuditLogs()

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Governance</span>
          <h1>Audit Logs</h1>
        </div>
        <span className="admin-count">{logs.length} shown</span>
      </header>

      <section className="admin-table">
        <div className="admin-table-head admin-audit-grid">
          <span>Action</span>
          <span>Resource</span>
          <span>Actor</span>
          <span>Created</span>
        </div>
        {logs.map((log) => (
          <article className="admin-table-row admin-audit-grid" key={log.id}>
            <span>{log.action}</span>
            <span>
              {log.resourceType}
              <small>{log.resourceId ?? '-'}</small>
            </span>
            <span>{log.actorRole ?? '-'}</span>
            <span>{new Date(log.createdAt).toLocaleString()}</span>
          </article>
        ))}
        {logs.length === 0 ? <p className="admin-empty">No audit logs yet.</p> : null}
      </section>
    </section>
  )
}
