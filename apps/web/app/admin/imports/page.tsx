import Link from 'next/link'
import { listImportBatches } from '@/lib/admin-data'
import { reviewImportBatch } from './actions'

export default async function AdminImportsPage() {
  const batches = await listImportBatches()

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Content Intake</span>
          <h1>Import Batches</h1>
        </div>
        <span className="admin-count">{batches.length} total</span>
      </header>

      <section className="admin-table">
        <div className="admin-table-head admin-import-grid">
          <span>Batch</span>
          <span>Source</span>
          <span>Items</span>
          <span>Status</span>
          <span>Review</span>
        </div>
        {batches.map((batch) => (
          <article className="admin-table-row admin-import-grid" key={batch.id}>
            <div>
              <Link className="admin-title-link" href={`/admin/imports/${batch.id}`}>
                {batch.batchKey ?? batch.id}
              </Link>
              <small>{batch.createdAt ? new Date(batch.createdAt).toLocaleString() : 'local preview'}</small>
            </div>
            <span>
              {batch.source}
              <small>
                {batch.targetSpcgLevel && batch.targetProblemSetTitle
                  ? `SPCG ${batch.targetSpcgLevel}级 / ${batch.targetProblemSetTitle}`
                  : 'target not set'}
              </small>
            </span>
            <span>{batch.itemCount}</span>
            <AdminStatus status={batch.status} />
            <div className="admin-row-actions">
              <ReviewButton batchId={batch.id} status="approved" label="Approve" disabled={batch.status === 'approved'} />
              <ReviewButton batchId={batch.id} status="rejected" label="Reject" disabled={batch.status === 'rejected'} />
              <ReviewButton batchId={batch.id} status="imported" label="Imported" disabled={batch.status === 'imported'} />
            </div>
          </article>
        ))}
      </section>
    </section>
  )
}

function ReviewButton({
  batchId,
  status,
  label,
  disabled,
}: {
  batchId: string
  status: string
  label: string
  disabled: boolean
}) {
  return (
    <form action={reviewImportBatch}>
      <input name="batchId" type="hidden" value={batchId} />
      <input name="status" type="hidden" value={status} />
      <button className="admin-small-button" type="submit" disabled={disabled}>
        {label}
      </button>
    </form>
  )
}

function AdminStatus({ status }: { status: string }) {
  return <em className={`admin-status admin-status-${status}`}>{status}</em>
}
