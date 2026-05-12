import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  LESSON_ROLE_SUMMARIES,
  V02_LESSON_ITEM_COUNT,
  V02_REQUIRED_ITEM_COUNT,
  isAdvancedLessonProblemRole,
  isRequiredLessonProblemRole,
  type ProblemSetItemDisplayMode,
} from '@spcg/shared/curriculum'
import { StatementMarkdown } from '@/components/StatementMarkdown'
import { getAdminProblemSetDetail, listAdminProblemSetLevelCandidates } from '@/lib/services/problem-set-service'
import { getAiLessonPlanConfig, listAdminLessonPlans } from '@/lib/services/lesson-plan-service'
import { AdminDrawer, AdminPageHeader, AdminTabs } from '../../components/AdminChrome'
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
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

const VALID_TABS = new Set(['overview', 'items', 'lesson-plans', 'settings'])

export default async function AdminProblemSetDetailPage({ params, searchParams }: AdminProblemSetDetailPageProps) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const tab = normalizeTab(readStringParam(resolvedSearchParams?.tab))
  const drawer = readStringParam(resolvedSearchParams?.drawer)
  const [set, candidates, lessonPlans] = await Promise.all([
    getAdminProblemSetDetail(id),
    listAdminProblemSetLevelCandidates(),
    listAdminLessonPlans(id),
  ])

  if (!set) notFound()

  const latestPlan = lessonPlans[0] ?? null
  const aiConfig = getAiLessonPlanConfig()
  const lessonCompleteness = getLessonCompleteness(set.items)
  const canGenerateLessonPlan = set.type === 'lesson' && lessonCompleteness.ready && aiConfig.configured

  return (
    <section className="admin-stack">
      <AdminPageHeader
        actions={
          <>
            <Link className="admin-secondary-link" href="/admin/problem-sets">
              Back
            </Link>
            <Link className="admin-button" href={buildHref(`/admin/problem-sets/${set.id}`, resolvedSearchParams, { drawer: 'edit' })}>
              Edit metadata
            </Link>
          </>
        }
        description={`${courseLabel(set)} · ${set.itemCount} items`}
        eyebrow="Problem Set Detail"
        meta={<em className={`admin-status admin-status-${set.status}`}>{set.status}</em>}
        title={set.title}
      />

      <AdminTabs
        items={[
          { href: buildHref(`/admin/problem-sets/${set.id}`, resolvedSearchParams, { tab: 'overview', drawer: null }), label: 'Overview', active: tab === 'overview' },
          {
            href: buildHref(`/admin/problem-sets/${set.id}`, resolvedSearchParams, { tab: 'items', drawer: null }),
            label: 'Items',
            active: tab === 'items',
            count: set.itemCount,
          },
          {
            href: buildHref(`/admin/problem-sets/${set.id}`, resolvedSearchParams, { tab: 'lesson-plans', drawer: null }),
            label: 'Lesson Plans',
            active: tab === 'lesson-plans',
            count: lessonPlans.length,
          },
          { href: buildHref(`/admin/problem-sets/${set.id}`, resolvedSearchParams, { tab: 'settings', drawer: null }), label: 'Settings', active: tab === 'settings' },
        ]}
      />

      {tab === 'overview' ? (
        <section className="admin-detail-grid">
          <article className="admin-panel">
            <div className="admin-panel-head">
              <h2>Metadata</h2>
              <Link className="admin-small-button" href={buildHref(`/admin/problem-sets/${set.id}`, resolvedSearchParams, { drawer: 'edit' })}>
                Edit
              </Link>
            </div>
            <dl className="admin-dl">
              <dt>ID</dt>
              <dd>{set.id}</dd>
              <dt>Type</dt>
              <dd>{set.type}</dd>
              <dt>Visibility</dt>
              <dd>{set.visibility}</dd>
              <dt>Course</dt>
              <dd>{courseLabel(set)}</dd>
              <dt>Description</dt>
              <dd>{set.description ?? '-'}</dd>
            </dl>
          </article>

          <article className="admin-panel">
            <h2>v0.2 Completeness</h2>
            <dl className="admin-dl">
              <dt>Total</dt>
              <dd>
                {lessonCompleteness.total}/{V02_LESSON_ITEM_COUNT}
              </dd>
              <dt>Mainline</dt>
              <dd>
                {lessonCompleteness.required}/{V02_REQUIRED_ITEM_COUNT}
              </dd>
              <dt>Advanced</dt>
              <dd>{lessonCompleteness.advanced}/2</dd>
              <dt>Ready</dt>
              <dd>{lessonCompleteness.ready ? '完整：可发布/生成教案' : lessonCompleteness.message}</dd>
              <dt>AI</dt>
              <dd>{aiConfig.configured ? `Configured · ${aiConfig.model}` : 'Not configured'}</dd>
            </dl>
          </article>
        </section>
      ) : null}

      {tab === 'items' ? (
        <>
          <div className="admin-page-actions">
            <Link className="admin-button" href={buildHref(`/admin/problem-sets/${set.id}`, resolvedSearchParams, { drawer: 'add-item' })}>
              Add level
            </Link>
            <Link className="admin-secondary-link" href={buildHref(`/admin/problem-sets/${set.id}`, resolvedSearchParams, { drawer: 'remove-item' })}>
              Remove level
            </Link>
          </div>
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
                    <DisplayModeOptions />
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
        </>
      ) : null}

      {tab === 'lesson-plans' ? (
        <section className="admin-detail-grid admin-detail-grid-wide">
          <article className="admin-panel">
            <div className="admin-panel-head">
              <h2>Latest Lesson Plan</h2>
              <div className="admin-row-actions">
                {set.type === 'lesson' ? (
                  <form action={generateLessonPlanAction}>
                    <input name="problemSetId" type="hidden" value={set.id} />
                    <button className="admin-small-button" type="submit" disabled={!canGenerateLessonPlan}>
                      Generate AI
                    </button>
                  </form>
                ) : null}
                <Link className="admin-small-button" href={buildHref(`/admin/problem-sets/${set.id}`, resolvedSearchParams, { drawer: 'edit-plan' })}>
                  Edit snapshot
                </Link>
              </div>
            </div>
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
            {set.type === 'lesson' && !canGenerateLessonPlan ? (
              <p className="admin-help-text">
                v0.2 生成教案需要固定 5 道题、至少前 3 道主线必做，并配置 LESSON_PLAN_AI_BASE_URL / KEY / MODEL。
              </p>
            ) : null}
          </article>

          <article className="admin-panel">
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

      {tab === 'settings' ? (
        <section className="admin-detail-grid">
          <article className="admin-panel">
            <h2>Status Operations</h2>
            <div className="admin-action-stack">
              <StatusButton problemSetId={set.id} status="published" label="Publish" disabled={set.status === 'published'} />
              <StatusButton problemSetId={set.id} status="review" label="Move to review" disabled={set.status === 'review'} />
              <StatusButton problemSetId={set.id} status="archived" label="Archive" disabled={set.status === 'archived'} />
            </div>
          </article>
        </section>
      ) : null}

      {drawer === 'edit' ? (
        <AdminDrawer closeHref={buildHref(`/admin/problem-sets/${set.id}`, resolvedSearchParams, { drawer: null })} title="Edit problem set" width="lg">
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
        </AdminDrawer>
      ) : null}

      {drawer === 'add-item' ? (
        <AdminDrawer closeHref={buildHref(`/admin/problem-sets/${set.id}`, resolvedSearchParams, { drawer: null })} title="Add level" width="lg">
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
              <select name="displayMode" defaultValue={defaultDisplayModeForPosition(set.itemCount + 1)} required>
                <DisplayModeOptions />
              </select>
            </label>
            <label className="admin-checkbox">
              <input name="required" type="checkbox" defaultChecked={set.itemCount < V02_REQUIRED_ITEM_COUNT} />
              <span>Required</span>
            </label>
            <button className="admin-button" type="submit">
              Add Level
            </button>
          </form>
        </AdminDrawer>
      ) : null}

      {drawer === 'remove-item' ? (
        <AdminDrawer closeHref={buildHref(`/admin/problem-sets/${set.id}`, resolvedSearchParams, { drawer: null })} title="Remove level" width="md">
          <form action={removeProblemSetItemAction} className="admin-form-grid">
            <input name="problemSetId" type="hidden" value={set.id} />
            <label className="admin-form-wide">
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
        </AdminDrawer>
      ) : null}

      {drawer === 'edit-plan' ? (
        <AdminDrawer closeHref={buildHref(`/admin/problem-sets/${set.id}`, resolvedSearchParams, { drawer: null })} title="Edit lesson plan markdown" width="xl">
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
        </AdminDrawer>
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

function defaultDisplayModeForPosition(position: number): ProblemSetItemDisplayMode {
  if (position <= 1) return 'template'
  if (position === 2) return 'basic'
  if (position === 3) return 'variant'
  if (position === 4) return 'advanced'
  return 'challenge'
}

function getLessonCompleteness(items: Array<{ required: boolean; displayMode: ProblemSetItemDisplayMode }>) {
  const total = items.length
  const required = items.filter((item) => item.required || isRequiredLessonProblemRole(item.displayMode)).length
  const advanced = items.filter((item) => isAdvancedLessonProblemRole(item.displayMode)).length
  const ready = total === V02_LESSON_ITEM_COUNT && required >= V02_REQUIRED_ITEM_COUNT
  const message =
    total !== V02_LESSON_ITEM_COUNT
      ? `需要固定 ${V02_LESSON_ITEM_COUNT} 题`
      : required < V02_REQUIRED_ITEM_COUNT
        ? `需要 ${V02_REQUIRED_ITEM_COUNT} 道主线必做题`
        : '完整'

  return { total, required, advanced, ready, message }
}

function normalizeTab(value: string | undefined) {
  if (value && VALID_TABS.has(value)) return value
  return 'overview'
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function buildHref(
  path: string,
  searchParams: Record<string, string | string[] | undefined> | undefined,
  updates: Record<string, string | null>,
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    const raw = readStringParam(value)
    if (raw) params.set(key, raw)
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  }
  const query = params.toString()
  return query ? `${path}?${query}` : path
}
