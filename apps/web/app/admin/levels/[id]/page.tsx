import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDifficultyCoefficient } from '@spcg/shared/difficulty'
import { StatementMarkdown } from '@/components/StatementMarkdown'
import { getAdminLevel } from '@/lib/admin-data'
import { getAdminSubmissionHistory } from '@/lib/services/submission-service'
import { AdminSubmissionTable } from '../../components/AdminSubmissionTable'
import { deleteLevelPermanently, setLevelStatus, updateLevelDetails } from '../actions'

type AdminLevelDetailPageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export default async function AdminLevelDetailPage({ params }: AdminLevelDetailPageProps) {
  const { id } = await params
  const [level, submissions] = await Promise.all([
    getAdminLevel(id),
    getAdminSubmissionHistory({ levelId: id, limit: 50 }),
  ])

  if (!level) notFound()

  const aiAnalysisStats = getAiAnalysisStats(submissions)

  return (
    <section className="admin-stack">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Level Detail</span>
          <h1>{level.title}</h1>
        </div>
        <Link className="admin-secondary-link" href={`/level/${level.id}`}>
          Open player view
        </Link>
      </header>

      <section className="admin-detail-grid">
        <article className="admin-panel">
          <h2>Metadata</h2>
          <dl className="admin-dl">
            <dt>ID</dt>
            <dd>{level.id}</dd>
            <dt>Chapter</dt>
            <dd>{level.chapterId}</dd>
            <dt>Order</dt>
            <dd>{level.order}</dd>
            <dt>Knowledge</dt>
            <dd>{level.knowledgePoint}</dd>
            <dt>Difficulty</dt>
            <dd>
              {level.difficulty.levelLabel} · {level.difficulty.stars}层 · 难度系数{' '}
              {getDifficultyCoefficient(level.difficulty)} · {level.difficulty.label}
            </dd>
            <dt>Status</dt>
            <dd>
              <em className={`admin-status admin-status-${level.status}`}>{level.status}</em>
            </dd>
            <dt>Sister</dt>
            <dd>{level.sisterProblem ? `${level.sisterProblem.title} (${level.sisterProblem.levelId})` : 'None'}</dd>
          </dl>
        </article>

        <article className="admin-panel">
          <h2>Operations</h2>
          <div className="admin-action-stack">
            <StatusButton levelId={level.id} status="published" label="Publish" disabled={level.status === 'published'} />
            <StatusButton levelId={level.id} status="review" label="Move to review" disabled={level.status === 'review'} />
            <StatusButton levelId={level.id} status="archived" label="Archive" disabled={level.status === 'archived'} />
          </div>
        </article>
      </section>

      <article className="admin-panel">
        <div className="admin-panel-head">
          <h2>题目编辑</h2>
          <span className="admin-count">保存前会走 PostgreSQL 结构约束</span>
        </div>
        <form action={updateLevelDetails} className="admin-form-grid admin-form-grid-level-edit">
          <input name="levelId" type="hidden" value={level.id} />
          <label>
            <span>Title</span>
            <input name="title" defaultValue={level.title} required />
          </label>
          <label>
            <span>Chapter ID</span>
            <input name="chapterId" defaultValue={level.chapterId} required />
          </label>
          <label>
            <span>Order</span>
            <input name="order" type="number" defaultValue={level.order} required />
          </label>
          <label>
            <span>Knowledge Point</span>
            <input name="knowledgePoint" defaultValue={level.knowledgePoint} required />
          </label>
          <label>
            <span>Status</span>
            <select name="status" defaultValue={level.status}>
              <option value="draft">draft</option>
              <option value="review">review</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <label>
            <span>SPCG Level</span>
            <input name="spcgLevel" type="number" min={1} max={10} defaultValue={level.difficulty.spcgLevel} required />
          </label>
          <label>
            <span>Layer</span>
            <input name="stars" type="number" min={1} max={5} defaultValue={level.difficulty.stars} required />
          </label>
          <label>
            <span>Layer Label</span>
            <select name="difficultyLabel" defaultValue={level.difficulty.label}>
              <option value="入门">入门</option>
              <option value="基础">基础</option>
              <option value="提高">提高</option>
              <option value="挑战">挑战</option>
              <option value="综合">综合</option>
            </select>
          </label>
          <label>
            <span>lglevel</span>
            <input name="lglevel" defaultValue={level.difficulty.lglevel ?? ''} />
          </label>
          <label>
            <span>Time Limit MS</span>
            <input name="timeLimitMs" type="number" min={100} defaultValue={level.timeLimitMs} required />
          </label>
          <label>
            <span>Memory MB</span>
            <input name="memoryLimitMb" type="number" min={16} defaultValue={level.memoryLimitMb} required />
          </label>
          <label className="admin-form-span-2">
            <span>Solution Video URL</span>
            <input name="solutionVideoUrl" defaultValue={level.solutionVideoUrl ?? ''} />
          </label>
          <label className="admin-form-span-2">
            <span>Input Format</span>
            <textarea name="inputFormat" defaultValue={level.inputFormat} rows={3} required />
          </label>
          <label className="admin-form-span-2">
            <span>Output Format</span>
            <textarea name="outputFormat" defaultValue={level.outputFormat} rows={3} required />
          </label>
          <label className="admin-form-full">
            <span>Statement Markdown</span>
            <textarea name="description" defaultValue={level.description} rows={12} required />
          </label>
          <label className="admin-form-full">
            <span>Statement Assets JSON</span>
            <textarea className="admin-json-textarea" name="statementAssetsJson" defaultValue={json(level.statementAssets)} rows={8} required />
          </label>
          <label className="admin-form-full">
            <span>Test Cases JSON</span>
            <textarea className="admin-json-textarea" name="testCasesJson" defaultValue={json(level.testCases)} rows={18} required />
          </label>
          <label className="admin-form-full">
            <span>Hints JSON</span>
            <textarea className="admin-json-textarea" name="hintsJson" defaultValue={json(level.hints)} rows={10} required />
          </label>
          <label className="admin-form-full">
            <span>Solution JSON</span>
            <textarea className="admin-json-textarea" name="solutionJson" defaultValue={json(level.solution)} rows={10} required />
          </label>
          <label className="admin-form-full">
            <span>Official Code</span>
            <textarea className="admin-code-textarea" name="officialCode" defaultValue={level.officialCode} rows={16} required />
          </label>
          <label className="admin-form-full">
            <span>Starter Code</span>
            <textarea className="admin-code-textarea" name="starterCode" defaultValue={level.starterCode} rows={12} required />
          </label>
          <label className="admin-form-full">
            <span>Source JSON</span>
            <textarea className="admin-json-textarea" name="sourceJson" defaultValue={json(level.source)} rows={8} required />
          </label>
          <label className="admin-form-full">
            <span>Sister Problem JSON</span>
            <textarea
              className="admin-json-textarea"
              name="sisterProblemJson"
              defaultValue={level.sisterProblem ? json(level.sisterProblem) : ''}
              rows={6}
            />
          </label>
          <label className="admin-form-full">
            <span>Import Meta JSON</span>
            <textarea className="admin-json-textarea" name="importMetaJson" defaultValue={json(level.importMeta)} rows={8} required />
          </label>
          <label className="admin-form-full">
            <span>Teacher Notes</span>
            <textarea name="teacherNotes" defaultValue={level.teacherNotes ?? ''} rows={5} />
          </label>
          <label>
            <span>Guardian ID</span>
            <input name="guardianId" defaultValue={level.guardianId ?? ''} />
          </label>
          <label>
            <span>Pass Out Problem ID</span>
            <input name="passOutProblemId" defaultValue={level.passOutProblemId ?? ''} />
          </label>
          <label className="admin-form-full">
            <span>Story</span>
            <textarea name="story" defaultValue={level.story ?? ''} rows={5} />
          </label>
          <button className="admin-button" type="submit">
            Save Level
          </button>
        </form>
      </article>

      <article className="admin-panel">
        <h2>Statement Preview</h2>
        <div className="admin-statement-preview">
          <StatementMarkdown markdown={level.description} assets={level.statementAssets} />
        </div>
      </article>

      <section className="admin-grid-3">
        <AdminFact label="Statement Assets" value={level.statementAssets.length} />
        <AdminFact label="Public Cases" value={level.publicCases} />
        <AdminFact label="Hidden Cases" value={level.hiddenCases} />
        <AdminFact label="Hints" value={level.hintsCount} />
        <AdminFact label="Video" value={level.solutionVideoUrl ? 'Ready' : 'Missing'} />
        <AdminFact label="Published At" value={level.publishedAt ? new Date(level.publishedAt).toLocaleString() : 'Not published'} />
      </section>

      <section className="admin-stack">
        <header className="admin-page-head">
          <div>
            <span className="admin-eyebrow">Student Work</span>
            <h1>Recent Submissions & AI Analysis</h1>
          </div>
          <span className="admin-count">
            {submissions.length} shown · {aiAnalysisStats.pending} need AI analysis · {aiAnalysisStats.done} analyzed
          </span>
        </header>
        <article className="admin-panel">
          <div className="admin-panel-head">
            <h2>AI Analysis</h2>
            <span className="admin-count">WA / CE / RE / TLE / Judge Error</span>
          </div>
          <p className="admin-help-text">
            非 AC 提交可以在下方表格点击 AI 分析生成一次错误分析；已生成的记录会显示为已分析并保存到数据库。
          </p>
        </article>
        <AdminSubmissionTable submissions={submissions} emptyText="This level has no submissions yet." />
      </section>

      <article className="admin-panel admin-danger-panel">
        <h2>永久删除</h2>
        <p className="admin-help-text">
          默认请使用 Archive。只有没有提交、进度、关卡关联和导入引用的题目才允许永久删除。
        </p>
        <form action={deleteLevelPermanently} className="admin-form-grid">
          <input name="levelId" type="hidden" value={level.id} />
          <label className="admin-form-span-2">
            <span>输入题目 ID 确认删除</span>
            <input name="confirmation" placeholder={level.id} />
          </label>
          <button className="admin-button admin-danger-button" type="submit">
            Delete Permanently
          </button>
        </form>
      </article>
    </section>
  )
}

function getAiAnalysisStats(
  submissions: Array<{
    verdict: { result: string } | null
    errorAnalysis: unknown
  }>,
) {
  const analyzableResults = new Set(['WA', 'TLE', 'RE', 'CE', 'Judge Error'])
  const analyzable = submissions.filter((submission) => {
    const result = submission.verdict?.result
    return Boolean(result && analyzableResults.has(result))
  })

  return {
    done: analyzable.filter((submission) => Boolean(submission.errorAnalysis)).length,
    pending: analyzable.filter((submission) => !submission.errorAnalysis).length,
  }
}

function StatusButton({
  levelId,
  status,
  label,
  disabled,
}: {
  levelId: string
  status: string
  label: string
  disabled: boolean
}) {
  return (
    <form action={setLevelStatus}>
      <input name="levelId" type="hidden" value={levelId} />
      <input name="status" type="hidden" value={status} />
      <button className="admin-button" type="submit" disabled={disabled}>
        {label}
      </button>
    </form>
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

function json(value: unknown) {
  return JSON.stringify(value, null, 2)
}
