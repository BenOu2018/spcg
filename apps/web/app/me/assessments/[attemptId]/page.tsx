import type { AssessmentAttempt, AssessmentAttemptItem, Level, Verdict } from '@spcg/shared/types'
import { getProblemSetItemDisplayModeLabel } from '@spcg/shared/curriculum'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileCode2, RefreshCw } from 'lucide-react'
import { requireUser } from '@/lib/auth-guard'
import { ServiceError } from '@/lib/services/errors'
import { getRankedAssessmentDetail } from '@/lib/services/assessment-service'
import { getUserSubmissionHistory, type SubmissionHistoryItem } from '@/lib/services/submission-service'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

type AssessmentAttemptPageProps = {
  params: Promise<{ attemptId: string }> | { attemptId: string }
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

export default async function AssessmentAttemptPage({ params, searchParams }: AssessmentAttemptPageProps) {
  const { attemptId } = await params
  const query = searchParams ? await searchParams : {}
  const requestedLevelId = readQueryValue(query.levelId)
  const returnPath = `/me/assessments/${attemptId}${requestedLevelId ? `?levelId=${encodeURIComponent(requestedLevelId)}` : ''}`
  const session = await requireUser(returnPath)
  const messages = getStudentUiMessages(await getRequestUiLocale(session.user.id))
  const detail = await getRankedAssessmentDetail({
    userId: session.user.id,
    attemptId,
  }).catch((error) => {
    if (error instanceof ServiceError && (error.code === 'not_found' || error.code === 'forbidden')) notFound()
    throw error
  })

  const levelsById = new Map(detail.levels.map((level) => [level.id, level]))
  const selectedLevel =
    (requestedLevelId ? levelsById.get(requestedLevelId) : null) ?? detail.levels[0] ?? null
  const selectedItem = selectedLevel ? detail.items.find((item) => item.levelId === selectedLevel.id) ?? null : null
  const submissionHistory = selectedLevel
    ? await getUserSubmissionHistory({
        userId: session.user.id,
        levelId: selectedLevel.id,
        assessmentAttemptId: attemptId,
      }).catch((error) => ({
        items: [],
        error: error instanceof Error ? error.message : '提交记录读取失败。',
      }))
    : { items: [], error: undefined }

  return (
    <main className="page-shell">
      <section className="submission-detail-page">
        <div className="submission-detail-topline">
          <Link className="profile-back-button" href="/me" aria-label="返回我的进度">
            <ArrowLeft size={18} />
            <span>{messages.profile.title}</span>
          </Link>
          <div className="submission-detail-actions">
            <Link className="icon-link" href={returnPath} prefetch={false}>
              <RefreshCw size={16} />
              {messages.common.refresh}
            </Link>
          </div>
        </div>

        <header className="submission-detail-header">
          <div>
            <span className="eyebrow">段位赛场次</span>
            <h1>{formatAttemptTitle(detail.attempt)}</h1>
            <p>
              {formatFullTime(detail.attempt.startedAt)} · {formatAttemptDuration(detail.attempt.durationSeconds)} ·{' '}
              {formatAttemptStatus(detail.attempt.status)}
            </p>
          </div>
          <div className="submission-detail-status">
            <span className={`history-verdict history-verdict-${attemptStatusClassName(detail.attempt.status)}`}>
              {formatAttemptStatus(detail.attempt.status)}
            </span>
            <strong>
              {detail.attempt.score}/300 · {detail.attempt.acceptedCount}/{detail.attempt.totalCount}
            </strong>
          </div>
        </header>

        <section className="progress-list profile-submission-list" aria-label="段位赛题目">
          <div className="progress-list-head">
            <div>
              <h2>选择题目</h2>
              <span>{detail.items.length} 题 · 点击题目查看本场提交</span>
            </div>
          </div>
          <div className="progress-scroll-list">
            {detail.items.map((item) => {
              const level = levelsById.get(item.levelId)
              const active = selectedLevel?.id === item.levelId
              return (
                <article className="progress-row profile-submission-row" key={item.levelId}>
                  <div className="status-dot">
                    <span>{String(item.position).padStart(2, '0')}</span>
                  </div>
                  <div className="progress-row-main">
                    <h2>{level?.title ?? item.levelId}</h2>
                    <p>
                      {formatDisplayMode(item.displayMode)} · {item.score}/{item.maxScore} 分 ·{' '}
                      {formatItemCases(item)}
                    </p>
                  </div>
                  <span className={`history-verdict history-verdict-${itemStatusClassName(item)}`}>
                    {formatItemStatus(item)}
                  </span>
                  <div className="profile-submission-actions">
                    <Link
                      aria-current={active ? 'page' : undefined}
                      className="icon-link"
                      href={`/me/assessments/${attemptId}?levelId=${encodeURIComponent(item.levelId)}`}
                      prefetch={false}
                    >
                      {active ? '当前题目' : '查看提交'}
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        {selectedLevel ? (
          <section className="progress-list profile-submission-list" aria-label="本题提交记录">
            <div className="progress-list-head">
              <div>
                <h2>{selectedLevel.title}</h2>
                <span>
                  {selectedLevel.id} · {submissionHistory.items.length} 条本场提交
                </span>
              </div>
              {selectedItem ? (
                <em>
                  {selectedItem.score}/{selectedItem.maxScore} 分
                </em>
              ) : null}
            </div>

            <div className="progress-scroll-list">
              {submissionHistory.error ? <p className="profile-empty">{submissionHistory.error}</p> : null}
              {submissionHistory.items.map((submission) => (
                <AssessmentSubmissionRow
                  attemptId={attemptId}
                  item={submission}
                  key={submission.id}
                  levelId={selectedLevel.id}
                  messages={messages}
                />
              ))}
              {submissionHistory.items.length === 0 && !submissionHistory.error ? (
                <p className="profile-empty">这道题在本场段位赛中暂无提交。</p>
              ) : null}
            </div>
          </section>
        ) : (
          <p className="profile-empty">这场段位赛没有可查看的题目。</p>
        )}
      </section>
    </main>
  )
}

function AssessmentSubmissionRow({
  attemptId,
  item,
  levelId,
  messages,
}: {
  attemptId: string
  item: SubmissionHistoryItem
  levelId: string
  messages: ReturnType<typeof getStudentUiMessages>
}) {
  const resultText = formatSubmissionResult(item, messages)
  return (
    <article className="progress-row profile-submission-row">
      <div className="status-dot">
        <FileCode2 size={16} />
      </div>
      <div className="progress-row-main">
        <h2>{formatSubmissionPhase(item.assessmentPhase)}</h2>
        <p>
          {formatFullTime(item.createdAt)} · {formatLanguage(item.resolvedLanguage ?? item.language)} ·{' '}
          {formatSubmissionScore(item)}
        </p>
      </div>
      <span className={`history-verdict history-verdict-${submissionStatusClassName(item)}`}>
        {resultText}
      </span>
      <span className="profile-submission-cases">{formatSubmissionCases(item, messages)}</span>
      <div className="profile-submission-actions">
        <Link
          className="icon-link"
          href={`/me/submissions/${item.id}?fromAssessment=${encodeURIComponent(attemptId)}&levelId=${encodeURIComponent(levelId)}`}
          prefetch={false}
        >
          <FileCode2 size={15} />
          {messages.profile.code}
        </Link>
      </div>
    </article>
  )
}

function readQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function formatAttemptTitle(attempt: AssessmentAttempt): string {
  const match = /^ranked-spcg(\d+)-(.+)$/.exec(attempt.sessionId)
  if (!match) return '段位赛场次'
  return `${match[1]}级段位赛 ${match[2]}`
}

function formatAttemptStatus(status: AssessmentAttempt['status']): string {
  const labels: Record<AssessmentAttempt['status'], string> = {
    in_progress: '进行中',
    scoring: '判题中',
    completed: '已完成',
    expired: '已超时',
    abandoned: '已放弃',
  }
  return labels[status]
}

function formatAttemptDuration(seconds: number): string {
  const hours = Math.round(seconds / 3600)
  return `${Math.max(1, hours)}小时`
}

function formatDisplayMode(displayMode: string): string {
  return getProblemSetItemDisplayModeLabel(displayMode)
}

function formatItemStatus(item: AssessmentAttemptItem): string {
  if (item.status === 'done') {
    if (item.score >= item.maxScore && item.maxScore > 0) return '满分'
    if (item.score > 0) return '部分分'
    return '未通过'
  }
  if (item.status === 'scoring') return '判题中'
  return '未提交'
}

function formatItemCases(item: AssessmentAttemptItem): string {
  if (item.totalCases <= 0) return '暂无用例结果'
  return `${item.passedCases}/${item.totalCases} 用例`
}

function formatSubmissionPhase(phase: SubmissionHistoryItem['assessmentPhase']): string {
  if (phase === 'final') return '最终提交'
  if (phase === 'realtime') return '实时提交'
  return '普通提交'
}

function formatSubmissionResult(item: SubmissionHistoryItem, messages: ReturnType<typeof getStudentUiMessages>): string {
  if (item.verdict) return item.verdict.result
  if (item.status === 'pending') return messages.profile.pending
  if (item.status === 'judging') return messages.profile.judging
  return 'Judge Error'
}

function formatSubmissionScore(item: SubmissionHistoryItem): string {
  if (item.maxScore === null) return '无分数'
  return `${item.score}/${item.maxScore} 分`
}

function formatSubmissionCases(item: SubmissionHistoryItem, messages: ReturnType<typeof getStudentUiMessages>): string {
  if (item.maxScore !== null) return `${item.score}/${item.maxScore} ${messages.profile.points}`
  if (!item.verdict) return messages.history.noResult
  return `${item.verdict.passedCases}/${item.verdict.totalCases} ${messages.history.cases}`
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

function attemptStatusClassName(status: AssessmentAttempt['status']): string {
  if (status === 'completed') return 'ac'
  if (status === 'scoring' || status === 'in_progress') return 'judging'
  if (status === 'expired') return 'tle'
  return 'judge-error'
}

function itemStatusClassName(item: AssessmentAttemptItem): string {
  if (item.status === 'scoring') return 'judging'
  if (item.status !== 'done') return 'pending'
  if (item.score >= item.maxScore && item.maxScore > 0) return 'ac'
  if (item.score > 0) return 'wa'
  return 'judge-error'
}

function submissionStatusClassName(item: SubmissionHistoryItem): string {
  if (item.verdict) return statusClassName(item.verdict.result)
  if (item.status === 'pending' || item.status === 'judging') return item.status
  return 'judge-error'
}

function statusClassName(value: Verdict['result'] | SubmissionHistoryItem['status']): string {
  return value.toLowerCase().replace(/\s+/g, '-')
}
