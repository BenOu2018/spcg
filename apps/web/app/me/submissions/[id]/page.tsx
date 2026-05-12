import type { Verdict, VerdictCaseResult } from '@spcg/shared/types'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText, RefreshCw } from 'lucide-react'
import { requireUser } from '@/lib/auth-guard'
import { ServiceError } from '@/lib/services/errors'
import { requireUserSubmissionDetail } from '@/lib/services/submission-service'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

type SubmissionDetailPageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export default async function SubmissionDetailPage({ params }: SubmissionDetailPageProps) {
  const { id } = await params
  const session = await requireUser(`/me/submissions/${id}`)
  const messages = getStudentUiMessages(await getRequestUiLocale(session.user.id))
  const submission = await requireUserSubmissionDetail({
    userId: session.user.id,
    submissionId: id,
  }).catch((error) => {
    if (error instanceof ServiceError && error.code === 'not_found') notFound()
    throw error
  })

  const verdict = submission.verdict
  const resultText = formatSubmissionResult(submission.status, verdict, messages)
  const scoreText = submission.maxScore !== null ? `${submission.score}/${submission.maxScore} ${messages.profile.points}` : null

  return (
    <main className="page-shell">
      <section className="submission-detail-page">
        <div className="submission-detail-topline">
          <Link className="profile-back-button" href="/me" aria-label="返回我的进度">
            <ArrowLeft size={18} />
            <span>{messages.profile.title}</span>
          </Link>
          <div className="submission-detail-actions">
            <Link className="icon-link" href={`/me/submissions/${submission.id}`} prefetch={false}>
              <RefreshCw size={16} />
              {messages.common.refresh}
            </Link>
            <Link className="icon-link" href={`/level/${submission.levelId}?stageSelect=1`} prefetch={false}>
              <FileText size={16} />
              {messages.profile.problem}
            </Link>
          </div>
        </div>

        <header className="submission-detail-header">
          <div>
            <span className="eyebrow">{messages.profile.submissionDetail}</span>
            <h1>{submission.levelTitle}</h1>
            <p>
              {submission.levelId} · {submission.knowledgePoint || messages.common.level} · {formatFullTime(submission.createdAt)}
              {submission.assessmentAttemptId ? ` · ${messages.profile.assessmentSubmission}` : ''}
            </p>
          </div>
          <div className="submission-detail-status">
            <span className={`history-verdict history-verdict-${submissionStatusClassName(submission.status, verdict)}`}>
              {resultText}
            </span>
            <strong>{scoreText ?? formatCases(verdict, messages)}</strong>
          </div>
        </header>

        <section className="submission-detail-grid">
          <article className="submission-code-panel">
            <div className="submission-panel-head">
              <h2>{messages.profile.sourceCode}</h2>
              <span>{formatLanguage(submission.resolvedLanguage ?? submission.language)}</span>
            </div>
            <pre>{submission.code}</pre>
          </article>

          <article className="submission-status-panel">
            <div className="submission-panel-head">
              <h2>{messages.profile.judgeStatus}</h2>
              <span>{formatFullTime(submission.updatedAt)}</span>
            </div>
            <div className="submission-status-summary">
              <StatusRow label={messages.history.status} value={resultText} />
              <StatusRow label={messages.results.cases} value={formatCases(verdict, messages)} />
              <StatusRow label={messages.profile.runtime} value={verdict ? `${verdict.maxRuntimeMs} ms` : messages.results.noResult} />
              {scoreText ? <StatusRow label={messages.exam.totalScore} value={scoreText} /> : null}
              {submission.judgeProgress ? (
                <StatusRow
                  label={messages.results.completedCount}
                  value={`${submission.judgeProgress.completedCases}/${submission.judgeProgress.totalCases}`}
                />
              ) : null}
            </div>
            {verdict?.childFriendlyMessage ? <p className="submission-message">{verdict.childFriendlyMessage}</p> : null}
            {verdict?.errorDetail ? <pre className="submission-error-detail">{verdict.errorDetail}</pre> : null}
            <CaseResultList cases={verdict?.caseResults ?? []} messages={messages} />
          </article>
        </section>
      </section>
    </main>
  )
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="submission-status-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function CaseResultList({ cases, messages }: { cases: VerdictCaseResult[]; messages: ReturnType<typeof getStudentUiMessages> }) {
  if (cases.length === 0) {
    return <p className="profile-empty">{messages.results.noResult}</p>
  }

  return (
    <div className="submission-case-list" aria-label={messages.results.testCases}>
      <div className="submission-case-head">
        <span>#</span>
        <span>{messages.results.testCase}</span>
        <span>{messages.history.status}</span>
        <span>Time</span>
      </div>
      {cases.map((item) => (
        <div className="submission-case-row" key={item.index}>
          <span>{item.index + 1}</span>
          <span>{item.visibility === 'public' ? messages.results.publicSample : messages.results.testCase}</span>
          <span className={`history-verdict history-verdict-${statusClassName(item.passed ? 'AC' : item.result)}`}>
            {item.passed ? 'AC' : item.result}
          </span>
          <span>{item.runtimeMs} ms</span>
        </div>
      ))}
    </div>
  )
}

function formatSubmissionResult(status: 'pending' | 'judging' | 'done' | 'error', verdict: Verdict | null, messages: ReturnType<typeof getStudentUiMessages>): string {
  if (verdict) return verdict.result
  if (status === 'pending') return messages.profile.pending
  if (status === 'judging') return messages.profile.judging
  return 'Judge Error'
}

function submissionStatusClassName(status: 'pending' | 'judging' | 'done' | 'error', verdict: Verdict | null): string {
  if (verdict) return statusClassName(verdict.result)
  if (status === 'pending' || status === 'judging') return status
  return 'judge-error'
}

function formatCases(verdict: Verdict | null, messages: ReturnType<typeof getStudentUiMessages>): string {
  if (!verdict) return messages.results.noResult
  return `${verdict.passedCases}/${verdict.totalCases} ${messages.history.cases}`
}

function formatLanguage(value: string | null): string {
  if (!value) return 'Auto'
  if (value === 'cpp') return 'C++'
  if (value === 'python') return 'Python'
  return value
}

function formatFullTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function statusClassName(value: Verdict['result'] | 'pending' | 'judging' | 'done' | 'error'): string {
  return value.toLowerCase().replace(/\s+/g, '-')
}
