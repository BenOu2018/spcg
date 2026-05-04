import Link from 'next/link'
import { getDifficultyCoefficient } from '@spcg/shared/difficulty'
import { listAdminLevels, listAdminLevelSetMemberships } from '@/lib/admin-data'
import { listAdminProblemSets } from '@/lib/services/problem-set-service'
import { setLevelStatus } from './actions'

type AdminLevelsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

export default async function AdminLevelsPage({ searchParams }: AdminLevelsPageProps) {
  const resolvedSearchParams = await searchParams
  const selectedSpcgLevel = readOptionalNumberParam(resolvedSearchParams?.spcgLevel)
  const selectedProblemSetId = readStringParam(resolvedSearchParams?.problemSetId)
  const selectedStatus = readStringParam(resolvedSearchParams?.status)
  const [levels, memberships, problemSets] = await Promise.all([
    listAdminLevels(),
    listAdminLevelSetMemberships(),
    listAdminProblemSets(),
  ])
  const membershipByLevel = groupMemberships(memberships)
  const levelIdsInSelectedSet = new Set(
    selectedProblemSetId ? memberships.filter((item) => item.problemSetId === selectedProblemSetId).map((item) => item.levelId) : [],
  )
  const filteredLevels = levels.filter((level) => {
    if (selectedSpcgLevel && level.difficulty.spcgLevel !== selectedSpcgLevel) return false
    if (selectedStatus && level.status !== selectedStatus) return false
    if (selectedProblemSetId && !levelIdsInSelectedSet.has(level.id)) return false
    return true
  })
  const lessonSets = problemSets.filter((set) => set.type === 'lesson')

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Content</span>
          <h1>Levels</h1>
        </div>
        <span className="admin-count">
          {filteredLevels.length} shown · {levels.length} total
        </span>
      </header>

      <form action="/admin/levels" className="admin-panel admin-form-grid admin-level-filter-form" method="get">
        <label>
          <span>SPCG Level</span>
          <select name="spcgLevel" defaultValue={selectedSpcgLevel ?? ''}>
            <option value="">All</option>
            {Array.from({ length: 10 }, (_, index) => index + 1).map((level) => (
              <option key={level} value={level}>
                SPCG {level}级
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>关卡 / 算法分类</span>
          <select name="problemSetId" defaultValue={selectedProblemSetId ?? ''}>
            <option value="">All</option>
            {lessonSets.map((set) => (
              <option key={set.id} value={set.id}>
                SPCG {set.spcgLevel}级 / 第{set.stageNo}关 / {set.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select name="status" defaultValue={selectedStatus ?? ''}>
            <option value="">All</option>
            <option value="draft">draft</option>
            <option value="review">review</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <button className="admin-button" type="submit">
          Filter
        </button>
      </form>

      <section className="admin-table">
        <div className="admin-table-head admin-level-grid">
          <span>Level</span>
          <span>Knowledge</span>
          <span>Difficulty</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {filteredLevels.map((level) => (
          <article className="admin-table-row admin-level-grid" key={level.id}>
            <div>
              <Link className="admin-title-link" href={`/admin/levels/${level.id}`}>
                {level.title}
              </Link>
              <small>
                {level.chapterId} / {level.id} / #{level.order}
              </small>
              <small>{membershipSummary(membershipByLevel.get(level.id) ?? [])}</small>
            </div>
            <span>{level.knowledgePoint}</span>
            <span>
              {level.difficulty.levelLabel} · {level.difficulty.stars}层 · 难度系数{' '}
              {getDifficultyCoefficient(level.difficulty)} · {level.difficulty.label}
            </span>
            <AdminStatus status={level.status} />
            <div className="admin-row-actions">
              <StatusButton levelId={level.id} status="published" label="Publish" disabled={level.status === 'published'} />
              <StatusButton levelId={level.id} status="archived" label="Archive" disabled={level.status === 'archived'} />
            </div>
          </article>
        ))}
        {filteredLevels.length === 0 ? <p className="admin-empty">No levels match the current filters.</p> : null}
      </section>
    </section>
  )
}

function StatusButton({
  levelId,
  status,
  label,
  disabled,
}: {
  levelId: string
  status: string
  label: string
  disabled: boolean
}) {
  return (
    <form action={setLevelStatus}>
      <input name="levelId" type="hidden" value={levelId} />
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

function readOptionalNumberParam(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isInteger(parsed) ? parsed : null
}

function readStringParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() || null
}

function groupMemberships<T extends { levelId: string }>(memberships: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const membership of memberships) {
    const items = map.get(membership.levelId) ?? []
    items.push(membership)
    map.set(membership.levelId, items)
  }
  return map
}

function membershipSummary(
  memberships: Array<{
    problemSetTitle: string
    stageNo: number | null
    track: string | null
    displayMode: string
  }>,
) {
  if (memberships.length === 0) return '未归类'
  return memberships
    .slice(0, 2)
    .map((item) => `第${item.stageNo ?? '-'}关${item.track ? ` ${item.track}线` : ''} · ${item.displayMode}`)
    .join(' / ')
}
