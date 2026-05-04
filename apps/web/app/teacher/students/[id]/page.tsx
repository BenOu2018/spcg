import { notFound } from 'next/navigation'
import { requireTeacherSession } from '@/lib/teacher-auth'
import {
  getTeacherStudentProgress,
  getTeacherStudents,
  getTeacherStudentSubmissions,
} from '@/lib/services/teacher-service'
import { removeTeacherStudentAction } from '../../actions'

type TeacherStudentDetailPageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export default async function TeacherStudentDetailPage({ params }: TeacherStudentDetailPageProps) {
  const { id } = await params
  const session = await requireTeacherSession(`/teacher/students/${id}`)
  const [students, progress, submissions] = await Promise.all([
    getTeacherStudents(session.user.id),
    getTeacherStudentProgress({ teacherUserId: session.user.id, studentUserId: id }),
    getTeacherStudentSubmissions({ teacherUserId: session.user.id, studentUserId: id, limit: 50 }),
  ])
  const student = students.find((item) => item.id === id)
  if (!student) notFound()

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Student Detail</span>
          <h1>{student.displayName ?? student.email ?? student.id}</h1>
        </div>
        <form action={removeTeacherStudentAction}>
          <input name="studentUserId" type="hidden" value={student.id} />
          <button className="admin-button" type="submit">
            Remove student
          </button>
        </form>
      </header>

      <section className="admin-grid-3">
        <AdminFact label="Passed Levels" value={student.passedCount} />
        <AdminFact label="Submissions" value={student.submissionCount} />
        <AdminFact label="Progress Rows" value={progress.length} />
      </section>

      <section className="admin-table">
        <div className="admin-table-head admin-user-progress-grid">
          <span>Level</span>
          <span>Status</span>
          <span>Attempts</span>
          <span>Best Runtime</span>
          <span>Last Submitted</span>
        </div>
        {progress.map((item) => (
          <article className="admin-table-row admin-user-progress-grid" key={item.levelId}>
            <span>
              {item.levelTitle}
              <small>
                {item.levelId} / Lv.{item.spcgLevel || '-'}
              </small>
            </span>
            <span>{item.passed ? 'passed' : 'not passed'}</span>
            <span>{item.attemptCount}</span>
            <span>{item.bestRuntimeMs === null ? '-' : `${item.bestRuntimeMs}ms`}</span>
            <span>{item.lastSubmittedAt ? new Date(item.lastSubmittedAt).toLocaleString() : '-'}</span>
          </article>
        ))}
        {progress.length === 0 ? <p className="admin-empty">No progress records yet.</p> : null}
      </section>

      <section className="admin-table">
        <div className="admin-table-head teacher-submission-grid">
          <span>Submission</span>
          <span>Level</span>
          <span>Status</span>
          <span>Result</span>
          <span>Created</span>
        </div>
        {submissions.map((submission) => (
          <article className="admin-table-row teacher-submission-grid" key={submission.id}>
            <span>
              {submission.id.slice(0, 8)}
              <small>{submission.language}</small>
            </span>
            <span>
              {submission.levelTitle}
              <small>{submission.levelId}</small>
            </span>
            <span>{submission.status}</span>
            <span>{submission.result ?? '-'}</span>
            <span>{new Date(submission.createdAt).toLocaleString()}</span>
          </article>
        ))}
        {submissions.length === 0 ? <p className="admin-empty">No submissions yet.</p> : null}
      </section>
    </section>
  )
}

function AdminFact({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="admin-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
