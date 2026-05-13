import Link from 'next/link'
import { requireTeacherSession } from '@/lib/teacher-auth'
import { getTeacherDashboard } from '@/lib/services/teacher-service'
import { TeacherEmpty, TeacherPageHeader, TeacherPanel, TeacherStatCard, TeacherStatusBadge } from './components/TeacherChrome'

export default async function TeacherPage() {
  const session = await requireTeacherSession('/teacher')
  const dashboard = await getTeacherDashboard(session.user.id)
  const totalVerdicts = Object.values(dashboard.overview.verdictCounts).reduce((sum, count) => sum + count, 0)

  return (
    <section className="teacher-page">
      <TeacherPageHeader
        eyebrow="Overview"
        title="老师工作台"
        description="快速查看今日学习状态、判题队列、卡住题目和最近活跃学生。"
        actions={
          <>
            <Link className="teacher-button secondary" href="/teacher/submissions">
              查看提交
            </Link>
            <Link className="teacher-button" href="/teacher/students">
              管理学生
            </Link>
          </>
        }
      />

      <section className="teacher-stat-grid">
        <TeacherStatCard label="学生总数" value={dashboard.overview.totalStudents} hint={`${dashboard.overview.ownerStudents} 主老师 / ${dashboard.overview.sharedStudents} 共享`} />
        <TeacherStatCard label="当前在线" value={dashboard.overview.onlineStudents} hint="近 15 分钟登录或提交" />
        <TeacherStatCard label="今日活跃" value={dashboard.overview.activeStudentsToday} hint="今日登录或提交" />
        <TeacherStatCard label="今日提交" value={dashboard.overview.submissionsToday} hint={`${totalVerdicts} 条已有结果`} />
        <TeacherStatCard label="待修错题" value={dashboard.overview.pendingRepairCount} hint="已尝试但未 AC" />
        <TeacherStatCard label="判题队列" value={`${dashboard.overview.pendingCount}/${dashboard.overview.judgingCount}`} hint="Pending / Judging" />
      </section>

      <section className="teacher-dashboard-grid">
        <TeacherPanel title="今日判题结果" meta="AC / WA / CE / TLE">
          <div className="teacher-verdict-grid">
            {Object.entries(dashboard.overview.verdictCounts).map(([result, count]) => (
              <div className="teacher-verdict-item" key={result}>
                <span>{result}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </TeacherPanel>

        <TeacherPanel title="最近卡住的题目" meta="近 7 天" action={<Link href="/teacher/submissions">打开检索</Link>}>
          <div className="teacher-compact-list">
            {dashboard.overview.stuckProblems.map((item) => (
              <Link
                className="teacher-compact-row"
                href={`/teacher/submissions?studentUserId=${item.userId}&levelId=${item.levelId}`}
                key={`${item.userId}-${item.levelId}`}
              >
                <div>
                  <strong>{item.userDisplayName ?? item.userId}</strong>
                  <span>{item.levelTitle}</span>
                </div>
                <TeacherStatusBadge tone="warning">{item.nonAcceptedCount} 次</TeacherStatusBadge>
              </Link>
            ))}
            {dashboard.overview.stuckProblems.length === 0 ? <TeacherEmpty>暂无明显卡住的题目。</TeacherEmpty> : null}
          </div>
        </TeacherPanel>
      </section>

      <TeacherPanel title="最近学生" meta={`${dashboard.students.length} total`} action={<Link href="/teacher/students">查看全部</Link>}>
        <div className="teacher-data-table">
          <div className="teacher-data-head teacher-recent-student-grid">
            <span>学生</span>
            <span>权限</span>
            <span>通过</span>
            <span>今日提交</span>
            <span>状态</span>
          </div>
          {dashboard.students.slice(0, 8).map((student) => (
            <Link className="teacher-data-row teacher-recent-student-grid" href={`/teacher/students/${student.id}`} key={student.id}>
              <span>
                <strong>{student.displayName ?? student.username ?? student.id}</strong>
                <small>{student.username}</small>
              </span>
              <span>{student.accessLevel === 'owner' ? '主老师' : '共享'}</span>
              <span>{student.passedCount}</span>
              <span>{student.todaySubmissionCount}</span>
              <span>
                <TeacherStatusBadge tone={student.isOnline ? 'success' : 'neutral'}>{student.isOnline ? '在线' : '离线'}</TeacherStatusBadge>
              </span>
            </Link>
          ))}
          {dashboard.students.length === 0 ? <TeacherEmpty>还没有绑定学生。</TeacherEmpty> : null}
        </div>
      </TeacherPanel>
    </section>
  )
}
