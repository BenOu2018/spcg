'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CodeErrorAnalysis, SubmissionErrorAnalysis, Verdict } from '@spcg/shared/types'
import type { TeacherSubmissionHistoryItem } from '@/lib/services/teacher-service'
import { explainTeacherSubmissionErrorAction } from '../actions'

type AnalysisState =
  | { status: 'idle'; analysis?: CodeErrorAnalysis; error?: string; cached?: boolean }
  | { status: 'loading'; analysis?: CodeErrorAnalysis; error?: string; cached?: boolean }
  | { status: 'done'; analysis: CodeErrorAnalysis; error?: string; cached?: boolean }
  | { status: 'error'; analysis?: CodeErrorAnalysis; error: string; cached?: boolean }

type TeacherSubmissionTableProps = {
  submissions: TeacherSubmissionHistoryItem[]
  emptyText?: string
  selectedSubmissionId?: string | null
  baseHref?: string
  closeHref?: string
}

const ANALYZABLE_RESULTS = new Set<Verdict['result']>(['WA', 'TLE', 'MLE', 'RE', 'CE', 'PE', 'Judge Error'])
const NON_STRUCTURED_FALLBACK_SUMMARY = 'AI 返回了非结构化分析。'

export function TeacherSubmissionTable({
  submissions,
  emptyText = 'No submissions yet.',
  selectedSubmissionId = null,
  baseHref = '/teacher/submissions',
  closeHref = '/teacher/submissions',
}: TeacherSubmissionTableProps) {
  const [selectedId, setSelectedId] = useState<string | null>(selectedSubmissionId)
  const [analysisBySubmissionId, setAnalysisBySubmissionId] = useState<Record<string, AnalysisState>>({})
  useEffect(() => {
    setSelectedId(selectedSubmissionId)
  }, [selectedSubmissionId])

  const selected = useMemo(
    () => submissions.find((submission) => submission.id === selectedId) ?? null,
    [selectedId, submissions],
  )
  const selectedAnalysisState = selected ? analysisBySubmissionId[selected.id] : undefined
  const selectedCanAnalyze = selected ? canAnalyzeSubmission(selected) : false
  const selectedAlreadyAnalyzed = selected ? hasAnalysis(selected, selectedAnalysisState) : false

  function openSubmission(submission: TeacherSubmissionHistoryItem) {
    setSelectedId(submission.id)
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', buildSubmissionHref(baseHref, submission.id))
    }
  }

  function closeSubmission() {
    setSelectedId(null)
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', closeHref)
    }
  }

  async function explainSubmission(submission: TeacherSubmissionHistoryItem) {
    setSelectedId(submission.id)

    if (isStructuredSavedAnalysis(submission) && analysisBySubmissionId[submission.id]?.status !== 'error') {
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
      const result = await explainTeacherSubmissionErrorAction({ submissionId: submission.id })
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
    <section className="teacher-submission-browser">
      <div className="admin-table teacher-submission-list">
        <div className="admin-table-head teacher-submission-browser-grid">
          <span>提交时间</span>
          <span>学生</span>
          <span>题目</span>
          <span>级别</span>
          <span>状态</span>
          <span>结果</span>
          <span>AI</span>
        </div>
        {submissions.map((submission) => {
          const selected = selectedId === submission.id
          const analysisState = analysisBySubmissionId[submission.id]
          const alreadyAnalyzed = hasAnalysis(submission, analysisState)
          return (
            <article
              className={
                selected
                  ? 'admin-table-row teacher-submission-browser-grid active'
                  : 'admin-table-row teacher-submission-browser-grid'
              }
              key={submission.id}
              tabIndex={0}
              onClick={() => openSubmission(submission)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openSubmission(submission)
                }
              }}
            >
              <span>
                {new Date(submission.createdAt).toLocaleString()}
                <small>{shortSubmissionId(submission.id)}</small>
              </span>
              <span>{submission.userDisplayName ?? submission.userEmail ?? submission.userId}</span>
              <span>
                {submission.levelTitle}
                <small>{submission.levelId}</small>
              </span>
              <span>Lv.{submission.spcgLevel || '-'}</span>
              <span>{submission.status}</span>
              <span>
                <em className={`admin-status ${resultStatusClass(submission)}`}>{formatResult(submission)}</em>
                <small>{formatCases(submission.verdict)}</small>
              </span>
              <span className="admin-submission-actions">
                {canAnalyzeSubmission(submission) && alreadyAnalyzed ? <span className="admin-count">已分析</span> : null}
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
      </div>

      {selected ? (
        <aside className="teacher-drawer-backdrop" aria-label="提交源码">
          <button
            className="teacher-drawer-scrim"
            type="button"
            aria-label="Close submission detail"
            onClick={closeSubmission}
          />
          <section className="teacher-drawer teacher-submission-drawer">
            <header>
              <div>
                <h2>提交源码</h2>
                <p>
                  {formatResult(selected)} · {shortSubmissionId(selected.id)}
                </p>
              </div>
              <div className="teacher-submission-drawer-actions">
                {selectedCanAnalyze && selectedAlreadyAnalyzed ? (
                  <button className="teacher-small-button subtle" type="button" disabled>
                    已分析
                  </button>
                ) : null}
                {selectedCanAnalyze && !selectedAlreadyAnalyzed ? (
                  <button
                    className="teacher-small-button"
                    type="button"
                    disabled={selectedAnalysisState?.status === 'loading'}
                    onClick={() => explainSubmission(selected)}
                  >
                    {selectedAnalysisState?.status === 'loading' ? '分析中' : 'AI 分析'}
                  </button>
                ) : null}
                <button className="teacher-small-button subtle" type="button" onClick={closeSubmission}>
                  关闭
                </button>
              </div>
            </header>
            <dl className="teacher-submission-meta">
              <div>
                <dt>学生</dt>
                <dd>{selected.userDisplayName ?? selected.userEmail ?? selected.userId}</dd>
              </div>
              <div>
                <dt>题目</dt>
                <dd>
                  {selected.levelTitle} ({selected.levelId})
                </dd>
              </div>
              <div>
                <dt>语言</dt>
                <dd>{formatLanguage(selected)}</dd>
              </div>
              <div>
                <dt>测试点</dt>
                <dd>{formatCases(selected.verdict)}</dd>
              </div>
            </dl>
            <div className="teacher-submission-detail-grid">
              <section className="teacher-submission-code-panel">
                <h3>源码</h3>
                <pre className="admin-submission-code teacher-submission-code">{selected.code}</pre>
              </section>
              <section className="teacher-submission-analysis-column">
                <h3>AI 分析</h3>
                <TeacherSubmissionAnalysisPanel
                  state={selectedAnalysisState}
                  fallback={readStructuredSavedAnalysis(selected)}
                  onRetry={() => explainSubmission(selected)}
                />
                {!selected.errorAnalysis && !selectedAnalysisState && selectedCanAnalyze ? (
                  <div className="teacher-submission-analysis-empty">
                    <p>这条提交可以生成 AI 错误分析。</p>
                    <button className="teacher-button" type="button" onClick={() => explainSubmission(selected)}>
                      开始分析
                    </button>
                  </div>
                ) : null}
                {!selectedCanAnalyze ? (
                  <div className="teacher-submission-analysis-empty">
                    <p>当前结果不需要错误分析。</p>
                  </div>
                ) : null}
              </section>
            </div>
          </section>
        </aside>
      ) : null}
    </section>
  )
}

function TeacherSubmissionAnalysisPanel({
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
        <p>正在结合学生源码和判题结果分析错误原因。</p>
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
      {analysis.rawResponse ? (
        <pre className="ai-analysis-raw">{analysis.rawResponse}</pre>
      ) : (
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
      )}
    </section>
  )
}

function canAnalyzeSubmission(submission: TeacherSubmissionHistoryItem): boolean {
  return Boolean(submission.verdict?.result && ANALYZABLE_RESULTS.has(submission.verdict.result))
}

function hasAnalysis(submission: TeacherSubmissionHistoryItem, state?: AnalysisState): boolean {
  return Boolean(isStructuredSavedAnalysis(submission) || state?.status === 'done')
}

function isStructuredSavedAnalysis(submission: TeacherSubmissionHistoryItem): boolean {
  return Boolean(submission.errorAnalysis && submission.errorAnalysis.analysis.summary !== NON_STRUCTURED_FALLBACK_SUMMARY)
}

function readStructuredSavedAnalysis(submission: TeacherSubmissionHistoryItem): SubmissionErrorAnalysis | null {
  return isStructuredSavedAnalysis(submission) ? submission.errorAnalysis : null
}

function readReasonList(analysis: CodeErrorAnalysis): string[] {
  return analysis.reasonList && analysis.reasonList.length > 0 ? analysis.reasonList : [analysis.likelyCause]
}

function formatResult(submission: TeacherSubmissionHistoryItem): string {
  return submission.verdict?.result ?? submission.status
}

function resultStatusClass(submission: TeacherSubmissionHistoryItem): string {
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

function formatLanguage(submission: TeacherSubmissionHistoryItem): string {
  return submission.resolvedLanguage ?? submission.language
}

function shortSubmissionId(id: string): string {
  return id.slice(0, 8)
}

function buildSubmissionHref(baseHref: string, submissionId: string): string {
  const separator = baseHref.includes('?') ? '&' : '?'
  return `${baseHref}${separator}submissionId=${encodeURIComponent(submissionId)}`
}
