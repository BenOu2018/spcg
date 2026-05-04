import { getAdminSubmissionHistory } from '@/lib/services/submission-service'
import { AdminSubmissionTable } from '../components/AdminSubmissionTable'

export const dynamic = 'force-dynamic'

export default async function AdminSubmissionsPage() {
  const submissions = await getAdminSubmissionHistory({ limit: 100 })

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Judging</span>
          <h1>Submissions</h1>
        </div>
        <span className="admin-count">{submissions.length} recent</span>
      </header>

      <AdminSubmissionTable submissions={submissions} />
    </section>
  )
}
