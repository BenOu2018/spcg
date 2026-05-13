import Link from 'next/link'
import { requireTeacherSession } from '@/lib/teacher-auth'
import { getMapMainlineLevels } from '@/lib/level-data'
import { getTeacherStudents, getTeacherSubmissionHistory } from '@/lib/services/teacher-service'
import { TeacherEmpty, TeacherPageHeader, TeacherPanel } from '../components/TeacherChrome'
import { TeacherSubmissionTable } from '../components/TeacherSubmissionTable'

export const dynamic = 'force-dynamic'

type TeacherSubmissionsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

const PAGE_SIZE = 50
const RESULT_OPTIONS = ['AC', 'WA', 'CE', 'TLE', 'MLE', 'RE', 'PE', 'Judge Error'] as const

export default async function TeacherSubmissionsPage({ searchParams }: TeacherSubmissionsPageProps) {
  const session = await requireTeacherSession('/teacher/submissions')
  const params = await searchParams
  const filters = readFilters(params ?? {})
  const [students, levels, submissions] = await Promise.all([
    getTeacherStudents(session.user.id),
    getMapMainlineLevels(),
    getTeacherSubmissionHistory({
      teacherUserId: session.user.id,
      studentUserId: filters.studentUserId,
      spcgLevel: filters.spcgLevel,
      levelId: filters.levelId,
      result: filters.result,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      limit: 300,
    }),
  ])
  const levelsBySpcg = levels.filter((level) => !filters.spcgLevel || level.difficulty.spcgLevel === filters.spcgLevel)
  const totalPages = Math.max(1, Math.ceil(submissions.length / PAGE_SIZE))
  const page = Math.min(filters.page, totalPages)
  const pageSubmissions = submissions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const baseHref = buildSubmissionsHref({ ...filters, page, submissionId: null })

  return (
    <section className="teacher-page">
      <TeacherPageHeader
        eyebrow="Submissions"
        title="提交检索中心"
        description="按学生、级别、题目、结果和日期筛选提交；点击记录从右侧查看源码与 AI 分析。"
        actions={
          <Link className="teacher-button secondary" href="/teacher/students">
            返回学生列表
          </Link>
        }
      />

      <TeacherPanel
        action={
          <div className="teacher-panel-summary">
            <strong>提交列表</strong>
            <span>{submissions.length} 条匹配记录</span>
          </div>
        }
        className="teacher-filter-panel"
        title="筛选条件"
        meta="Filter bar"
      >
        <form className="teacher-filter-bar teacher-filter-bar-dense teacher-submission-filter-bar" action="/teacher/submissions">
          <label>
            <span>学生</span>
            <select name="studentUserId" defaultValue={filters.studentUserId ?? ''}>
              <option value="">全部可访问学生</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.displayName ?? student.username}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>SPCG 级别</span>
            <select name="spcgLevel" defaultValue={filters.spcgLevel ? String(filters.spcgLevel) : ''}>
              <option value="">全部级别</option>
              {Array.from({ length: 9 }, (_, index) => index + 1).map((level) => (
                <option key={level} value={level}>
                  第 {level} 级
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>题目</span>
            <select name="levelId" defaultValue={filters.levelId ?? ''}>
              <option value="">全部题目</option>
              {levelsBySpcg.map((level) => (
                <option key={level.id} value={level.id}>
                  Lv.{level.difficulty.spcgLevel} · {level.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>结果</span>
            <select name="result" defaultValue={filters.result ?? ''}>
              <option value="">全部结果</option>
              {RESULT_OPTIONS.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>开始日期</span>
            <input name="dateFrom" type="date" defaultValue={filters.dateFrom ?? ''} />
          </label>
          <label>
            <span>结束日期</span>
            <input name="dateTo" type="date" defaultValue={filters.dateTo ?? ''} />
          </label>
          <div className="teacher-filter-actions">
            <button className="teacher-button" type="submit">
              查询
            </button>
            <Link className="teacher-button secondary" href="/teacher/submissions">
              重置
            </Link>
          </div>
        </form>
      </TeacherPanel>

      <TeacherPanel className="teacher-list-panel" title="提交列表" hideHeader>
        {submissions.length > 0 ? (
          <>
            <TeacherSubmissionTable
              submissions={pageSubmissions}
              emptyText="当前筛选条件下没有提交记录。"
              selectedSubmissionId={filters.submissionId}
              baseHref={baseHref}
              closeHref={baseHref}
            />
            <nav className="teacher-pagination" aria-label="Submission pagination">
              <Link
                className={page <= 1 ? 'disabled' : undefined}
                href={buildSubmissionsHref({ ...filters, page: Math.max(1, page - 1), submissionId: null })}
              >
                上一页
              </Link>
              <span>
                第 {page} / {totalPages} 页
              </span>
              <Link
                className={page >= totalPages ? 'disabled' : undefined}
                href={buildSubmissionsHref({ ...filters, page: Math.min(totalPages, page + 1), submissionId: null })}
              >
                下一页
              </Link>
            </nav>
          </>
        ) : (
          <TeacherEmpty>当前筛选条件下没有提交记录。</TeacherEmpty>
        )}
      </TeacherPanel>
    </section>
  )
}

function readFilters(params: Record<string, string | string[] | undefined>) {
  const spcgLevelValue = readParam(params.spcgLevel)
  const parsedSpcgLevel = spcgLevelValue ? Number(spcgLevelValue) : null
  const pageValue = readParam(params.page)
  const parsedPage = pageValue ? Number(pageValue) : 1
  return {
    studentUserId: readParam(params.studentUserId),
    spcgLevel: parsedSpcgLevel !== null && Number.isInteger(parsedSpcgLevel) && parsedSpcgLevel > 0 ? parsedSpcgLevel : null,
    levelId: readParam(params.levelId),
    result: readParam(params.result),
    dateFrom: readParam(params.dateFrom),
    dateTo: readParam(params.dateTo),
    submissionId: readParam(params.submissionId),
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
  }
}

function buildSubmissionsHref(filters: {
  studentUserId?: string | null
  spcgLevel?: number | null
  levelId?: string | null
  result?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  submissionId?: string | null
  page?: number | null
}) {
  const params = new URLSearchParams()
  if (filters.studentUserId) params.set('studentUserId', filters.studentUserId)
  if (filters.spcgLevel) params.set('spcgLevel', String(filters.spcgLevel))
  if (filters.levelId) params.set('levelId', filters.levelId)
  if (filters.result) params.set('result', filters.result)
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.set('dateTo', filters.dateTo)
  if (filters.page && filters.page > 1) params.set('page', String(filters.page))
  if (filters.submissionId) params.set('submissionId', filters.submissionId)
  const query = params.toString()
  return query ? `/teacher/submissions?${query}` : '/teacher/submissions'
}

function readParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}
