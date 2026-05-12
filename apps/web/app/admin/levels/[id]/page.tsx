import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDifficultyCoefficient } from '@spcg/shared/difficulty'
import { StatementMarkdown } from '@/components/StatementMarkdown'
import { getAdminLevel } from '@/lib/admin-data'
import { getAdminSubmissionHistory } from '@/lib/services/submission-service'
import { AdminDrawer, AdminPageHeader, AdminTabs } from '../../components/AdminChrome'
import { AdminSubmissionTable } from '../../components/AdminSubmissionTable'
import { deleteLevelPermanently, setLevelStatus, updateLevelDetails } from '../actions'

type AdminLevelDetailPageProps = {
  params: Promise<{ id: string }> | { id: string }
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

const VALID_TABS = new Set(['overview', 'statement', 'submissions', 'settings'])

export default async function AdminLevelDetailPage({ params, searchParams }: AdminLevelDetailPageProps) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const tab = normalizeTab(readStringParam(resolvedSearchParams?.tab))
  const drawer = readStringParam(resolvedSearchParams?.drawer)
  const selectedSubmissionId = readStringParam(resolvedSearchParams?.submissionId) ?? null
  const [level, submissions] = await Promise.all([
    getAdminLevel(id),
    getAdminSubmissionHistory({ levelId: id, limit: 50 }),
  ])

  if (!level) notFound()

  const aiAnalysisStats = getAiAnalysisStats(submissions)
  const knowledgeSnapshots = level.importMeta.knowledgePointSnapshots ?? []

  return (
    <section className="admin-stack">
      <AdminPageHeader
        actions={
          <>
            <Link className="admin-secondary-link" href="/admin/levels">
              Back
            </Link>
            <Link className="admin-secondary-link" href={`/level/${level.id}`}>
              Player view
            </Link>
            <Link className="admin-button" href={buildHref(`/admin/levels/${level.id}`, resolvedSearchParams, { drawer: 'edit' })}>
              Edit level
            </Link>
          </>
        }
        description={`${level.chapterId} · order ${level.order} · ${level.knowledgePoint}`}
        eyebrow="Level Detail"
        meta={<em className={`admin-status admin-status-${level.status}`}>{level.status}</em>}
        title={level.title}
      />

      <AdminTabs
        items={[
          { href: buildHref(`/admin/levels/${level.id}`, resolvedSearchParams, { tab: 'overview', drawer: null }), label: 'Overview', active: tab === 'overview' },
          { href: buildHref(`/admin/levels/${level.id}`, resolvedSearchParams, { tab: 'statement', drawer: null }), label: 'Statement', active: tab === 'statement' },
          {
            href: buildHref(`/admin/levels/${level.id}`, resolvedSearchParams, { tab: 'submissions', drawer: null }),
            label: 'Submissions',
            active: tab === 'submissions',
            count: submissions.length,
          },
          { href: buildHref(`/admin/levels/${level.id}`, resolvedSearchParams, { tab: 'settings', drawer: null }), label: 'Settings', active: tab === 'settings' },
        ]}
      />

      {tab === 'overview' ? (
        <>
          <section className="admin-detail-grid">
            <article className="admin-panel">
              <div className="admin-panel-head">
                <h2>Metadata</h2>
                <Link className="admin-small-button" href={buildHref(`/admin/levels/${level.id}`, resolvedSearchParams, { drawer: 'edit' })}>
                  Edit
                </Link>
              </div>
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
              <h2>Knowledge Tags</h2>
              <span className="admin-count">{knowledgeSnapshots.length} standard tag(s)</span>
            </div>
            {knowledgeSnapshots.length > 0 ? (
              <dl className="admin-dl">
                {knowledgeSnapshots.map((tag) => (
                  <div key={`${tag.classification}:${tag.tagId}`}>
                    <dt>{tag.zhName}</dt>
                    <dd>
                      {tag.tagId} · {tag.enName} · {tag.classification} · {tag.domain} · {tag.bandOrLevel} · {tag.role}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="admin-help-text">No standard knowledge tags have been imported for this level.</p>
            )}
          </article>

          <section className="admin-grid-3">
            <AdminFact label="Statement Assets" value={level.statementAssets.length} />
            <AdminFact label="Algorithm Graphs" value={level.algorithmGraphs.length} />
            <AdminFact label="Public Cases" value={level.publicCases} />
            <AdminFact label="Hidden Cases" value={level.hiddenCases} />
            <AdminFact label="Hints" value={level.hintsCount} />
            <AdminFact label="Video" value={level.solutionVideoUrl ? 'Ready' : 'Missing'} />
            <AdminFact label="Published At" value={level.publishedAt ? new Date(level.publishedAt).toLocaleString() : 'Not published'} />
          </section>
        </>
      ) : null}

      {tab === 'statement' ? (
        <article className="admin-panel">
          <div className="admin-panel-head">
            <h2>Statement Preview</h2>
            <Link className="admin-small-button" href={buildHref(`/admin/levels/${level.id}`, resolvedSearchParams, { drawer: 'edit' })}>
              Edit markdown
            </Link>
          </div>
          <div className="admin-statement-preview">
            <StatementMarkdown markdown={level.description} assets={level.statementAssets} />
          </div>
        </article>
      ) : null}

      {tab === 'submissions' ? (
        <section className="admin-stack">
          <article className="admin-panel">
            <div className="admin-panel-head">
              <h2>AI Analysis</h2>
              <span className="admin-count">
                {submissions.length} shown · {aiAnalysisStats.pending} need AI analysis · {aiAnalysisStats.done} analyzed
              </span>
            </div>
            <p className="admin-help-text">
              非 AC 提交可以点击 AI 分析；源码和分析结果在右侧 Drawer 查看，不挤占列表区域。
            </p>
          </article>
          <AdminSubmissionTable
            submissions={submissions}
            selectedSubmissionId={selectedSubmissionId}
            emptyText="This level has no submissions yet."
          />
        </section>
      ) : null}

      {tab === 'settings' ? (
        <section className="admin-detail-grid">
          <article className="admin-panel">
            <div className="admin-panel-head">
              <div>
                <h2>Status Operations</h2>
                <p className="admin-help-text">发布、审核和归档不需要打开编辑表单。</p>
              </div>
            </div>
            <div className="admin-action-stack">
              <StatusButton levelId={level.id} status="published" label="Publish" disabled={level.status === 'published'} />
              <StatusButton levelId={level.id} status="review" label="Move to review" disabled={level.status === 'review'} />
              <StatusButton levelId={level.id} status="archived" label="Archive" disabled={level.status === 'archived'} />
            </div>
          </article>

          <article className="admin-panel admin-danger-panel">
            <div className="admin-panel-head">
              <div>
                <h2>永久删除</h2>
                <p className="admin-help-text">默认请 Archive；永久删除放在确认 Drawer 中。</p>
              </div>
              <Link className="admin-button admin-danger-button" href={buildHref(`/admin/levels/${level.id}`, resolvedSearchParams, { drawer: 'delete' })}>
                Delete
              </Link>
            </div>
          </article>
        </section>
      ) : null}

      {drawer === 'edit' ? (
        <AdminDrawer closeHref={buildHref(`/admin/levels/${level.id}`, resolvedSearchParams, { drawer: null })} title="Edit level" width="xl">
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
              <span>Algorithm Graphs JSON</span>
              <textarea className="admin-json-textarea" name="algorithmGraphsJson" defaultValue={json(level.algorithmGraphs)} rows={8} required />
            </label>
            <label className="admin-form-full">
              <span>Localized Content JSON</span>
              <textarea className="admin-json-textarea" name="localizedContentJson" defaultValue={json(level.localizedContent)} rows={10} required />
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
        </AdminDrawer>
      ) : null}

      {drawer === 'delete' ? (
        <AdminDrawer
          closeHref={buildHref(`/admin/levels/${level.id}`, resolvedSearchParams, { drawer: null })}
          description="只有没有提交、进度、关卡关联和导入引用的题目才允许永久删除。"
          title="Delete level permanently"
          width="md"
        >
          <form action={deleteLevelPermanently} className="admin-form-grid">
            <input name="levelId" type="hidden" value={level.id} />
            <label className="admin-form-wide">
              <span>输入题目 ID 确认删除</span>
              <input name="confirmation" placeholder={level.id} />
            </label>
            <button className="admin-button admin-danger-button" type="submit">
              Delete Permanently
            </button>
          </form>
        </AdminDrawer>
      ) : null}
    </section>
  )
}

function getAiAnalysisStats(
  submissions: Array<{
    verdict: { result: string } | null
    errorAnalysis: unknown
  }>,
) {
  const analyzableResults = new Set(['WA', 'TLE', 'MLE', 'RE', 'CE', 'PE', 'Judge Error'])
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

function normalizeTab(value: string | undefined) {
  if (value && VALID_TABS.has(value)) return value
  return 'overview'
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function buildHref(
  path: string,
  searchParams: Record<string, string | string[] | undefined> | undefined,
  updates: Record<string, string | null>,
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    const raw = readStringParam(value)
    if (raw) params.set(key, raw)
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  }
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2)
}
