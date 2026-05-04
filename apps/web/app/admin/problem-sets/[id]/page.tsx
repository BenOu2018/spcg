import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StatementMarkdown } from '@/components/StatementMarkdown'
import {
  getAdminProblemSetDetail,
  listAdminProblemSetLevelCandidates,
} from '@/lib/services/problem-set-service'
import {
  getAiLessonPlanConfig,
  listAdminLessonPlans,
} from '@/lib/services/lesson-plan-service'
import {
  addProblemSetItemAction,
  generateLessonPlanAction,
  removeProblemSetItemAction,
  saveLessonPlanMarkdownAction,
  setProblemSetStatus,
  updateProblemSetDetailsAction,
  updateProblemSetItemsAction,
} from '../actions'

type AdminProblemSetDetailPageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export default async function AdminProblemSetDetailPage({ params }: AdminProblemSetDetailPageProps) {
  const { id } = await params
  const [set, candidates, lessonPlans] = await Promise.all([
    getAdminProblemSetDetail(id),
    listAdminProblemSetLevelCandidates(),
    listAdminLessonPlans(id),
  ])

  if (!set) notFound()

  const latestPlan = lessonPlans[0] ?? null
  const aiConfig = getAiLessonPlanConfig()
  const canGenerateLessonPlan = set.type === 'lesson' && set.itemCount >= 5 && set.itemCount <= 10 && aiConfig.configured

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Problem Set Detail</span>
          <h1>{set.title}</h1>
        </div>
        <em className={`admin-status admin-status-${set.status}`}>{set.status}</em>
      </header>

      <section className="admin-detail-grid">
        <article className="admin-panel">
          <h2>Metadata</h2>
          <form action={updateProblemSetDetailsAction} className="admin-form-grid admin-form-grid-lesson-detail">
            <input name="problemSetId" type="hidden" value={set.id} />
            <label>
              <span>Title</span>
              <input name="title" defaultValue={set.title} required />
            </label>
            <label>
              <span>Type</span>
              <select name="type" defaultValue={set.type}>
                <option value="chapter">chapter</option>
                <option value="practice">practice</option>
                <option value="review">review</option>
                <option value="challenge">challenge</option>
                <option value="import-review">import-review</option>
                <option value="lesson">lesson</option>
              </select>
            </label>
            <label>
              <span>Visibility</span>
              <select name="visibility" defaultValue={set.visibility}>
                <option value="admin">admin</option>
                <option value="student">student</option>
              </select>
            </label>
            <label>
              <span>SPCG Level</span>
              <input name="spcgLevel" min={1} max={10} type="number" defaultValue={set.spcgLevel ?? ''} />
            </label>
            <label>
              <span>Stage</span>
              <input name="stageNo" min={1} type="number" defaultValue={set.stageNo ?? ''} />
            </label>
            <label>
              <span>Track</span>
              <select name="track" defaultValue={set.track ?? ''}>
                <option value="">-</option>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </label>
            <label className="admin-form-span-2">
              <span>Lesson Focus</span>
              <input name="lessonFocus" defaultValue={set.lessonFocus ?? ''} />
            </label>
            <label className="admin-form-span-2">
              <span>Description</span>
              <textarea name="description" defaultValue={set.description ?? ''} rows={3} />
            </label>
            <button className="admin-button" type="submit">
              Save Metadata
            </button>
          </form>
        </article>

        <article className="admin-panel">
          <h2>Operations</h2>
          <dl className="admin-dl">
            <dt>ID</dt>
            <dd>{set.id}</dd>
            <dt>Course</dt>
            <dd>{courseLabel(set)}</dd>
            <dt>Items</dt>
            <dd>{set.itemCount}</dd>
            <dt>AI</dt>
            <dd>{aiConfig.configured ? `Configured · ${aiConfig.model}` : 'Not configured'}</dd>
          </dl>
          <div className="admin-action-stack">
            <StatusButton problemSetId={set.id} status="published" label="Publish" disabled={set.status === 'published'} />
            <StatusButton problemSetId={set.id} status="review" label="Move to review" disabled={set.status === 'review'} />
            <StatusButton problemSetId={set.id} status="archived" label="Archive" disabled={set.status === 'archived'} />
            {set.type === 'lesson' ? (
              <form action={generateLessonPlanAction}>
                <input name="problemSetId" type="hidden" value={set.id} />
                <button className="admin-button" type="submit" disabled={!canGenerateLessonPlan}>
                  Generate AI Lesson Plan
                </button>
              </form>
            ) : null}
          </div>
          {set.type === 'lesson' && !canGenerateLessonPlan ? (
            <p className="admin-help-text">
              生成教案需要 5-10 道题，并配置 LESSON_PLAN_AI_BASE_URL / KEY / MODEL。
            </p>
          ) : null}
        </article>
      </section>

      <section className="admin-detail-grid">
        <article className="admin-panel">
          <h2>Add Level</h2>
          <form action={addProblemSetItemAction} className="admin-form-grid admin-form-grid-add-item">
            <input name="problemSetId" type="hidden" value={set.id} />
            <label className="admin-form-span-2">
              <span>Level</span>
              <select name="levelId" required defaultValue="">
                <option value="" disabled>
                  Select a level
                </option>
                {candidates.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.chapterId} / #{level.order} / {level.title} / {level.knowledgePoint}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Position</span>
              <input name="position" type="number" min={1} defaultValue={set.itemCount + 1} required />
            </label>
            <label>
              <span>Label</span>
              <input name="label" placeholder="基础语法 / 例题 / 挑战" />
            </label>
            <label>
              <span>Display Mode</span>
              <select name="displayMode" defaultValue="primary" required>
                <option value="primary">primary</option>
                <option value="backup">backup</option>
                <option value="exam-only">exam-only</option>
              </select>
            </label>
            <label className="admin-checkbox">
              <input name="required" type="checkbox" defaultChecked />
              <span>Required</span>
            </label>
            <button className="admin-button" type="submit">
              Add Level
            </button>
          </form>
        </article>

        <article className="admin-panel">
          <h2>Remove Level</h2>
          <form action={removeProblemSetItemAction} className="admin-form-grid admin-form-grid-add-item">
            <input name="problemSetId" type="hidden" value={set.id} />
            <label className="admin-form-span-2">
              <span>Level</span>
              <select name="levelId" required defaultValue="">
                <option value="" disabled>
                  Select an item
                </option>
                {set.items.map((item) => (
                  <option key={item.levelId} value={item.levelId}>
                    #{item.position} / {item.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="admin-danger-button admin-button" type="submit" disabled={set.items.length === 0}>
              Remove
            </button>
          </form>
        </article>
      </section>

      <form action={updateProblemSetItemsAction} className="admin-table">
        <input name="problemSetId" type="hidden" value={set.id} />
        <div className="admin-table-head admin-set-item-edit-grid">
          <span>Position</span>
          <span>Level</span>
          <span>Label</span>
          <span>Mode / Required</span>
        </div>
        {set.items.map((item) => (
          <article className="admin-table-row admin-set-item-edit-grid" key={item.levelId}>
            <span>
              <input name="levelId" type="hidden" value={item.levelId} />
              <input className="admin-inline-input" name={`position:${item.levelId}`} type="number" min={1} defaultValue={item.position} />
            </span>
            <span>
              <Link className="admin-title-link" href={`/admin/levels/${item.levelId}`}>
                {item.title}
              </Link>
              <small>
                {item.levelId} / {item.chapterId} / {item.knowledgePoint}
              </small>
            </span>
            <span>
              <input className="admin-inline-input" name={`label:${item.levelId}`} defaultValue={item.label ?? ''} />
            </span>
            <div className="admin-inline-field">
              <select className="admin-inline-input" name={`displayMode:${item.levelId}`} defaultValue={item.displayMode}>
                <option value="primary">primary</option>
                <option value="backup">backup</option>
                <option value="exam-only">exam-only</option>
              </select>
              <label className="admin-checkbox">
                <input name={`required:${item.levelId}`} type="checkbox" defaultChecked={item.required} />
                <span>required</span>
              </label>
            </div>
          </article>
        ))}
        {set.items.length === 0 ? <p className="admin-empty">No levels in this set yet.</p> : null}
        <div className="admin-table-actions">
          <button className="admin-button" type="submit" disabled={set.items.length === 0}>
            Save Item Order
          </button>
        </div>
      </form>

      {set.type === 'lesson' ? (
        <section className="admin-detail-grid admin-detail-grid-wide">
          <article className="admin-panel">
            <h2>Latest Lesson Plan</h2>
            {latestPlan ? (
              <>
                <p className="admin-help-text">
                  Version {latestPlan.version} · {latestPlan.source} · {new Date(latestPlan.createdAt).toLocaleString()}
                </p>
                <div className="admin-lesson-plan-preview">
                  <StatementMarkdown markdown={latestPlan.markdown} assets={[]} hideImages />
                </div>
              </>
            ) : (
              <p className="admin-empty">No lesson plan generated yet.</p>
            )}
          </article>

          <article className="admin-panel">
            <h2>Edit Markdown Snapshot</h2>
            <form action={saveLessonPlanMarkdownAction} className="admin-form-grid">
              <input name="problemSetId" type="hidden" value={set.id} />
              <label className="admin-form-full">
                <span>Markdown</span>
                <textarea
                  className="admin-lesson-plan-textarea"
                  name="markdown"
                  defaultValue={latestPlan?.markdown ?? ''}
                  rows={22}
                  placeholder="# SPCG 1级 第1关 A线 教案"
                  required
                />
              </label>
              <button className="admin-button" type="submit">
                Save as New Version
              </button>
            </form>
          </article>

          <article className="admin-panel admin-form-full">
            <h2>Lesson Plan Versions</h2>
            <section className="admin-version-list">
              {lessonPlans.map((plan) => (
                <details className="admin-version-card" key={plan.id}>
                  <summary>
                    <span>v{plan.version}</span>
                    <span>{plan.source}</span>
                    <span>{plan.model ?? '-'}</span>
                    <span>{new Date(plan.createdAt).toLocaleString()}</span>
                  </summary>
                  <div className="admin-lesson-plan-preview">
                    <StatementMarkdown markdown={plan.markdown} assets={[]} hideImages />
                  </div>
                </details>
              ))}
              {lessonPlans.length === 0 ? <p className="admin-empty">No versions yet.</p> : null}
            </section>
          </article>
        </section>
      ) : null}
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
      <button className="admin-button" type="submit" disabled={disabled}>
        {label}
      </button>
    </form>
  )
}

function courseLabel(set: {
  type: string
  spcgLevel: number | null
  stageNo: number | null
  track: string | null
  lessonFocus: string | null
}) {
  if (set.type !== 'lesson') return '-'
  return `SPCG ${set.spcgLevel}级 · 第${set.stageNo}关 · ${set.track}线 · ${set.lessonFocus}`
}
