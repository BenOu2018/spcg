import Link from 'next/link'
import { requireTeacherSession } from '@/lib/teacher-auth'
import { getTeacherStudents } from '@/lib/services/teacher-service'
import { STUDENT_USERNAME_RULE_TITLE } from '@/lib/user-identity'
import { addTeacherStudentAction, createTeacherStudentAction, removeTeacherStudentAction } from '../actions'
import {
  TeacherDrawer,
  TeacherEmpty,
  TeacherPageHeader,
  TeacherPanel,
  TeacherStatCard,
  TeacherStatusBadge,
} from '../components/TeacherChrome'

type TeacherStudentsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

const PAGE_SIZE = 20

export default async function TeacherStudentsPage({ searchParams }: TeacherStudentsPageProps) {
  const session = await requireTeacherSession('/teacher/students')
  const params = (await searchParams) ?? {}
  const students = await getTeacherStudents(session.user.id)
  const filters = readFilters(params)
  const visibleStudents = students.filter((student) => {
    const matchText =
      !filters.q ||
      student.username.toLowerCase().includes(filters.q) ||
      (student.displayName ?? '').toLowerCase().includes(filters.q) ||
      student.id.toLowerCase().includes(filters.q)
    const matchAccess = !filters.access || student.accessLevel === filters.access
    const matchStatus =
      !filters.status ||
      (filters.status === 'online' && student.isOnline) ||
      (filters.status === 'offline' && !student.isOnline)
    return matchText && matchAccess && matchStatus
  })
  const totalPages = Math.max(1, Math.ceil(visibleStudents.length / PAGE_SIZE))
  const page = Math.min(Math.max(filters.page, 1), totalPages)
  const pageStudents = visibleStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const baseHref = buildStudentsHref({ q: filters.q, access: filters.access, status: filters.status })

  return (
    <section className="teacher-page">
      <TeacherPageHeader
        eyebrow="Students"
        title="学生工作台"
        description="以列表为入口管理学生，复杂操作通过右侧 Drawer 完成。"
        actions={
          <>
            <Link className="teacher-button secondary" href={`${baseHref}${baseHref.includes('?') ? '&' : '?'}drawer=add-existing`}>
              添加已有学生
            </Link>
            <Link className="teacher-button" href={`${baseHref}${baseHref.includes('?') ? '&' : '?'}drawer=create`}>
              新建学生
            </Link>
          </>
        }
      />

      <section className="teacher-stat-grid compact">
        <TeacherStatCard label="全部学生" value={students.length} />
        <TeacherStatCard label="当前筛选" value={visibleStudents.length} />
        <TeacherStatCard label="在线" value={students.filter((student) => student.isOnline).length} />
        <TeacherStatCard label="待修错" value={students.reduce((sum, student) => sum + student.pendingRepairCount, 0)} />
      </section>

      <TeacherPanel
        action={
          <div className="teacher-panel-summary">
            <strong>学生列表</strong>
            <span>{visibleStudents.length} 条当前筛选 · 每页 {PAGE_SIZE} 条</span>
          </div>
        }
        className="teacher-filter-panel"
        title="筛选"
        meta="Search and filters"
      >
        <form className="teacher-filter-bar teacher-filter-bar-dense teacher-student-filter-bar" action="/teacher/students">
          <label>
            <span>搜索</span>
            <input name="q" defaultValue={filters.q} placeholder="姓名、用户名或 ID" />
          </label>
          <label>
            <span>权限</span>
            <select name="access" defaultValue={filters.access}>
              <option value="">全部</option>
              <option value="owner">主老师</option>
              <option value="viewer">共享查看</option>
            </select>
          </label>
          <label>
            <span>在线</span>
            <select name="status" defaultValue={filters.status}>
              <option value="">全部</option>
              <option value="online">在线</option>
              <option value="offline">离线</option>
            </select>
          </label>
          <button className="teacher-button" type="submit">
            筛选
          </button>
          <Link className="teacher-button secondary" href="/teacher/students">
            重置
          </Link>
        </form>
      </TeacherPanel>

      <TeacherPanel className="teacher-list-panel" title="学生列表" hideHeader>
        <div className="teacher-data-table">
          <div className="teacher-data-head teacher-student-table-grid">
            <span>学生</span>
            <span>权限</span>
            <span>进度</span>
            <span>今日</span>
            <span>家长</span>
            <span>在线</span>
            <span>操作</span>
          </div>
          {pageStudents.map((student) => (
            <article className="teacher-data-row teacher-student-table-grid" key={student.id}>
              <span>
                <Link className="teacher-title-link" href={`/teacher/students/${student.id}`}>
                  {student.displayName ?? student.username ?? student.id}
                </Link>
                <small>{student.username} · {student.studentEnrollmentLabel} · {student.accountStatus}</small>
              </span>
              <span>
                <TeacherStatusBadge tone={student.accessLevel === 'owner' ? 'success' : 'info'}>
                  {student.accessLevel === 'owner' ? '主老师' : '共享'}
                </TeacherStatusBadge>
              </span>
              <span>
                {student.passedCount} 通过
                <small>{student.pendingRepairCount} 待修错 / {student.submissionCount} 提交</small>
              </span>
              <span>
                {student.todaySubmissionCount} 次
                <small>{student.todayAcceptedCount} 今日通过 / +{student.todayCoinDelta} 金币</small>
              </span>
              <span>{student.parentCount}</span>
              <span>
                <TeacherStatusBadge tone={student.isOnline ? 'success' : 'neutral'}>{student.isOnline ? '在线' : '离线'}</TeacherStatusBadge>
              </span>
              <span className="teacher-row-actions">
                <Link className="teacher-small-button" href={`/teacher/students/${student.id}`}>
                  查看
                </Link>
                <form action={removeTeacherStudentAction}>
                  <input name="studentUserId" type="hidden" value={student.id} />
                  <button className="teacher-small-button subtle" type="submit">
                    移除
                  </button>
                </form>
              </span>
            </article>
          ))}
          {pageStudents.length === 0 ? <TeacherEmpty>没有符合条件的学生。</TeacherEmpty> : null}
        </div>
        <div className="teacher-pagination">
          <Link className={page <= 1 ? 'disabled' : undefined} href={buildStudentsHref({ ...filters, page: page - 1 })}>
            上一页
          </Link>
          <span>
            {page} / {totalPages}
          </span>
          <Link className={page >= totalPages ? 'disabled' : undefined} href={buildStudentsHref({ ...filters, page: page + 1 })}>
            下一页
          </Link>
        </div>
      </TeacherPanel>

      {filters.drawer === 'create' ? (
        <TeacherDrawer title="新建学生" description="创建学生账号并自动加入你的学生列表。" closeHref={baseHref}>
          {filters.createError ? (
            <p className="teacher-inline-warning" role="alert">
              {filters.createError}
            </p>
          ) : null}
          <form action={createTeacherStudentAction} className="teacher-form-grid">
            <label>
              <span>显示名</span>
              <input name="displayName" required placeholder="Toby" />
            </label>
            <label>
              <span>用户名</span>
              <input
                name="username"
                required
                placeholder="toby01"
                minLength={2}
                maxLength={24}
                autoCapitalize="none"
                title={STUDENT_USERNAME_RULE_TITLE}
              />
            </label>
            <label>
              <span>临时密码</span>
              <input name="password" type="password" required minLength={8} placeholder="至少 8 位" />
            </label>
            <label>
              <span>年龄</span>
              <input name="age" type="number" min={0} max={120} placeholder="10" />
            </label>
            <label>
              <span>家长邮箱</span>
              <input name="parentEmail" type="email" placeholder="parent@example.com" />
            </label>
            <button className="teacher-button" type="submit">
              创建并添加
            </button>
          </form>
        </TeacherDrawer>
      ) : null}

      {filters.drawer === 'add-existing' ? (
        <TeacherDrawer title="添加已有学生" description="输入学生用户名或 ID，添加到你的学生列表。" closeHref={baseHref}>
          <form action={addTeacherStudentAction} className="teacher-form-grid">
            <label>
              <span>学生用户名或 ID</span>
              <input name="studentIdentifier" required placeholder="toby01" />
            </label>
            <button className="teacher-button" type="submit">
              添加学生
            </button>
          </form>
        </TeacherDrawer>
      ) : null}
    </section>
  )
}

function readFilters(params: Record<string, string | string[] | undefined>) {
  const pageValue = Number(readParam(params.page) ?? 1)
  const access = readParam(params.access)
  const status = readParam(params.status)
  const drawer = readParam(params.drawer)
  return {
    q: readParam(params.q)?.toLowerCase() ?? '',
    access: access === 'owner' || access === 'viewer' ? access : '',
    status: status === 'online' || status === 'offline' ? status : '',
    drawer: drawer === 'create' || drawer === 'add-existing' ? drawer : '',
    createError: readParam(params.createError) ?? '',
    page: Number.isInteger(pageValue) ? pageValue : 1,
  }
}

function buildStudentsHref(input: { q?: string; access?: string; status?: string; page?: number }) {
  const params = new URLSearchParams()
  if (input.q) params.set('q', input.q)
  if (input.access) params.set('access', input.access)
  if (input.status) params.set('status', input.status)
  if (input.page && input.page > 1) params.set('page', String(input.page))
  const query = params.toString()
  return query ? `/teacher/students?${query}` : '/teacher/students'
}

function readParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}
