import Link from 'next/link'
import { listAdminProblemSets } from '@/lib/services/problem-set-service'
import { createLessonProblemSetAction, setProblemSetStatus } from './actions'

export default async function AdminProblemSetsPage() {
  const sets = await listAdminProblemSets()

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Curation</span>
          <h1>Problem Sets</h1>
        </div>
        <span className="admin-count">{sets.length} total</span>
      </header>

      <article className="admin-panel">
        <h2>New Lesson Problem Set</h2>
        <form action={createLessonProblemSetAction} className="admin-form-grid admin-form-grid-lesson">
          <label>
            <span>ID</span>
            <input name="problemSetId" placeholder="spcg1-stage1-a" required />
          </label>
          <label>
            <span>Title</span>
            <input name="title" placeholder="早安雾镇" required />
          </label>
          <label>
            <span>SPCG Level</span>
            <input name="spcgLevel" min={1} max={10} type="number" required />
          </label>
          <label>
            <span>Stage</span>
            <input name="stageNo" min={1} type="number" required />
          </label>
          <label>
            <span>Track</span>
            <select name="track" required defaultValue="A">
              <option value="A">A</option>
              <option value="B">B</option>
            </select>
          </label>
          <label>
            <span>Visibility</span>
            <select name="visibility" required defaultValue="admin">
              <option value="admin">admin</option>
              <option value="student">student</option>
            </select>
          </label>
          <label className="admin-form-span-2">
            <span>Lesson Focus</span>
            <input name="lessonFocus" placeholder="输出语句、变量、顺序结构" required />
          </label>
          <label className="admin-form-span-2">
            <span>Description</span>
            <input name="description" placeholder="5-10 题课程题单，后续可生成教案" />
          </label>
          <button className="admin-button" type="submit">
            Create Lesson Set
          </button>
        </form>
      </article>

      <section className="admin-table">
        <div className="admin-table-head admin-set-grid">
          <span>Set</span>
          <span>Course</span>
          <span>Items</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {sets.map((set) => (
          <article className="admin-table-row admin-set-grid" key={set.id}>
            <div>
              <Link className="admin-title-link" href={`/admin/problem-sets/${set.id}`}>
                {set.title}
              </Link>
              <small>{set.description ?? set.id}</small>
            </div>
            <span>
              {courseLabel(set)}
              <small>{set.type}</small>
            </span>
            <span>{set.itemCount}</span>
            <AdminStatus status={set.status} />
            <div className="admin-row-actions">
              <StatusButton problemSetId={set.id} status="published" label="Publish" disabled={set.status === 'published'} />
              <StatusButton problemSetId={set.id} status="archived" label="Archive" disabled={set.status === 'archived'} />
            </div>
          </article>
        ))}
        {sets.length === 0 ? <p className="admin-empty">No problem sets yet.</p> : null}
      </section>
    </section>
  )
}

function StatusButton({
  problemSetId,
  status,
  label,
  disabled,
}: {
  problemSetId: string
  status: string
  label: string
  disabled: boolean
}) {
  return (
    <form action={setProblemSetStatus}>
      <input name="problemSetId" type="hidden" value={problemSetId} />
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

function courseLabel(set: {
  type: string
  spcgLevel: number | null
  stageNo: number | null
  track: string | null
  lessonFocus: string | null
}) {
  if (set.type !== 'lesson') return '-'
  return `SPCG ${set.spcgLevel} / 第${set.stageNo}关 / ${set.track}线${set.lessonFocus ? ` · ${set.lessonFocus}` : ''}`
}
