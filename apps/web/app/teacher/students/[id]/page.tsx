import { notFound } from 'next/navigation'
import { requireTeacherSession } from '@/lib/teacher-auth'
import { getLessonStageMenu, getMapMainlineLevels } from '@/lib/level-data'
import {
  getTeacherStudentCurrentLevel,
  getTeacherStudentProgress,
  getTeacherStudents,
  getTeacherStudentSubmissions,
} from '@/lib/services/teacher-service'
import { removeTeacherStudentAction, setTeacherStudentCurrentLevelAction } from '../../actions'

type TeacherStudentDetailPageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export default async function TeacherStudentDetailPage({ params }: TeacherStudentDetailPageProps) {
  const { id } = await params
  const session = await requireTeacherSession(`/teacher/students/${id}`)
  const [students, progress, submissions, mainlineLevels, currentStudyLevel] = await Promise.all([
    getTeacherStudents(session.user.id),
    getTeacherStudentProgress({ teacherUserId: session.user.id, studentUserId: id }),
    getTeacherStudentSubmissions({ teacherUserId: session.user.id, studentUserId: id, limit: 50 }),
    getMapMainlineLevels(),
    getTeacherStudentCurrentLevel({ teacherUserId: session.user.id, studentUserId: id }),
  ])
  const stageMenus = (await Promise.all(mainlineLevels.map((level) => getLessonStageMenu(level.id)))).filter(
    (menu): menu is NonNullable<typeof menu> => Boolean(menu),
  )
  const student = students.find((item) => item.id === id)
  if (!student) notFound()
  const progressByLevelId = new Map(progress.map((item) => [item.levelId, item]))
  const stageRows = stageMenus.map((menu) => buildStageRow(menu, progressByLevelId))
  const pendingRepair = progress.filter((item) => !item.passed && item.attemptCount > 0).length
  const repairedSuccess = progress.filter((item) => item.passed && item.attemptCount > 1).length
  const recentErrorTypes = summarizeRecentErrors(submissions)

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
        <AdminFact label="待修错题" value={pendingRepair} />
        <AdminFact label="修错成功" value={repairedSuccess} />
        <AdminFact label="最近错误" value={recentErrorTypes || '-'} />
      </section>

      <section className="admin-panel">
        <h2>当前关卡</h2>
        <p className="admin-help">
          当前：{currentStudyLevel ? `SPCG ${currentStudyLevel.spcgLevel}级 第${currentStudyLevel.stageNo ?? '-'}关 · ${currentStudyLevel.title}` : '暂未计算'}
          {currentStudyLevel?.source === 'teacher_set' ? '（老师指定）' : '（按进度自动计算）'}
        </p>
        <form action={setTeacherStudentCurrentLevelAction} className="admin-form-grid">
          <input name="studentUserId" type="hidden" value={student.id} />
          <label>
            <span>设置学生当前关卡</span>
            <select name="levelId" defaultValue={currentStudyLevel?.levelId ?? mainlineLevels[0]?.id ?? ''} required>
              {mainlineLevels.map((level) => (
                <option key={level.id} value={level.id}>
                  第{level.difficulty.spcgLevel}级 · 第{level.order}关 · {level.title}
                </option>
              ))}
            </select>
          </label>
          <button className="admin-button" disabled={mainlineLevels.length === 0} type="submit">
            保存当前关卡
          </button>
        </form>
      </section>

      <section className="admin-table">
        <div className="admin-table-head teacher-stage-grid">
          <span>关卡</span>
          <span>主线</span>
          <span>提高</span>
          <span>状态</span>
          <span>待修错</span>
        </div>
        {stageRows.map((stage) => (
          <article className="admin-table-row teacher-stage-grid" key={stage.id}>
            <span>
              第{stage.stageNo}关 · {stage.title}
              <small>{stage.lessonFocus ?? '-'}</small>
            </span>
            <span>{stage.requiredPassed}/3</span>
            <span>{stage.advancedPassed}/2</span>
            <span>{stage.status}</span>
            <span>{stage.pendingRepair}</span>
          </article>
        ))}
        {stageRows.length === 0 ? <p className="admin-empty">No lesson stage data yet.</p> : null}
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

function summarizeRecentErrors(
  submissions: Array<{
    result: string | null
  }>,
) {
  const counts = new Map<string, number>()
  for (const submission of submissions) {
    const result = submission.result
    if (!result || result === 'AC') continue
    counts.set(result, (counts.get(result) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([result, count]) => `${result}×${count}`)
    .join(' / ')
}

function buildStageRow(
  menu: {
    problemSetId: string
    title: string
    stageNo: number
    lessonFocus: string | null
    items: Array<{ levelId: string; position: number }>
  },
  progressByLevelId: Map<string, { passed: boolean; attemptCount: number }>,
) {
  const requiredItems = menu.items.filter((item) => item.position <= 3)
  const advancedItems = menu.items.filter((item) => item.position > 3 && item.position <= 5)
  const requiredPassed = requiredItems.filter((item) => progressByLevelId.get(item.levelId)?.passed).length
  const advancedPassed = advancedItems.filter((item) => progressByLevelId.get(item.levelId)?.passed).length
  const totalPassed = requiredPassed + advancedPassed
  const pendingRepair = menu.items.filter((item) => {
    const progress = progressByLevelId.get(item.levelId)
    return progress && !progress.passed && progress.attemptCount > 0
  }).length
  const status =
    totalPassed >= 5
      ? '完全掌握'
      : totalPassed >= 4
        ? '掌握良好'
        : requiredPassed >= 3
          ? '主线完成'
          : '进行中'

  return {
    id: menu.problemSetId,
    title: menu.title,
    stageNo: menu.stageNo,
    lessonFocus: menu.lessonFocus,
    requiredPassed,
    advancedPassed,
    pendingRepair,
    status,
  }
}

function AdminFact({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="admin-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
