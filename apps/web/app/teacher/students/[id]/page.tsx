import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RANKED_ASSESSMENT_TOTAL_SCORE } from '@spcg/shared/ranked-assessment'
import { requireTeacherSession } from '@/lib/teacher-auth'
import {
  getTeacherLessonStageMenus,
  getTeacherStudentSharedTeachers,
  getTeacherStudentCurrentLevel,
  getTeacherStudentProgress,
  getTeacherStudents,
  getTeacherStudentSubmissions,
} from '@/lib/services/teacher-service'
import { getParentsForTeacherStudent } from '@/lib/services/parent-service'
import { getTeacherStudentBehaviorAnalyses } from '@/lib/services/behavior-analytics-service'
import { getTeacherStudentGrowthReportDetails } from '@/lib/services/growth-report-service'
import { requireUserInventory } from '@/lib/services/inventory-service'
import { listRankedAssessmentHistoryForUser } from '@/lib/services/assessment-service'
import { requireWalletSummary } from '@/lib/services/wallet-service'
import { getUserEntitlement, STUDENT_USER_TYPE_OPTIONS } from '@/lib/services/entitlement-service'
import { STUDENT_ENROLLMENT_TYPE_OPTIONS } from '@/lib/student-enrollment'
import { getLocalDateRangeEndingToday } from '@/lib/student-date'
import {
  bindParentToStudentAction,
  createParentForStudentAction,
  deleteStudentBehaviorAnalysisAction,
  generateStudentBehaviorAnalysisAction,
  generateStudentGrowthReportAction,
  removeParentStudentBindingAction,
  removeTeacherStudentAction,
  resetStudentParentInviteAction,
  revokeTeacherStudentShareAction,
  setTeacherStudentCurrentLevelAction,
  setTeacherStudentUserTypeAction,
  shareTeacherStudentAction,
  updateTeacherStudentProfileAction,
} from '../../actions'
import { StatementMarkdown } from '@/components/StatementMarkdown'
import { BehaviorAnalysisGenerateButton } from './BehaviorAnalysisGenerateButton'
import { GrowthReportAutoRefresh } from './GrowthReportAutoRefresh'
import { GrowthReportGenerateButton } from './GrowthReportGenerateButton'
import {
  TeacherDrawer,
  TeacherEmpty,
  TeacherPageHeader,
  TeacherPanel,
  TeacherStatCard,
  TeacherStatusBadge,
  TeacherTabs,
} from '../../components/TeacherChrome'

type TeacherStudentDetailPageProps = {
  params: Promise<{ id: string }> | { id: string }
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

type StudentDetailTab = 'overview' | 'progress' | 'submissions' | 'assessments' | 'rewards' | 'parents' | 'behavior' | 'settings'

export default async function TeacherStudentDetailPage({ params, searchParams }: TeacherStudentDetailPageProps) {
  const { id } = await params
  const query = (await searchParams) ?? {}
  const activeTab = normalizeTab(readParam(query.tab))
  const drawer = readParam(query.drawer)
  const parentInviteCode = readParam(query.parentInviteCode)
  const behaviorError = readParam(query.behaviorError)
  const behaviorMessage = readParam(query.behaviorMessage)
  const behaviorReportId = readParam(query.behaviorReportId)
  const growthReportError = readParam(query.growthReportError)
  const growthReportMessage = readParam(query.growthReportMessage)
  const growthReportId = readParam(query.growthReportId)
  const session = await requireTeacherSession(`/teacher/students/${id}`)
  const [
    students,
    progress,
    submissions,
    stageMenus,
    currentStudyLevel,
    wallet,
    inventory,
    assessmentHistory,
    sharedTeachers,
    parents,
    growthReports,
    behaviorAnalyses,
    entitlement,
  ] = await Promise.all([
    getTeacherStudents(session.user.id),
    getTeacherStudentProgress({ teacherUserId: session.user.id, studentUserId: id }),
    getTeacherStudentSubmissions({ teacherUserId: session.user.id, studentUserId: id, limit: 50 }),
    getTeacherLessonStageMenus(session.user.id),
    getTeacherStudentCurrentLevel({ teacherUserId: session.user.id, studentUserId: id }),
    requireWalletSummary(id).catch(() => null),
    requireUserInventory(id).catch(() => []),
    listRankedAssessmentHistoryForUser({ userId: id, limit: 8 }).catch(() => []),
    getTeacherStudentSharedTeachers({ teacherUserId: session.user.id, studentUserId: id }).catch(() => []),
    getParentsForTeacherStudent({ teacherUserId: session.user.id, studentUserId: id }).catch(() => []),
    getTeacherStudentGrowthReportDetails({ teacherUserId: session.user.id, studentUserId: id, limit: 8 }).catch(() => []),
    getTeacherStudentBehaviorAnalyses({ teacherUserId: session.user.id, studentUserId: id, limit: 8 }).catch(() => []),
    getUserEntitlement(id).catch(() => null),
  ])
  const student = students.find((item) => item.id === id)
  if (!student) notFound()

  const progressByLevelId = new Map(progress.map((item) => [item.levelId, item]))
  const stageRows = stageMenus.map((menu) => buildStageRow(menu, progressByLevelId))
  const pendingRepair = progress.filter((item) => !item.passed && item.attemptCount > 0).length
  const repairedSuccess = progress.filter((item) => item.passed && item.attemptCount > 1).length
  const recentErrorTypes = summarizeRecentErrors(submissions)
  const canManage = student.accessLevel === 'owner'
  const baseHref = `/teacher/students/${student.id}?tab=${activeTab}`
  const selectedBehaviorAnalysis = behaviorReportId
    ? behaviorAnalyses.find((analysis) => analysis.id === behaviorReportId) ?? null
    : null
  const selectedGrowthReport = growthReportId
    ? growthReports.find((report) => report.id === growthReportId) ?? null
    : null
  const hasPendingGrowthReport = growthReports.some((report) => report.status === 'pending')

  return (
    <section className="teacher-page">
      <GrowthReportAutoRefresh enabled={hasPendingGrowthReport} />
      <TeacherPageHeader
        eyebrow="Student"
        title={student.displayName ?? student.username ?? student.id}
        description={`${student.username} · ${student.accessLevel === 'owner' ? '主老师管理' : '共享查看'}`}
        actions={
          <>
            <Link className="teacher-button secondary" href="/teacher/students">
              返回列表
            </Link>
            {canManage ? (
              <form action={removeTeacherStudentAction}>
                <input name="studentUserId" type="hidden" value={student.id} />
                <button className="teacher-button danger" type="submit">
                  移除关联
                </button>
              </form>
            ) : null}
          </>
        }
      />

      <section className="teacher-student-hero">
        <div className="teacher-student-avatar">{(student.displayName ?? student.username).slice(0, 1).toUpperCase()}</div>
        <div>
          <h2>{currentStudyLevel ? currentStudyLevel.title : '暂未计算当前关卡'}</h2>
          <p>
            {currentStudyLevel
              ? `SPCG ${currentStudyLevel.spcgLevel}级 · 第${currentStudyLevel.stageNo ?? '-'}关 · ${currentStudyLevel.source === 'teacher_set' ? '老师指定' : '按进度自动计算'}`
              : '学生完成题目后会自动出现学习位置。'}
          </p>
        </div>
        <div className="teacher-student-badges">
          <TeacherStatusBadge tone={student.studentEnrollmentType === 'offline' ? 'success' : 'info'}>{student.studentEnrollmentLabel}</TeacherStatusBadge>
          <TeacherStatusBadge tone={student.isOnline ? 'success' : 'neutral'}>{student.isOnline ? '在线' : '离线'}</TeacherStatusBadge>
        </div>
      </section>

      <section className="teacher-stat-grid compact">
        <TeacherStatCard label="通过题目" value={student.passedCount} />
        <TeacherStatCard label="今日提交" value={student.todaySubmissionCount} />
        <TeacherStatCard label="待修错" value={pendingRepair} />
        <TeacherStatCard label="修错成功" value={repairedSuccess} />
        <TeacherStatCard label="金币" value={wallet?.coinTotal ?? 0} hint={wallet?.rankLabel ?? '暂无段位'} />
        <TeacherStatCard label="蒜粒" value={wallet?.garlicBalance ?? 0} hint={wallet?.title ?? '暂无称谓'} />
        <TeacherStatCard label="学员类型" value={student.studentEnrollmentLabel} hint={student.studentEnrollmentType === 'offline' ? '自动最高权益' : '按线上会员权益'} />
        <TeacherStatCard label="用户类型" value={entitlement?.label ?? '体验用户'} hint={entitlement?.entitlementSource === 'offline_enrollment' ? '线下权益生效' : entitlement?.updatedAt ? new Date(entitlement.updatedAt).toLocaleDateString() : '默认权益'} />
      </section>

      {parentInviteCode ? (
        <div className="teacher-once-code">
          本次家长邀请码：<strong>{parentInviteCode}</strong>
        </div>
      ) : null}

      <TeacherTabs
        tabs={[
          { href: `/teacher/students/${student.id}?tab=overview`, label: '概览', active: activeTab === 'overview' },
          { href: `/teacher/students/${student.id}?tab=progress`, label: '关卡进度', count: stageRows.length, active: activeTab === 'progress' },
          { href: `/teacher/students/${student.id}?tab=submissions`, label: '提交记录', count: submissions.length, active: activeTab === 'submissions' },
          { href: `/teacher/students/${student.id}?tab=assessments`, label: '考试记录', count: assessmentHistory.length, active: activeTab === 'assessments' },
          { href: `/teacher/students/${student.id}?tab=rewards`, label: '奖励成长', active: activeTab === 'rewards' },
          { href: `/teacher/students/${student.id}?tab=parents`, label: '家长与报告', count: parents.length, active: activeTab === 'parents' },
          { href: `/teacher/students/${student.id}?tab=behavior`, label: '行为分析', count: behaviorAnalyses.length, active: activeTab === 'behavior' },
          { href: `/teacher/students/${student.id}?tab=settings`, label: '设置', active: activeTab === 'settings' },
        ]}
      />

      {activeTab === 'overview' ? (
        <section className="teacher-dashboard-grid">
          <TeacherPanel title="学习状态" meta="Learning pulse">
            <div className="teacher-summary-list">
              <SummaryRow label="当前关卡" value={currentStudyLevel?.title ?? '-'} />
              <SummaryRow label="最近错误" value={recentErrorTypes || '暂无明显错误'} />
              <SummaryRow label="提交总数" value={student.submissionCount} />
              <SummaryRow label="家长绑定" value={`${parents.length} 位`} />
              <SummaryRow label="成长报告" value={`${growthReports.length} 份`} />
              <SummaryRow label="行为分析" value={`${behaviorAnalyses.length} 份`} />
            </div>
          </TeacherPanel>
          <TeacherPanel title="近期提交" meta="Latest 8" action={<Link href={`/teacher/students/${student.id}?tab=submissions`}>查看全部</Link>}>
            <div className="teacher-compact-list">
              {submissions.slice(0, 8).map((submission) => (
                <Link className="teacher-compact-row" href={`/teacher/submissions?studentUserId=${student.id}&levelId=${submission.levelId}`} key={submission.id}>
                  <div>
                    <strong>{submission.levelTitle}</strong>
                    <span>{new Date(submission.createdAt).toLocaleString()}</span>
                  </div>
                  <TeacherStatusBadge tone={submission.result === 'AC' ? 'success' : submission.result ? 'warning' : 'neutral'}>
                    {submission.result ?? submission.status}
                  </TeacherStatusBadge>
                </Link>
              ))}
              {submissions.length === 0 ? <TeacherEmpty>暂无提交记录。</TeacherEmpty> : null}
            </div>
          </TeacherPanel>
        </section>
      ) : null}

      {activeTab === 'progress' ? (
        <TeacherPanel title="每关 5 题完成度" meta="前 3 题为主线">
          <div className="teacher-data-table">
            <div className="teacher-data-head teacher-stage-table-grid">
              <span>关卡</span>
              <span>主线</span>
              <span>提高</span>
              <span>状态</span>
              <span>待修错</span>
            </div>
            {stageRows.map((stage) => (
              <div className="teacher-data-row teacher-stage-table-grid" key={stage.id}>
                <span>
                  <strong>第{stage.stageNo}关 · {stage.title}</strong>
                  <small>{stage.lessonFocus ?? '-'}</small>
                </span>
                <span>{stage.requiredPassed}/3</span>
                <span>{stage.advancedPassed}/2</span>
                <span>{stage.status}</span>
                <span>{stage.pendingRepair}</span>
              </div>
            ))}
            {stageRows.length === 0 ? <TeacherEmpty>暂无关卡题单数据。</TeacherEmpty> : null}
          </div>
        </TeacherPanel>
      ) : null}

      {activeTab === 'submissions' ? (
        <TeacherPanel title="提交记录" meta="最近 50 条" action={<Link href={`/teacher/submissions?studentUserId=${student.id}`}>打开提交检索</Link>}>
          <div className="teacher-data-table">
            <div className="teacher-data-head teacher-student-submission-grid">
              <span>题目</span>
              <span>状态</span>
              <span>结果</span>
              <span>语言</span>
              <span>提交时间</span>
            </div>
            {submissions.map((submission) => (
              <Link className="teacher-data-row teacher-student-submission-grid" href={`/teacher/submissions?studentUserId=${student.id}&levelId=${submission.levelId}`} key={submission.id}>
                <span>
                  <strong>{submission.levelTitle}</strong>
                  <small>{submission.levelId}</small>
                </span>
                <span>{submission.status}</span>
                <span>
                  <TeacherStatusBadge tone={submission.result === 'AC' ? 'success' : submission.result ? 'warning' : 'neutral'}>
                    {submission.result ?? '-'}
                  </TeacherStatusBadge>
                </span>
                <span>{submission.language}</span>
                <span>{new Date(submission.createdAt).toLocaleString()}</span>
              </Link>
            ))}
            {submissions.length === 0 ? <TeacherEmpty>暂无提交记录。</TeacherEmpty> : null}
          </div>
        </TeacherPanel>
      ) : null}

      {activeTab === 'assessments' ? (
        <TeacherPanel title="段位赛历史" meta={`${assessmentHistory.length} records`}>
          <div className="teacher-compact-list">
            {assessmentHistory.map((attempt) => (
              <div className="teacher-compact-row" key={attempt.id}>
                <div>
                  <strong>{attempt.sessionTitle}</strong>
                  <span>{attempt.finishedAt ? new Date(attempt.finishedAt).toLocaleString() : '未完成'}</span>
                </div>
                <TeacherStatusBadge tone={attempt.status === 'completed' ? 'success' : 'neutral'}>
                  {attempt.score}/{RANKED_ASSESSMENT_TOTAL_SCORE}
                </TeacherStatusBadge>
              </div>
            ))}
            {assessmentHistory.length === 0 ? <TeacherEmpty>暂无考试记录。</TeacherEmpty> : null}
          </div>
        </TeacherPanel>
      ) : null}

      {activeTab === 'rewards' ? (
        <section className="teacher-dashboard-grid">
          <TeacherPanel title="钱包与段位" meta="Reward summary">
            <div className="teacher-summary-list">
              <SummaryRow label="金币" value={wallet?.coinTotal ?? 0} />
              <SummaryRow label="段位" value={wallet?.rankLabel ?? '-'} />
              <SummaryRow label="蒜粒" value={wallet?.garlicBalance ?? 0} />
              <SummaryRow label="称谓" value={wallet?.title ?? '-'} />
            </div>
          </TeacherPanel>
          <TeacherPanel title="背包摘要" meta={`${inventory.length} items`}>
            <div className="teacher-compact-list">
              {inventory.slice(0, 10).map((item) => (
                <div className="teacher-compact-row" key={item.item.id}>
                  <div>
                    <strong>{item.item.name}</strong>
                    <span>{item.item.rarity} · {item.item.algorithmTag ?? '-'}</span>
                  </div>
                  <TeacherStatusBadge>{item.quantity}</TeacherStatusBadge>
                </div>
              ))}
              {inventory.length === 0 ? <TeacherEmpty>暂无背包物品。</TeacherEmpty> : null}
            </div>
          </TeacherPanel>
        </section>
      ) : null}

      {activeTab === 'parents' ? (
        <section className="teacher-dashboard-grid teacher-parent-report-grid">
          <TeacherPanel
            title="家长绑定"
            meta={`${parents.length} active`}
            action={
              canManage && parents.length === 0 ? (
                <div className="teacher-row-actions">
                  <Link className="teacher-small-button" href={`${baseHref}&drawer=parent-invite`}>重置邀请码</Link>
                  <Link className="teacher-small-button" href={`${baseHref}&drawer=create-parent`}>新建家长</Link>
                  <Link className="teacher-small-button" href={`${baseHref}&drawer=bind-parent`}>绑定已有</Link>
                </div>
              ) : null
            }
          >
            <div className="teacher-compact-list">
              {parents.map((binding) => (
                <div className="teacher-compact-row" key={binding.parentUserId}>
                  <div>
                    <strong>{binding.parent.displayName ?? binding.parent.username}</strong>
                    <span>
                      {binding.parent.username}
                      {binding.parent.phoneNumberMasked ? ` · ${binding.parent.phoneNumberMasked}` : ''}
                    </span>
                  </div>
                  {canManage ? (
                    <form action={removeParentStudentBindingAction}>
                      <input name="studentUserId" type="hidden" value={student.id} />
                      <input name="parentUserId" type="hidden" value={binding.parentUserId} />
                      <button className="teacher-small-button subtle" type="submit">移除</button>
                    </form>
                  ) : null}
                </div>
              ))}
              {parents.length === 0 ? <TeacherEmpty>暂无家长绑定。</TeacherEmpty> : null}
            </div>
          </TeacherPanel>
          <TeacherPanel
            title="成长报告"
            meta={`${growthReports.length} recent`}
            action={canManage ? <Link className="teacher-small-button" href={`${baseHref}&drawer=growth-report`}>生成报告</Link> : null}
          >
            {growthReportMessage ? <p className="teacher-inline-success">{growthReportMessage}</p> : null}
            <div className="teacher-compact-list">
              {growthReports.map((report) => (
                <Link
                  className={`teacher-compact-row growth-report-list-row${report.id === growthReportId ? ' active' : ''}`}
                  href={`/teacher/students/${student.id}?tab=parents&growthReportId=${report.id}`}
                  key={report.id}
                >
                  <div className="growth-report-list-main">
                    <strong>{report.title}</strong>
                    <span>{report.periodStart} 至 {report.periodEnd}</span>
                  </div>
                  <TeacherStatusBadge>{formatGrowthReportStatus(report.status)}</TeacherStatusBadge>
                </Link>
              ))}
              {growthReports.length === 0 ? <TeacherEmpty>暂无成长报告。</TeacherEmpty> : null}
            </div>
          </TeacherPanel>
          <TeacherPanel
            className="growth-report-detail-panel"
            title="报告内容"
            meta={selectedGrowthReport ? `${selectedGrowthReport.periodStart} 至 ${selectedGrowthReport.periodEnd}` : 'Select report'}
          >
            {selectedGrowthReport ? (
              <article className="behavior-analysis-card growth-report-detail-card">
                <header>
                  <div>
                    <strong>{selectedGrowthReport.title}</strong>
                    <span>{selectedGrowthReport.periodStart} 至 {selectedGrowthReport.periodEnd}</span>
                  </div>
                  <div className="growth-report-detail-actions">
                    <TeacherStatusBadge>{formatGrowthReportStatus(selectedGrowthReport.status)}</TeacherStatusBadge>
                    {selectedGrowthReport.status === 'generated' && selectedGrowthReport.publicUrl ? (
                      <Link className="teacher-small-button" href={selectedGrowthReport.publicUrl} target="_blank" rel="noreferrer">
                        家长链接
                      </Link>
                    ) : null}
                  </div>
                </header>
                {selectedGrowthReport.status === 'pending' ? (
                  <TeacherEmpty>报告正在生成中，可以先离开此页面，稍后回到家长报告列表查看。</TeacherEmpty>
                ) : selectedGrowthReport.status === 'failed' ? (
                  <TeacherEmpty>{selectedGrowthReport.errorMessage ?? '报告生成失败，请稍后重新生成。'}</TeacherEmpty>
                ) : (
                  <StatementMarkdown markdown={selectedGrowthReport.markdown} assets={[]} hideImages />
                )}
              </article>
            ) : (
              <TeacherEmpty>请选择左侧一份家长报告查看完整内容。</TeacherEmpty>
            )}
          </TeacherPanel>
        </section>
      ) : null}

      {activeTab === 'behavior' ? (
        <section className="teacher-behavior-analysis-layout">
          <div className="behavior-analysis-sidebar">
            <TeacherPanel
              title="生成行为分析"
              meta={canManage ? 'Manual AI analysis' : '共享老师只读'}
            >
              {behaviorError ? <p className="teacher-inline-warning">{behaviorError}</p> : null}
              {behaviorMessage ? <p className="teacher-inline-success">{behaviorMessage}</p> : null}
              {canManage ? (
                <form className="teacher-filter-bar teacher-filter-bar-dense behavior-analysis-filter-form" action={generateStudentBehaviorAnalysisAction}>
                  <input name="studentUserId" type="hidden" value={student.id} />
                  <label>
                    <span>快捷周期</span>
                    <select name="periodDays" defaultValue="7">
                      <option value="7">最近 7 天</option>
                      <option value="30">最近 30 天</option>
                      <option value="90">最近 90 天</option>
                    </select>
                  </label>
                  <label>
                    <span>开始日期</span>
                    <input name="periodStart" type="date" />
                  </label>
                  <label>
                    <span>结束日期</span>
                    <input name="periodEnd" type="date" />
                  </label>
                  <BehaviorAnalysisGenerateButton />
                </form>
              ) : (
                <TeacherEmpty>共享老师可以查看行为分析，但不能生成新的分析。</TeacherEmpty>
              )}
            </TeacherPanel>

            <TeacherPanel title="行为分析报告列表" meta={`${behaviorAnalyses.length} recent`}>
              <div className="teacher-compact-list">
                {behaviorAnalyses.map((analysis) => (
                  <div className={`teacher-compact-row behavior-report-list-row${analysis.id === behaviorReportId ? ' active' : ''}`} key={analysis.id}>
                    <Link className="behavior-report-list-link" href={`/teacher/students/${student.id}?tab=behavior&behaviorReportId=${analysis.id}`}>
                      <div>
                        <strong>{analysis.periodStart} 至 {analysis.periodEnd}</strong>
                        <span>{new Date(analysis.createdAt).toLocaleString()} · {analysis.provider}/{analysis.model}</span>
                      </div>
                      <TeacherStatusBadge>{analysis.analysis.confidence}</TeacherStatusBadge>
                    </Link>
                    {canManage ? (
                      <form action={deleteStudentBehaviorAnalysisAction} className="behavior-report-delete-form">
                        <input name="studentUserId" type="hidden" value={student.id} />
                        <input name="reportId" type="hidden" value={analysis.id} />
                        <input name="currentReportId" type="hidden" value={behaviorReportId ?? ''} />
                        <button className="teacher-small-button subtle behavior-report-delete-button" type="submit">
                          删除
                        </button>
                      </form>
                    ) : null}
                  </div>
                ))}
                {behaviorAnalyses.length === 0 ? <TeacherEmpty>暂无行为分析。生成后会在这里显示。</TeacherEmpty> : null}
              </div>
            </TeacherPanel>
          </div>

          <TeacherPanel
            className="behavior-analysis-detail-panel"
            title="报告详细内容"
            meta={selectedBehaviorAnalysis ? `${selectedBehaviorAnalysis.periodStart} 至 ${selectedBehaviorAnalysis.periodEnd}` : 'Select report'}
          >
            {selectedBehaviorAnalysis ? (
              <article className="behavior-analysis-card behavior-analysis-detail-card">
                <header>
                  <div>
                    <strong>{selectedBehaviorAnalysis.periodStart} 至 {selectedBehaviorAnalysis.periodEnd}</strong>
                    <span>
                      {new Date(selectedBehaviorAnalysis.createdAt).toLocaleString()} · {selectedBehaviorAnalysis.provider}/{selectedBehaviorAnalysis.model}
                    </span>
                  </div>
                  <TeacherStatusBadge>{selectedBehaviorAnalysis.analysis.confidence}</TeacherStatusBadge>
                </header>
                {selectedBehaviorAnalysis.errorMessage ? <p className="teacher-inline-warning">{selectedBehaviorAnalysis.errorMessage}</p> : null}
                <StatementMarkdown markdown={selectedBehaviorAnalysis.markdown} assets={[]} hideImages />
              </article>
            ) : (
              <TeacherEmpty>请先从报告列表中选择一份报告查看详细内容。</TeacherEmpty>
            )}
          </TeacherPanel>
        </section>
      ) : null}

      {activeTab === 'settings' ? (
        <section className="teacher-dashboard-grid">
          <TeacherPanel title="学习设置" meta={canManage ? '可编辑' : '共享老师只读'}>
            <div className="teacher-summary-list">
              <SummaryRow label="显示名" value={student.displayName ?? student.username} />
              <SummaryRow label="年龄" value={student.age ?? '-'} />
              <SummaryRow label="真实姓名" value={student.realName ?? '-'} />
              <SummaryRow label="身份证" value={maskIdCardNumber(student.idCardNumber)} />
              <SummaryRow label="手机号" value={student.phoneNumberMasked ?? '未绑定'} />
              <SummaryRow label="学员类型" value={student.studentEnrollmentLabel} />
              <SummaryRow label="用户类型" value={entitlement?.label ?? '体验用户'} />
              <SummaryRow label="老师备注" value={student.teacherNote ?? '-'} />
            </div>
            {canManage ? (
              <div className="teacher-row-actions">
                <Link className="teacher-button" href={`${baseHref}&drawer=edit-profile`}>编辑资料</Link>
                <Link className="teacher-button secondary" href={`${baseHref}&drawer=current-level`}>设置当前关卡</Link>
                <Link className="teacher-button secondary" href={`${baseHref}&drawer=user-type`}>设置用户类型</Link>
              </div>
            ) : null}
          </TeacherPanel>
          <TeacherPanel
            title="共享老师"
            meta={`${sharedTeachers.length} viewers`}
            action={canManage ? <Link className="teacher-small-button" href={`${baseHref}&drawer=share-teacher`}>共享学生</Link> : null}
          >
            <div className="teacher-compact-list">
              {sharedTeachers.map((teacher) => (
                <div className="teacher-compact-row" key={teacher.teacherUserId}>
                  <div>
                    <strong>{teacher.displayName ?? teacher.username}</strong>
                    <span>{teacher.username} · {teacher.sharedAt ? new Date(teacher.sharedAt).toLocaleString() : 'shared'}</span>
                  </div>
                  {canManage ? (
                    <form action={revokeTeacherStudentShareAction}>
                      <input name="studentUserId" type="hidden" value={student.id} />
                      <input name="targetTeacherUserId" type="hidden" value={teacher.teacherUserId} />
                      <button className="teacher-small-button subtle" type="submit">撤销</button>
                    </form>
                  ) : null}
                </div>
              ))}
              {sharedTeachers.length === 0 ? <TeacherEmpty>暂无共享老师。</TeacherEmpty> : null}
            </div>
          </TeacherPanel>
        </section>
      ) : null}

      {renderDrawer({
        drawer,
        closeHref: baseHref,
        studentId: student.id,
        student,
        levelOptions: stageMenus,
        currentLevelId: currentStudyLevel?.levelId ?? stageMenus[0]?.items[0]?.levelId ?? '',
        userType: entitlement?.storedUserType ?? entitlement?.userType ?? 'experience',
        entitlementSource: entitlement?.entitlementSource ?? null,
        growthReportError,
      })}
    </section>
  )
}

function renderDrawer(input: {
  drawer: string | null
  closeHref: string
  studentId: string
  student: {
    displayName: string | null
    username: string
    age: number | null
    realName?: string | null
    idCardNumber?: string | null
    parentEmail: string | null
    studentEnrollmentType: 'online' | 'offline'
    studentEnrollmentLabel: string
    teacherNote: string | null
  }
  levelOptions: Array<{
    problemSetId: string
    title: string
    spcgLevel: number
    stageNo: number
    lessonFocus: string | null
    items: Array<{ levelId: string; title: string; position: number }>
  }>
  currentLevelId: string
  userType: string
  entitlementSource: string | null
  growthReportError: string | null
}) {
  if (!input.drawer) return null
  if (input.drawer === 'edit-profile') {
    return (
      <TeacherDrawer title="编辑学习资料" closeHref={input.closeHref}>
        <form action={updateTeacherStudentProfileAction} className="teacher-form-grid">
          <input name="studentUserId" type="hidden" value={input.studentId} />
          <label><span>显示名</span><input name="displayName" defaultValue={input.student.displayName ?? input.student.username} required /></label>
          <label><span>年龄</span><input name="age" type="number" min={0} max={120} defaultValue={input.student.age ?? ''} /></label>
          <label><span>真实姓名</span><input name="realName" defaultValue={input.student.realName ?? ''} placeholder="用于考试、证书或实名资料" /></label>
          <label><span>身份证号</span><input name="idCardNumber" defaultValue={input.student.idCardNumber ?? ''} placeholder="15或18位身份证号" /></label>
          <label><span>家长邮箱</span><input name="parentEmail" type="email" defaultValue={input.student.parentEmail ?? ''} /></label>
          <label>
            <span>学员类型</span>
            <select name="studentEnrollmentType" defaultValue={input.student.studentEnrollmentType}>
              {STUDENT_ENROLLMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label><span>老师备注</span><textarea name="teacherNote" defaultValue={input.student.teacherNote ?? ''} rows={4} /></label>
          <button className="teacher-button" type="submit">保存资料</button>
        </form>
      </TeacherDrawer>
    )
  }
  if (input.drawer === 'current-level') {
    return (
      <TeacherDrawer title="设置当前关卡" closeHref={input.closeHref}>
        <form action={setTeacherStudentCurrentLevelAction} className="teacher-form-grid">
          <input name="studentUserId" type="hidden" value={input.studentId} />
          <label>
            <span>当前关卡</span>
            <select name="levelId" defaultValue={input.currentLevelId} required>
              {input.levelOptions.map((stage) => {
                const levelId = stage.items[0]?.levelId
                if (!levelId) return null
                return (
                  <option key={stage.problemSetId} value={levelId}>
                    第{stage.spcgLevel}级 · 第{stage.stageNo}关 · {stage.title}
                    {stage.lessonFocus ? ` · ${stage.lessonFocus}` : ''}
                  </option>
                )
              })}
            </select>
          </label>
          <button className="teacher-button" disabled={input.levelOptions.length === 0} type="submit">保存当前关卡</button>
        </form>
      </TeacherDrawer>
    )
  }
  if (input.drawer === 'user-type') {
    return (
      <TeacherDrawer title="设置学生用户类型" description="用户类型只影响访问权益，不改变学生账号角色。" closeHref={input.closeHref}>
        <form action={setTeacherStudentUserTypeAction} className="teacher-form-grid">
          <input name="studentUserId" type="hidden" value={input.studentId} />
          <label>
            <span>用户类型</span>
            <select name="userType" defaultValue={input.userType} required>
              {STUDENT_USER_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label><span>备注</span><textarea name="note" rows={3} placeholder="记录开通原因、付款备注或测试批次" /></label>
          <div className="teacher-form-note">
            {input.entitlementSource === 'offline_enrollment' ? (
              <p><strong>线下学员</strong>：已自动拥有最高权益；这里保存的用户类型仅在切回线上学员后生效。</p>
            ) : null}
            {STUDENT_USER_TYPE_OPTIONS.map((option) => (
              <p key={option.value}><strong>{option.label}</strong>：{option.description}</p>
            ))}
          </div>
          <button className="teacher-button" type="submit">保存用户类型</button>
        </form>
      </TeacherDrawer>
    )
  }
  if (input.drawer === 'share-teacher') {
    return (
      <TeacherDrawer title="共享给其他老师" closeHref={input.closeHref}>
        <form action={shareTeacherStudentAction} className="teacher-form-grid">
          <input name="studentUserId" type="hidden" value={input.studentId} />
          <label><span>老师用户名或 ID</span><input name="targetTeacherIdentifier" required placeholder="teacher01" /></label>
          <button className="teacher-button" type="submit">共享学生</button>
        </form>
      </TeacherDrawer>
    )
  }
  if (input.drawer === 'parent-invite') {
    return (
      <TeacherDrawer title="重置家长邀请码" description="旧邀请码会立即失效，新邀请码只在本次页面显示一次。" closeHref={input.closeHref}>
        <form action={resetStudentParentInviteAction} className="teacher-form-grid">
          <input name="studentUserId" type="hidden" value={input.studentId} />
          <button className="teacher-button" type="submit">重置并显示邀请码</button>
        </form>
      </TeacherDrawer>
    )
  }
  if (input.drawer === 'create-parent') {
    return (
      <TeacherDrawer title="新建家长账号" closeHref={input.closeHref}>
        <form action={createParentForStudentAction} className="teacher-form-grid">
          <input name="studentUserId" type="hidden" value={input.studentId} />
          <label><span>家长用户名</span><input name="username" required placeholder="parent01" /></label>
          <label><span>显示名</span><input name="displayName" required placeholder="王同学家长" /></label>
          <label><span>临时密码</span><input name="password" minLength={8} required type="password" /></label>
          <label><span>手机号</span><input name="phoneNumber" inputMode="tel" placeholder="13800000000" /></label>
          <label><span>邮箱</span><input name="email" type="email" placeholder="parent@example.com" /></label>
          <label><span>备注</span><input name="note" placeholder="妈妈 / 爸爸 / 监护人" /></label>
          <button className="teacher-button" type="submit">创建并绑定家长</button>
        </form>
      </TeacherDrawer>
    )
  }
  if (input.drawer === 'bind-parent') {
    return (
      <TeacherDrawer title="绑定已有家长" closeHref={input.closeHref}>
        <form action={bindParentToStudentAction} className="teacher-form-grid">
          <input name="studentUserId" type="hidden" value={input.studentId} />
          <label><span>家长用户名或 ID</span><input name="parentIdentifier" required placeholder="parent01" /></label>
          <label><span>备注</span><input name="note" placeholder="关系说明" /></label>
          <button className="teacher-button" type="submit">绑定家长</button>
        </form>
      </TeacherDrawer>
    )
  }
  if (input.drawer === 'growth-report') {
    const defaultPeriod = getLocalDateRangeEndingToday(14)
    return (
      <TeacherDrawer title="生成成长报告" closeHref={input.closeHref}>
        <form action={generateStudentGrowthReportAction} className="teacher-form-grid">
          <input name="studentUserId" type="hidden" value={input.studentId} />
          {input.growthReportError ? <p className="teacher-inline-warning">{input.growthReportError}</p> : null}
          <label><span>开始日期</span><input name="periodStart" type="date" defaultValue={defaultPeriod.periodStart} /></label>
          <label><span>结束日期</span><input name="periodEnd" type="date" defaultValue={defaultPeriod.periodEnd} /></label>
          <p className="teacher-form-note">默认生成最近 14 天的家长学习报告，包含今天；生成完成后会回到家长报告列表并选中新报告。</p>
          <GrowthReportGenerateButton />
        </form>
      </TeacherDrawer>
    )
  }
  return null
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatGrowthReportStatus(status: string) {
  switch (status) {
    case 'pending':
      return '生成中'
    case 'generated':
      return '已生成'
    case 'failed':
      return '失败'
    case 'revoked':
      return '已撤销'
    default:
      return status
  }
}

function maskIdCardNumber(value?: string | null): string {
  const text = value?.trim() ?? ''
  if (!text) return '-'
  if (text.length <= 8) return text
  return `${text.slice(0, 3)}***********${text.slice(-4)}`
}

function normalizeTab(value: string | null): StudentDetailTab {
  if (
    value === 'progress' ||
    value === 'submissions' ||
    value === 'assessments' ||
    value === 'rewards' ||
    value === 'parents' ||
    value === 'behavior' ||
    value === 'settings'
  ) {
    return value
  }
  return 'overview'
}

function summarizeRecentErrors(submissions: Array<{ result: string | null }>) {
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
    totalPassed >= 5 ? '完全掌握' : totalPassed >= 4 ? '掌握良好' : requiredPassed >= 3 ? '主线完成' : '进行中'

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

function readParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}
