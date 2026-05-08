import { notFound } from 'next/navigation'
import { LESSON_ROLE_SUMMARIES } from '@spcg/shared/curriculum'
import { getImportBatch } from '@/lib/admin-data'
import { listAdminProblemSets } from '@/lib/services/problem-set-service'
import { reviewImportBatch, setImportBatchTarget, updateImportItemMode } from '../actions'

type AdminImportDetailPageProps = {
  params: Promise<{ batchId: string }> | { batchId: string }
}

export default async function AdminImportDetailPage({ params }: AdminImportDetailPageProps) {
  const { batchId } = await params
  const [batch, problemSets] = await Promise.all([getImportBatch(batchId), listAdminProblemSets()])

  if (!batch) notFound()
  const lessonSets = problemSets.filter((set) => set.type === 'lesson')
  const targetLevel = batch.targetSpcgLevel ?? 1

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Import Detail</span>
          <h1>{batch.batchKey ?? batch.id}</h1>
        </div>
        <em className={`admin-status admin-status-${batch.status}`}>{batch.status}</em>
      </header>

      <section className="admin-detail-grid">
        <article className="admin-panel">
          <h2>Metadata</h2>
          <dl className="admin-dl">
            <dt>ID</dt>
            <dd>{batch.id}</dd>
            <dt>Source</dt>
            <dd>{batch.source}</dd>
            <dt>Items</dt>
            <dd>{batch.itemCount}</dd>
            <dt>Review Note</dt>
            <dd>{batch.reviewNote ?? 'None'}</dd>
            <dt>Target</dt>
            <dd>
              {batch.targetSpcgLevel && batch.targetProblemSetId
                ? `SPCG ${batch.targetSpcgLevel}级 / ${batch.targetProblemSetTitle ?? batch.targetProblemSetId} / ${batch.defaultItemMode}`
                : 'Not set'}
            </dd>
            <dt>Summary</dt>
            <dd>{JSON.stringify(batch.summary)}</dd>
          </dl>
        </article>

        <article className="admin-panel">
          <h2>Target Stage</h2>
          <form action={setImportBatchTarget} className="admin-form-grid">
            <input name="batchId" type="hidden" value={batch.id} />
            <label>
              <span>SPCG Level</span>
              <select name="targetSpcgLevel" defaultValue={targetLevel}>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((level) => (
                  <option key={level} value={level}>
                    SPCG {level}级
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Default Mode</span>
              <select name="defaultItemMode" defaultValue={batch.defaultItemMode}>
                <DisplayModeOptions />
              </select>
            </label>
            <label className="admin-form-span-2">
              <span>Target Stage</span>
              <select name="targetProblemSetId" defaultValue={batch.targetProblemSetId ?? ''} required>
                <option value="" disabled>
                  Select a stage
                </option>
                {lessonSets.map((set) => (
                  <option key={set.id} value={set.id}>
                    SPCG {set.spcgLevel}级 / 第{set.stageNo}关 / {set.track}线 / {set.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="admin-button" type="submit">
              Save Target
            </button>
          </form>
        </article>
      </section>

      <section className="admin-detail-grid">
        <article className="admin-panel">
          <h2>Review Flow</h2>
          <div className="admin-action-stack">
            <ReviewButton batchId={batch.id} status="approved" label="Approve batch" disabled={batch.status === 'approved'} />
            <ReviewButton batchId={batch.id} status="rejected" label="Reject batch" disabled={batch.status === 'rejected'} />
            <ReviewButton
              batchId={batch.id}
              status="imported"
              label="Attach & mark imported"
              disabled={batch.status === 'imported' || !batch.targetProblemSetId}
            />
          </div>
        </article>
      </section>

      <section className="admin-table">
        <div className="admin-table-head admin-import-item-grid">
          <span>Level</span>
          <span>File</span>
          <span>Validation</span>
          <span>Status / Mode</span>
        </div>
        {batch.items.map((item) => (
          <article className="admin-table-row admin-import-item-grid" key={item.levelId}>
            <span>
              {item.title}
              <small>{item.levelId}</small>
            </span>
            <span>{item.filePath ?? '-'}</span>
            <span>{item.validationStatus}</span>
            <div className="admin-status-stack">
              <span>{item.status}</span>
              <form action={updateImportItemMode} className="admin-inline-field">
                <input name="batchId" type="hidden" value={batch.id} />
                <input name="levelId" type="hidden" value={item.levelId} />
                <select className="admin-inline-input" name="displayMode" defaultValue={item.displayMode ?? batch.defaultItemMode}>
                  <DisplayModeOptions />
                </select>
                <button className="admin-small-button" type="submit">
                  Save
                </button>
              </form>
            </div>
          </article>
        ))}
        {batch.items.length === 0 ? <p className="admin-empty">No import items recorded yet.</p> : null}
      </section>
    </section>
  )
}

function DisplayModeOptions() {
  return (
    <>
      {LESSON_ROLE_SUMMARIES.map((role) => (
        <option key={role.mode} value={role.mode}>
          {role.mode} · {role.label}
        </option>
      ))}
    </>
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
      <button className="admin-button" type="submit" disabled={disabled}>
        {label}
      </button>
    </form>
  )
}
