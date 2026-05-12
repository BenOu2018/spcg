import Link from 'next/link'
import {
  getLaunchReadinessReport,
  type LaunchReadinessIssue,
  type LaunchReadinessRoleStatus,
  type LaunchReadinessStageReport,
} from '@/lib/services/launch-readiness-service'

export const dynamic = 'force-dynamic'

export default async function AdminLaunchReadinessPage() {
  const report = await getLaunchReadinessReport()
  const blockingStages = report.stages.filter((stage) => stage.status === 'blocking')

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Launch Readiness</span>
          <h1>1-3级 A 线完整度验收</h1>
        </div>
        <Link className="admin-secondary-link" href="/admin/curriculum">
          Curriculum
        </Link>
      </header>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>验收规则</h2>
            <p className="admin-muted">
              只读报表，不修改题库。检查 1-3级 A 线每关是否有 5 个 v0.2 题位、前 3 题是否必做、题面/测试点/提示/题解/代码是否完整。启蒙题豁免：1级第1关不强制第4-5题，1级第1-2关不强制 20 个测试点。
            </p>
          </div>
          <small>{formatDateTime(report.generatedAt)}</small>
        </div>
      </section>

      <section className="admin-metrics">
        <AdminMetric label="可上线关卡" value={`${report.readyStages}/${report.expectedStages}`} />
        <AdminMetric label="阻塞关卡" value={report.blockingStages} />
        <AdminMetric label="警告关卡" value={report.warningStages} />
        <AdminMetric label="阻塞项" value={report.blockingIssues} />
        <AdminMetric label="警告项" value={report.warningIssues} />
        <AdminMetric label="已检查题目" value={report.checkedProblems} />
        <AdminMetric label="完整题目" value={report.readyProblems} />
        <AdminMetric label="地图外题单" value={report.outOfPlanLessonSetCount} />
      </section>

      {blockingStages.length > 0 ? (
        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>上线阻塞清单</h2>
            <small>{blockingStages.length} stages</small>
          </div>
          <div className="admin-readiness-blockers">
            {blockingStages.slice(0, 30).map((stage) => (
              <article className="admin-readiness-blocker" key={`${stage.spcgLevel}:${stage.stageNo}`}>
                <strong>
                  {stage.spcgLevel}级第{stage.stageNo}关 · {stage.problemSetTitle ?? stage.expectedTitle}
                </strong>
                <IssueList issues={collectBlockingIssues(stage)} limit={4} />
              </article>
            ))}
            {blockingStages.length > 30 ? <p className="admin-empty">还有 {blockingStages.length - 30} 个阻塞关卡，请在下方表格查看。</p> : null}
          </div>
        </section>
      ) : (
        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>没有阻塞项</h2>
            <small>仍建议人工抽查题意和官方代码真实 AC。</small>
          </div>
        </section>
      )}

      <section className="admin-table">
        <div className="admin-table-head admin-readiness-grid">
          <span>关卡</span>
          <span>题单</span>
          <span>状态</span>
          <span>五题位</span>
          <span>问题</span>
        </div>
        {report.stages.map((stage) => (
          <article className="admin-table-row admin-readiness-grid" key={`${stage.spcgLevel}:${stage.stageNo}`}>
            <div>
              <strong>
                {stage.spcgLevel}级第{stage.stageNo}关
              </strong>
              <small>{stage.expectedTitle}</small>
              <small>{stage.expectedKnowledgePoint}</small>
            </div>
            <div>
              {stage.problemSetId ? (
                <Link className="admin-title-link" href={`/admin/problem-sets/${stage.problemSetId}`}>
                  {stage.problemSetTitle}
                </Link>
              ) : (
                <span className="admin-muted">缺少 A 线题单</span>
              )}
              <small>{stage.problemSetId ?? '-'}</small>
              <small>{stage.lessonFocus ?? '未填写算法内容'}</small>
            </div>
            <div className="admin-status-stack">
              <StatusBadge status={stage.status} />
              <small>
                {stage.blockingIssueCount} blocking / {stage.warningIssueCount} warning
              </small>
            </div>
            <div className="admin-readiness-roles">
              {stage.roles.map((role) => (
                <RolePill key={role.role} role={role} />
              ))}
              {stage.extraItems.length > 0 ? (
                <span className="admin-readiness-pill admin-readiness-pill-warning">
                  额外 {stage.extraItems.length}
                </span>
              ) : null}
            </div>
            <IssueList issues={collectStageIssues(stage)} limit={5} />
          </article>
        ))}
      </section>

      {report.outOfPlanLessonSets.length > 0 ? (
        <section className="admin-table">
          <div className="admin-panel-head">
            <div>
              <h2>地图外 A 线题单</h2>
              <p className="admin-muted">这些题单存在于数据库中，但不在当前 1-3级地图主线关卡配置内。考试/综合题单可保留，其他题单需人工确认。</p>
            </div>
            <small>{report.outOfPlanLessonSets.length} sets</small>
          </div>
          <div className="admin-table-head admin-readiness-extra-grid">
            <span>题单</span>
            <span>题量</span>
            <span>状态</span>
            <span>说明</span>
          </div>
          {report.outOfPlanLessonSets.map((set) => (
            <article className="admin-table-row admin-readiness-extra-grid" key={set.problemSetId}>
              <div>
                <strong>
                  {set.spcgLevel}级第{set.stageNo}关
                </strong>
                <Link className="admin-title-link" href={`/admin/problem-sets/${set.problemSetId}`}>
                  {set.problemSetTitle}
                </Link>
                <small>{set.problemSetId}</small>
              </div>
              <div>
                <strong>{set.itemCount}</strong>
                <small>
                  v0.2题位 {set.v02RoleCount} / exam-only {set.examOnlyCount}
                </small>
              </div>
              <div className="admin-status-stack">
                <em className={set.status === 'published' ? 'admin-status admin-status-published' : 'admin-status admin-status-review'}>{set.status}</em>
                <small>{set.visibility}</small>
              </div>
              <p className="admin-muted">{set.note}</p>
            </article>
          ))}
        </section>
      ) : null}
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

function StatusBadge({ status }: { status: LaunchReadinessStageReport['status'] }) {
  const label = status === 'ready' ? 'ready' : status === 'warning' ? 'warning' : 'blocked'
  const className =
    status === 'ready'
      ? 'admin-status admin-status-published'
      : status === 'warning'
        ? 'admin-status admin-status-review'
        : 'admin-status admin-status-rejected'

  return <em className={className}>{label}</em>
}

function RolePill({ role }: { role: LaunchReadinessRoleStatus }) {
  const className =
    role.status === 'ready'
      ? 'admin-readiness-pill admin-readiness-pill-ready'
      : role.status === 'waived'
        ? 'admin-readiness-pill admin-readiness-pill-waived'
        : role.status === 'warning'
        ? 'admin-readiness-pill admin-readiness-pill-warning'
        : 'admin-readiness-pill admin-readiness-pill-blocking'

  return (
    <span className={className} title={role.title ?? role.label}>
      <strong>{role.label}</strong>
      <small>{role.status === 'waived' ? '豁免' : role.levelId ?? '缺失'}</small>
    </span>
  )
}

function IssueList({ issues, limit }: { issues: LaunchReadinessIssue[]; limit: number }) {
  if (issues.length === 0) return <p className="admin-readiness-ok">OK</p>

  const visible = issues.slice(0, limit)
  return (
    <ul className="admin-readiness-issues">
      {visible.map((issue, index) => (
        <li className={`admin-readiness-issue-${issue.severity}`} key={`${issue.code}:${index}`}>
          {issue.message}
        </li>
      ))}
      {issues.length > limit ? <li>还有 {issues.length - limit} 项问题。</li> : null}
    </ul>
  )
}

function collectStageIssues(stage: LaunchReadinessStageReport): LaunchReadinessIssue[] {
  return stage.issues.concat(stage.roles.flatMap((role) => role.issues))
}

function collectBlockingIssues(stage: LaunchReadinessStageReport): LaunchReadinessIssue[] {
  return collectStageIssues(stage).filter((issue) => issue.severity === 'blocking')
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(new Date(value))
}
