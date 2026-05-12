import { getAdminSubmissionHistory } from '@/lib/services/submission-service'
import { AdminFilterBar, AdminPageHeader, AdminStatCard } from '../components/AdminChrome'
import { AdminSubmissionTable } from '../components/AdminSubmissionTable'

export const dynamic = 'force-dynamic'

type AdminSubmissionsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

const PAGE_SIZE = 50

export default async function AdminSubmissionsPage({ searchParams }: AdminSubmissionsPageProps) {
  const resolvedSearchParams = await searchParams
  const userId = readStringParam(resolvedSearchParams?.userId)?.trim() ?? ''
  const levelId = readStringParam(resolvedSearchParams?.levelId)?.trim() ?? ''
  const result = readStringParam(resolvedSearchParams?.result)?.trim() ?? ''
  const selectedSubmissionId = readStringParam(resolvedSearchParams?.submissionId) ?? null
  const submissions = await getAdminSubmissionHistory({
    userId: userId || undefined,
    levelId: levelId || undefined,
    limit: 200,
  })
  const filteredSubmissions = submissions.filter((submission) => {
    if (result && submission.verdict?.result !== result) return false
    return true
  })
  const pageSubmissions = filteredSubmissions.slice(0, PAGE_SIZE)

  return (
    <section className="admin-stack">
      <AdminPageHeader
        description="管理员提交检索中心。列表只展示基础信息，源码、判题明细和 AI 分析在右侧 Drawer 查看。"
        eyebrow="Judge"
        meta={<span className="admin-count">{filteredSubmissions.length} shown</span>}
        title="Submissions"
      />

      <section className="admin-metrics admin-metrics-wide">
        <AdminStatCard detail="loaded latest 200" label="Loaded" value={submissions.length} />
        <AdminStatCard detail="accepted" label="AC" tone="good" value={submissions.filter((item) => item.verdict?.result === 'AC').length} />
        <AdminStatCard detail="wrong answer" label="WA" tone="danger" value={submissions.filter((item) => item.verdict?.result === 'WA').length} />
        <AdminStatCard detail="pending/judging" label="Running" value={submissions.filter((item) => item.status === 'pending' || item.status === 'judging').length} />
      </section>

      <form action="/admin/submissions" className="admin-panel" method="get">
        <AdminFilterBar>
          <label>
            <span>User ID</span>
            <input name="userId" placeholder="student user id" defaultValue={userId} />
          </label>
          <label>
            <span>Level ID</span>
            <input name="levelId" placeholder="ch01-01-01" defaultValue={levelId} />
          </label>
          <label>
            <span>Result</span>
            <select name="result" defaultValue={result}>
              <option value="">All results</option>
              <option value="AC">AC</option>
              <option value="WA">WA</option>
              <option value="CE">CE</option>
              <option value="RE">RE</option>
              <option value="TLE">TLE</option>
              <option value="MLE">MLE</option>
              <option value="PE">PE</option>
              <option value="Judge Error">Judge Error</option>
            </select>
          </label>
          <button className="admin-button" type="submit">
            Filter
          </button>
        </AdminFilterBar>
      </form>

      <AdminSubmissionTable
        emptyText="No submissions match the current filters."
        selectedSubmissionId={selectedSubmissionId}
        submissions={pageSubmissions}
      />
    </section>
  )
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}
