import {
  getAdminKnowledgePointFacets,
  listAdminKnowledgePoints,
  type AdminKnowledgePointFilters,
  type KnowledgePointClassification,
} from '@/lib/admin-data'

type AdminKnowledgePointsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

const classifications: KnowledgePointClassification[] = ['编程算法', '数学']

export const dynamic = 'force-dynamic'

export default async function AdminKnowledgePointsPage({ searchParams }: AdminKnowledgePointsPageProps) {
  const resolvedSearchParams = await searchParams
  const filters = readFilters(resolvedSearchParams)
  const [points, facets] = await Promise.all([listAdminKnowledgePoints(filters), getAdminKnowledgePointFacets()])
  const programmingCount = facets.classifications.find((item) => item.value === '编程算法')?.count ?? 0
  const mathCount = facets.classifications.find((item) => item.value === '数学')?.count ?? 0

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Knowledge Registry</span>
          <h1>知识点标签库</h1>
        </div>
        <span className="admin-count">
          {points.length} shown · 编程算法 {programmingCount} · 数学 {mathCount}
        </span>
      </header>

      <form action="/admin/knowledge-points" className="admin-panel admin-form-grid admin-knowledge-filter-form" method="get">
        <label>
          <span>分类</span>
          <select name="classification" defaultValue={filters.classification ?? ''}>
            <option value="">全部</option>
            {classifications.map((classification) => (
              <option key={classification} value={classification}>
                {classification}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>领域</span>
          <select name="domain" defaultValue={filters.domain ?? ''}>
            <option value="">全部</option>
            {facets.domains.map((domain) => (
              <option key={domain.value} value={domain.value}>
                {domain.value} ({domain.count})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>学习带 / 级别</span>
          <select name="bandOrLevel" defaultValue={filters.bandOrLevel ?? ''}>
            <option value="">全部</option>
            {facets.bandsOrLevels.map((band) => (
              <option key={band.value} value={band.value}>
                {band.value} ({band.count})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>关键词</span>
          <input name="q" defaultValue={filters.q ?? ''} placeholder="tag / 中文 / English / 题型" />
        </label>
        <button className="admin-button" type="submit">
          Filter
        </button>
      </form>

      <section className="admin-table">
        <div className="admin-table-head admin-knowledge-grid">
          <span>Tag</span>
          <span>名称</span>
          <span>分类 / 领域</span>
          <span>学习带</span>
          <span>题型 / 建议</span>
          <span>来源</span>
        </div>
        {points.map((point) => (
          <article className="admin-table-row admin-knowledge-grid" key={`${point.classification}:${point.tagId}`}>
            <div>
              <strong>{point.tagId}</strong>
              <small>{point.id}</small>
            </div>
            <div>
              <strong>{point.zhName}</strong>
              <small>{point.enName}</small>
            </div>
            <span>
              <em className={`admin-status ${point.classification === '编程算法' ? 'admin-status-published' : 'admin-status-review'}`}>
                {point.classification}
              </em>
              <small>{point.domain}</small>
            </span>
            <span>
              {point.bandOrLevel}
              <small>sort {point.sortOrder}</small>
            </span>
            <span>
              {point.commonProblemTypes || '-'}
              <small>{point.recommendation}</small>
            </span>
            <span>
              {point.sourceSection || '-'}
              <small>{point.sourceFile}</small>
            </span>
          </article>
        ))}
        {points.length === 0 ? <p className="admin-empty">No knowledge points found.</p> : null}
      </section>
    </section>
  )
}

function readFilters(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): AdminKnowledgePointFilters {
  const classification = readClassification(readStringParam(searchParams?.classification))
  const domain = readStringParam(searchParams?.domain)
  const bandOrLevel = readStringParam(searchParams?.bandOrLevel)
  const q = readStringParam(searchParams?.q)

  return {
    classification,
    domain: domain || undefined,
    bandOrLevel: bandOrLevel || undefined,
    q: q || undefined,
    limit: 1000,
  }
}

function readStringParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? ''
  return value?.trim() ?? ''
}

function readClassification(value: string): KnowledgePointClassification | undefined {
  return classifications.includes(value as KnowledgePointClassification) ? (value as KnowledgePointClassification) : undefined
}
