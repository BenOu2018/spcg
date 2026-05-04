import Link from 'next/link'
import { requireTeacherSession } from '@/lib/teacher-auth'
import { getTeacherDashboard } from '@/lib/services/teacher-service'

export default async function TeacherPage() {
  const session = await requireTeacherSession('/teacher')
  const dashboard = await getTeacherDashboard(session.user.id)

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Teacher</span>
          <h1>老师工作台</h1>
        </div>
        <Link className="admin-secondary-link" href="/teacher/students">
          Manage students
        </Link>
      </header>

      <section className="admin-metrics">
        <AdminMetric label="Students" value={dashboard.students.length} />
        <AdminMetric label="Passed Levels" value={dashboard.totalPassed} />
        <AdminMetric label="Submissions" value={dashboard.totalSubmissions} />
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Recent Students</h2>
          <Link href="/teacher/students">View all</Link>
        </div>
        <div className="admin-list">
          {dashboard.students.slice(0, 8).map((student) => (
            <Link className="admin-list-row" href={`/teacher/students/${student.id}`} key={student.id}>
              <span>{student.displayName ?? student.email ?? student.id}</span>
              <small>
                {student.passedCount} passed / {student.submissionCount} submissions
              </small>
            </Link>
          ))}
          {dashboard.students.length === 0 ? <p className="admin-empty">No students linked yet.</p> : null}
        </div>
      </section>
    </section>
  )
}

function AdminMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="admin-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
