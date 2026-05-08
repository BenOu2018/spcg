'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { CodeErrorAnalysis, SubmissionErrorAnalysis, Verdict } from '@spcg/shared/types'
import type { AdminSubmissionHistoryItem } from '@/lib/services/submission-service'
import { explainAdminSubmissionErrorAction } from '../submissions/actions'

type AnalysisState =
  | { status: 'idle'; analysis?: CodeErrorAnalysis; error?: string; cached?: boolean }
  | { status: 'loading'; analysis?: CodeErrorAnalysis; error?: string; cached?: boolean }
  | { status: 'done'; analysis: CodeErrorAnalysis; error?: string; cached?: boolean }
  | { status: 'error'; analysis?: CodeErrorAnalysis; error: string; cached?: boolean }

type AdminSubmissionTableProps = {
  submissions: AdminSubmissionHistoryItem[]
  emptyText?: string
}

const ANALYZABLE_RESULTS = new Set<Verdict['result']>(['WA', 'TLE', 'MLE', 'RE', 'CE', 'PE', 'Judge Error'])

export function AdminSubmissionTable({ submissions, emptyText = 'No submissions yet.' }: AdminSubmissionTableProps) {
  const [selectedId, setSelectedId] = useState<string | null>(submissions[0]?.id ?? null)
  const [analysisBySubmissionId, setAnalysisBySubmissionId] = useState<Record<string, AnalysisState>>({})
  const selected = useMemo(
    () => submissions.find((submission) => submission.id === selectedId) ?? null,
    [selectedId, submissions],
  )
  const selectedAnalysisState = selected ? analysisBySubmissionId[selected.id] : undefined
  const selectedCanAnalyze = selected ? canAnalyzeSubmission(selected) : false
  const selectedAlreadyAnalyzed = selected ? hasAnalysis(selected, selectedAnalysisState) : false

  async function explainSubmission(submission: AdminSubmissionHistoryItem) {
    setSelectedId(submission.id)

    if (submission.errorAnalysis && analysisBySubmissionId[submission.id]?.status !== 'error') {
      setAnalysisBySubmissionId((current) => ({
        ...current,
        [submission.id]: {
          status: 'done',
          analysis: submission.errorAnalysis!.analysis,
          cached: true,
        },
      }))
      return
    }

    setAnalysisBySubmissionId((current) => ({
      ...current,
      [submission.id]: { status: 'loading', analysis: current[submission.id]?.analysis },
    }))

    try {
      const result = await explainAdminSubmissionErrorAction({ submissionId: submission.id })
      if (result.ok) {
        setAnalysisBySubmissionId((current) => ({
          ...current,
          [submission.id]: { status: 'done', analysis: result.analysis, cached: result.cached },
        }))
        return
      }

      setAnalysisBySubmissionId((current) => ({
        ...current,
        [submission.id]: { status: 'error', error: result.error, analysis: current[submission.id]?.analysis },
      }))
    } catch (error) {
      setAnalysisBySubmissionId((current) => ({
        ...current,
        [submission.id]: {
          status: 'error',
          error: error instanceof Error ? error.message : 'AI 分析失败。',
          analysis: current[submission.id]?.analysis,
        },
      }))
    }
  }

  return (
    <>
      <section className="admin-table">
        <div className="admin-table-head admin-submission-grid">
          <span>Submission</span>
          <span>Student</span>
          <span>Level</span>
          <span>Status</span>
          <span>Result</span>
          <span>Created</span>
          <span>Actions</span>
        </div>
        {submissions.map((submission) => {
          const analysisState = analysisBySubmissionId[submission.id]
          const alreadyAnalyzed = hasAnalysis(submission, analysisState)
          const selected = selectedId === submission.id
          return (
            <article
              className={selected ? 'admin-table-row admin-submission-grid active' : 'admin-table-row admin-submission-grid'}
              key={submission.id}
              tabIndex={0}
              onClick={() => setSelectedId(submission.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedId(submission.id)
                }
              }}
            >
              <span>
                {shortSubmissionId(submission.id)}
                <small>{formatLanguage(submission)}</small>
              </span>
              <span>
                <Link className="admin-title-link" href={`/admin/users/${submission.userId}`}>
                  {submission.userDisplayName ?? submission.userEmail ?? submission.userId}
                </Link>
                <small>{submission.userEmail ?? submission.userId}</small>
              </span>
              <span>
                <Link className="admin-title-link" href={`/admin/levels/${submission.levelId}`}>
                  {submission.levelTitle}
                </Link>
                <small>
                  {submission.chapterId || 'level'} / {submission.levelId}
                </small>
              </span>
              <span>{submission.status}</span>
              <span>
                <em className={`admin-status ${resultStatusClass(submission)}`}>{formatResult(submission)}</em>
              </span>
              <span>{new Date(submission.createdAt).toLocaleString()}</span>
              <span className="admin-submission-actions">
                <button
                  className="admin-small-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelectedId(submission.id)
                  }}
                >
                  查看代码
                </button>
                {canAnalyzeSubmission(submission) && alreadyAnalyzed ? (
                  <button className="admin-small-button" type="button" disabled>
                    已分析
                  </button>
                ) : null}
                {canAnalyzeSubmission(submission) && !alreadyAnalyzed ? (
                  <button
                    className="admin-small-button"
                    type="button"
                    disabled={analysisState?.status === 'loading'}
                    onClick={(event) => {
                      event.stopPropagation()
                      explainSubmission(submission)
                    }}
                  >
                    {analysisState?.status === 'loading' ? '分析中' : 'AI 分析'}
                  </button>
                ) : null}
              </span>
            </article>
          )
        })}
        {submissions.length === 0 ? <p className="admin-empty">{emptyText}</p> : null}
      </section>

      {selected ? (
        <article className="admin-panel admin-submission-detail">
          <div className="admin-panel-head">
            <h2>Submission Code</h2>
            <div className="admin-submission-detail-actions">
              <span className="admin-count">
                {formatResult(selected)} · {shortSubmissionId(selected.id)}
              </span>
              {selectedCanAnalyze && selectedAlreadyAnalyzed ? (
                <button className="admin-small-button" type="button" disabled>
                  已分析
                </button>
              ) : null}
              {selectedCanAnalyze && !selectedAlreadyAnalyzed ? (
                <button
                  className="admin-small-button"
                  type="button"
                  disabled={selectedAnalysisState?.status === 'loading'}
                  onClick={() => explainSubmission(selected)}
                >
                  {selectedAnalysisState?.status === 'loading' ? '分析中' : 'AI 分析'}
                </button>
              ) : null}
            </div>
          </div>
          <dl className="admin-dl">
            <dt>Student</dt>
            <dd>{selected.userDisplayName ?? selected.userEmail ?? selected.userId}</dd>
            <dt>Level</dt>
            <dd>
              {selected.levelTitle} ({selected.levelId})
            </dd>
            <dt>Language</dt>
            <dd>{formatLanguage(selected)}</dd>
            <dt>Cases</dt>
            <dd>{formatCases(selected.verdict)}</dd>
          </dl>
          <pre className="admin-submission-code">{selected.code}</pre>
          <AdminSubmissionAnalysisPanel
            state={selectedAnalysisState}
            fallback={selected.errorAnalysis}
            onRetry={() => explainSubmission(selected)}
          />
        </article>
      ) : null}
    </>
  )
}

function AdminSubmissionAnalysisPanel({
  state,
  fallback,
  onRetry,
}: {
  state?: AnalysisState
  fallback?: SubmissionErrorAnalysis | null
  onRetry: () => void
}) {
  const analysis = state?.analysis ?? fallback?.analysis
  const cached = state?.cached ?? Boolean(fallback)

  if (state?.status === 'loading') {
    return (
      <section className="ai-analysis-panel loading">
        <div className="ai-analysis-panel-head">
          <strong>AI 错误分析</strong>
          <span>生成中...</span>
        </div>
        <p>正在结合提交代码和判题结果分析错误原因。</p>
      </section>
    )
  }

  if (state?.status === 'error') {
    return (
      <section className="ai-analysis-panel error">
        <div className="ai-analysis-panel-head">
          <strong>AI 错误分析</strong>
          <button type="button" onClick={onRetry}>
            重试
          </button>
        </div>
        <p>{state.error}</p>
      </section>
    )
  }

  if (!analysis) return null

  return (
    <section className="ai-analysis-panel">
      <div className="ai-analysis-panel-head">
        <strong>AI 错误分析</strong>
        <span>{cached ? '已保存' : '新生成'}</span>
      </div>
      <p>{analysis.summary}</p>
      <dl>
        <div>
          <dt>错在哪里</dt>
          <dd>{analysis.whereWrong ?? analysis.summary}</dd>
        </div>
        <div>
          <dt>原因分析</dt>
          <dd>
            <ul>
              {readReasonList(analysis).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </dd>
        </div>
        {analysis.lineHints.length > 0 ? (
          <div>
            <dt>定位提示</dt>
            <dd>
              <ul>
                {analysis.lineHints.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        {analysis.nextSteps.length > 0 ? (
          <div>
            <dt>下一步</dt>
            <dd>
              <ul>
                {analysis.nextSteps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>知识点</dt>
          <dd>{analysis.fixedConcept}</dd>
        </div>
      </dl>
    </section>
  )
}

function readReasonList(analysis: CodeErrorAnalysis): string[] {
  return analysis.reasonList && analysis.reasonList.length > 0 ? analysis.reasonList : [analysis.likelyCause]
}

function canAnalyzeSubmission(submission: AdminSubmissionHistoryItem): boolean {
  return Boolean(submission.verdict?.result && ANALYZABLE_RESULTS.has(submission.verdict.result))
}

function hasAnalysis(submission: AdminSubmissionHistoryItem, state?: AnalysisState): boolean {
  return Boolean(submission.errorAnalysis || state?.status === 'done')
}

function formatResult(submission: AdminSubmissionHistoryItem): string {
  return submission.verdict?.result ?? submission.status
}

function resultStatusClass(submission: AdminSubmissionHistoryItem): string {
  const result = submission.verdict?.result
  if (result) return `admin-verdict-${statusClassName(result)}`
  if (submission.status === 'pending' || submission.status === 'judging') return 'admin-status-review'
  return 'admin-status-draft'
}

function statusClassName(status: string): string {
  return status.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function formatCases(verdict: Verdict | null): string {
  if (!verdict) return '-'
  return `${verdict.passedCases}/${verdict.totalCases}`
}

function formatLanguage(submission: AdminSubmissionHistoryItem): string {
  return submission.resolvedLanguage ? `${submission.language} -> ${submission.resolvedLanguage}` : submission.language
}

function shortSubmissionId(id: string): string {
  return id.slice(0, 8)
}
