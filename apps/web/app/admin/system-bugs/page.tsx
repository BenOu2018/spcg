import Link from 'next/link'
import { getAdminSystemBugs } from '@/lib/services/system-bug-service'

export const dynamic = 'force-dynamic'

export default async function AdminSystemBugsPage() {
  const bugs = await getAdminSystemBugs(100)
  const openCount = bugs.filter((bug) => bug.status === 'open').length

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Debug</span>
          <h1>System Bugs</h1>
        </div>
        <span className="admin-count">
          {bugs.length} recent · {openCount} open
        </span>
      </header>

      <section className="admin-table">
        <div className="admin-table-head admin-system-bug-grid">
          <span>Status</span>
          <span>Reporter</span>
          <span>Page</span>
          <span>Description</span>
          <span>IDE</span>
          <span>Created</span>
        </div>
        {bugs.map((bug) => (
          <article className="admin-table-row admin-system-bug-grid" key={bug.id}>
            <span>
              <em className={`admin-status admin-status-${bug.status}`}>{bug.status}</em>
            </span>
            <span>
              {bug.userDisplayName ?? bug.userEmail ?? bug.userId ?? '-'}
              <small>{bug.userEmail ?? bug.userId ?? '-'}</small>
            </span>
            <span>
              <Link className="admin-title-link" href={bug.url}>
                {bug.pathname}
              </Link>
              <small>{bug.url}</small>
            </span>
            <span>
              <Link className="admin-title-link" href={`/admin/system-bugs/${bug.id}`}>
                {summarize(bug.description, 96)}
              </Link>
              <small>{bug.id.slice(0, 8)}</small>
            </span>
            <span>
              {bug.ideLevelId ? 'with code' : 'no IDE'}
              <small>{bug.ideLevelTitle ?? bug.ideLevelId ?? '-'}</small>
            </span>
            <span>{new Date(bug.createdAt).toLocaleString()}</span>
          </article>
        ))}
        {bugs.length === 0 ? <p className="admin-empty">No system bug reports yet.</p> : null}
      </section>
    </section>
  )
}

function summarize(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}
