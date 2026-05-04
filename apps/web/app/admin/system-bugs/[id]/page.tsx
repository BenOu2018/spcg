import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAdminSystemBug } from '@/lib/services/system-bug-service'
import { updateSystemBugAction } from '../actions'

type AdminSystemBugDetailPageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export const dynamic = 'force-dynamic'

export default async function AdminSystemBugDetailPage({ params }: AdminSystemBugDetailPageProps) {
  const { id } = await params
  const bug = await getAdminSystemBug(id)
  if (!bug) notFound()

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">System Bug Detail</span>
          <h1>{bug.pathname}</h1>
        </div>
        <em className={`admin-status admin-status-${bug.status}`}>{bug.status}</em>
      </header>

      <section className="admin-detail-grid">
        <article className="admin-panel">
          <h2>Report</h2>
          <dl className="admin-dl">
            <dt>ID</dt>
            <dd>{bug.id}</dd>
            <dt>Reporter</dt>
            <dd>{bug.userDisplayName ?? bug.userEmail ?? bug.userId ?? '-'}</dd>
            <dt>URL</dt>
            <dd>
              <Link className="admin-title-link" href={bug.url}>
                {bug.url}
              </Link>
            </dd>
            <dt>Created</dt>
            <dd>{new Date(bug.createdAt).toLocaleString()}</dd>
            <dt>User Agent</dt>
            <dd>{bug.userAgent ?? '-'}</dd>
          </dl>
        </article>

        <article className="admin-panel">
          <h2>Update Status</h2>
          <form action={updateSystemBugAction} className="admin-form-grid">
            <input name="id" type="hidden" value={bug.id} />
            <label>
              <span>Status</span>
              <select name="status" defaultValue={bug.status}>
                <option value="open">open</option>
                <option value="triaged">triaged</option>
                <option value="resolved">resolved</option>
                <option value="ignored">ignored</option>
              </select>
            </label>
            <label className="admin-form-span-2">
              <span>Admin note</span>
              <textarea name="adminNote" rows={4} defaultValue={bug.adminNote ?? ''} placeholder="处理备注、复现线索、后续动作" />
            </label>
            <button className="admin-button" type="submit">
              Save Status
            </button>
          </form>
        </article>
      </section>

      <article className="admin-panel">
        <h2>Description</h2>
        <p className="admin-prewrap">{bug.description}</p>
      </article>

      <section className="admin-detail-grid">
        <article className="admin-panel">
          <h2>IDE Context</h2>
          <dl className="admin-dl">
            <dt>Level</dt>
            <dd>
              {bug.ideLevelId ? (
                <Link className="admin-title-link" href={`/admin/levels/${bug.ideLevelId}`}>
                  {bug.ideLevelTitle ?? bug.ideLevelId}
                </Link>
              ) : (
                '-'
              )}
            </dd>
            <dt>Language</dt>
            <dd>{bug.ideLanguage ? `${bug.ideLanguage} -> ${bug.ideResolvedLanguage ?? '-'}` : '-'}</dd>
            <dt>Code</dt>
            <dd>{bug.ideCode ? `${bug.ideCode.length} chars` : '-'}</dd>
          </dl>
          {bug.ideCode ? <pre className="admin-submission-code">{bug.ideCode}</pre> : <p className="admin-empty">No IDE code captured.</p>}
        </article>

        <article className="admin-panel">
          <h2>Browser Context</h2>
          <dl className="admin-dl">
            <dt>Viewport</dt>
            <dd>
              <pre className="admin-context-json">{JSON.stringify(bug.viewport, null, 2)}</pre>
            </dd>
            <dt>Metadata</dt>
            <dd>
              <pre className="admin-context-json">{JSON.stringify(bug.metadata, null, 2)}</pre>
            </dd>
          </dl>
        </article>
      </section>
    </section>
  )
}
