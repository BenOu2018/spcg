import Link from 'next/link'
import { requireTeacherSession } from '@/lib/teacher-auth'
import { getTeacherStudents } from '@/lib/services/teacher-service'
import { addTeacherStudentAction, createTeacherStudentAction, removeTeacherStudentAction } from '../actions'

export default async function TeacherStudentsPage() {
  const session = await requireTeacherSession('/teacher/students')
  const students = await getTeacherStudents(session.user.id)

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Students</span>
          <h1>我的学生</h1>
        </div>
        <span className="admin-count">{students.length} total</span>
      </header>

      <section className="admin-panel">
        <h2>Create Student</h2>
        <form action={createTeacherStudentAction} className="admin-form-grid admin-form-grid-users">
          <label>
            <span>Display name</span>
            <input name="displayName" required placeholder="Toby" />
          </label>
          <label>
            <span>Email</span>
            <input name="email" type="email" required placeholder="student@example.com" />
          </label>
          <label>
            <span>Password</span>
            <input name="password" type="password" required minLength={8} placeholder="At least 8 chars" />
          </label>
          <label>
            <span>Parent email</span>
            <input name="parentEmail" type="email" placeholder="parent@example.com" />
          </label>
          <label>
            <span>Age</span>
            <input name="age" type="number" min={0} max={120} placeholder="10" />
          </label>
          <button className="admin-button" type="submit">
            Create and add
          </button>
        </form>
      </section>

      <section className="admin-panel">
        <h2>Add Existing Student</h2>
        <form action={addTeacherStudentAction} className="admin-form-grid">
          <label>
            <span>Student email or id</span>
            <input name="studentIdentifier" required placeholder="student@example.com" />
          </label>
          <button className="admin-button" type="submit">
            Add student
          </button>
        </form>
      </section>

      <section className="admin-table">
        <div className="admin-table-head teacher-student-grid">
          <span>Student</span>
          <span>Status</span>
          <span>Progress</span>
          <span>Linked</span>
          <span>Actions</span>
        </div>
        {students.map((student) => (
          <article className="admin-table-row teacher-student-grid" key={student.id}>
            <div>
              <Link className="admin-title-link" href={`/teacher/students/${student.id}`}>
                {student.displayName ?? student.email ?? student.id}
              </Link>
              <small>{student.email ?? student.id}</small>
            </div>
            <em className={`admin-status admin-status-${student.accountStatus}`}>{student.accountStatus}</em>
            <span>
              {student.passedCount} passed
              <small>{student.submissionCount} submissions</small>
            </span>
            <span>{new Date(student.linkedAt).toLocaleDateString()}</span>
            <form action={removeTeacherStudentAction}>
              <input name="studentUserId" type="hidden" value={student.id} />
              <button className="admin-small-button" type="submit">
                Remove
              </button>
            </form>
          </article>
        ))}
        {students.length === 0 ? <p className="admin-empty">No students linked yet.</p> : null}
      </section>
    </section>
  )
}
