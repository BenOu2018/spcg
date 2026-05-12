import Link from 'next/link'
import { listAdminProblemSets, type ProblemSetStatus } from '@/lib/services/problem-set-service'
import {
  AdminDrawer,
  AdminEmpty,
  AdminFilterBar,
  AdminPageHeader,
  AdminStatCard,
  AdminTabs,
} from '../components/AdminChrome'
import { createLessonProblemSetAction, setProblemSetStatus } from './actions'

type AdminProblemSetsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

type ProblemSetSummary = Awaited<ReturnType<typeof listAdminProblemSets>>[number]

const PAGE_SIZE = 20

export default async function AdminProblemSetsPage({ searchParams }: AdminProblemSetsPageProps) {
  const resolvedSearchParams = await searchParams
  const sets = await listAdminProblemSets()
  const q = readStringParam(resolvedSearchParams?.q)?.trim() ?? ''
  const type = readStringParam(resolvedSearchParams?.type) ?? ''
  const status = readStringParam(resolvedSearchParams?.status) ?? ''
  const page = Math.max(1, readOptionalNumberParam(resolvedSearchParams?.page) ?? 1)
  const drawer = readStringParam(resolvedSearchParams?.drawer)
  const filteredSets = sets.filter((set) => matchesProblemSet(set, { q, type, status }))
  const pageCount = Math.max(1, Math.ceil(filteredSets.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageSets = filteredSets.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <section className="admin-stack">
      <AdminPageHeader
        actions={
          <Link className="admin-button" href={buildHref('/admin/problem-sets', resolvedSearchParams, { drawer: 'create' })}>
            New lesson set
          </Link>
        }
        description="课程题单、考试题单和教案生成入口。复杂编辑进入详情或右侧抽屉。"
        eyebrow="Curation"
        meta={<span className="admin-count">{filteredSets.length} shown</span>}
        title="Problem Sets"
      />

      <section className="admin-metrics admin-metrics-wide">
        <AdminStatCard detail="all sets" label="Total" value={sets.length} />
        <AdminStatCard detail="lesson type" label="Lessons" value={sets.filter((set) => set.type === 'lesson').length} />
        <AdminStatCard detail="published" label="Published" tone="good" value={sets.filter((set) => set.status === 'published').length} />
        <AdminStatCard detail="draft/review" label="In progress" value={sets.filter((set) => set.status === 'draft' || set.status === 'review').length} />
      </section>

      <AdminTabs
        items={[
          { href: '/admin/problem-sets', label: 'All', active: !type, count: sets.length },
          {
            href: buildHref('/admin/problem-sets', resolvedSearchParams, { type: 'lesson', page: null, drawer: null }),
            label: 'Lesson',
            active: type === 'lesson',
            count: sets.filter((set) => set.type === 'lesson').length,
          },
          {
            href: buildHref('/admin/problem-sets', resolvedSearchParams, { type: 'assessment', page: null, drawer: null }),
            label: 'Assessment',
            active: type === 'assessment',
            count: sets.filter((set) => set.type === 'assessment').length,
          },
          {
            href: buildHref('/admin/problem-sets', resolvedSearchParams, { type: 'import-review', page: null, drawer: null }),
            label: 'Import Review',
            active: type === 'import-review',
            count: sets.filter((set) => set.type === 'import-review').length,
          },
        ]}
      />

      <form action="/admin/problem-sets" className="admin-panel" method="get">
        <AdminFilterBar>
          <label>
            <span>Search</span>
            <input name="q" placeholder="set id, title, lesson focus" defaultValue={q} />
          </label>
          <label>
            <span>Type</span>
            <select name="type" defaultValue={type}>
              <option value="">All types</option>
              <option value="lesson">lesson</option>
              <option value="assessment">assessment</option>
              <option value="chapter">chapter</option>
              <option value="practice">practice</option>
              <option value="review">review</option>
              <option value="challenge">challenge</option>
              <option value="import-review">import-review</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select name="status" defaultValue={status}>
              <option value="">All status</option>
              <option value="draft">draft</option>
              <option value="review">review</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <button className="admin-button" type="submit">
            Filter
          </button>
        </AdminFilterBar>
      </form>

      <section className="admin-table">
        <div className="admin-table-head admin-set-grid">
          <span>Set</span>
          <span>Course</span>
          <span>Items</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {pageSets.map((set) => (
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
              <Link className="admin-small-button" href={`/admin/problem-sets/${set.id}`}>
                Detail
              </Link>
              <StatusButton problemSetId={set.id} status="published" label="Publish" disabled={set.status === 'published'} />
              <StatusButton problemSetId={set.id} status="archived" label="Archive" disabled={set.status === 'archived'} />
            </div>
          </article>
        ))}
        {pageSets.length === 0 ? <AdminEmpty>No problem sets match the current filters.</AdminEmpty> : null}
      </section>

      <Pagination
        basePath="/admin/problem-sets"
        page={safePage}
        pageCount={pageCount}
        searchParams={resolvedSearchParams}
        total={filteredSets.length}
      />

      {drawer === 'create' ? (
        <AdminDrawer closeHref={buildHref('/admin/problem-sets', resolvedSearchParams, { drawer: null })} title="New lesson problem set" width="xl">
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
              <input name="description" placeholder="v0.2 默认每关 5 题，前 3 题主线必做" />
            </label>
            <button className="admin-button" type="submit">
              Create lesson set
            </button>
          </form>
        </AdminDrawer>
      ) : null}
    </section>
  )
}

function Pagination({
  basePath,
  page,
  pageCount,
  searchParams,
  total,
}: {
  basePath: string
  page: number
  pageCount: number
  searchParams?: Record<string, string | string[] | undefined>
  total: number
}) {
  return (
    <div className="admin-pagination">
      <span>
        Page {page} / {pageCount} · {total} records
      </span>
      <div>
        <Link className="admin-small-button" href={buildHref(basePath, searchParams, { page: String(Math.max(1, page - 1)), drawer: null })}>
          Prev
        </Link>
        <Link
          className="admin-small-button"
          href={buildHref(basePath, searchParams, { page: String(Math.min(pageCount, page + 1)), drawer: null })}
        >
          Next
        </Link>
      </div>
    </div>
  )
}

function StatusButton({
  problemSetId,
  status,
  label,
  disabled,
}: {
  problemSetId: string
  status: ProblemSetStatus
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

function matchesProblemSet(set: ProblemSetSummary, filters: { q: string; type: string; status: string }) {
  if (filters.type && set.type !== filters.type) return false
  if (filters.status && set.status !== filters.status) return false
  if (!filters.q) return true

  const haystack = [set.id, set.title, set.description, set.lessonFocus, set.type, set.status]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(filters.q.toLowerCase())
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function readOptionalNumberParam(value: string | string[] | undefined): number | null {
  const raw = readStringParam(value)
  if (!raw) return null
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : null
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
