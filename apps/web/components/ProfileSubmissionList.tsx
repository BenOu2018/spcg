'use client'

import type { Verdict } from '@spcg/shared/types'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Clock3, FileCode2, FileText } from 'lucide-react'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'

export type ProfileSubmissionItem = {
  id: string
  levelId: string
  levelTitle: string
  knowledgePoint: string
  status: 'pending' | 'judging' | 'done' | 'error'
  verdict: Verdict | null
  createdAt: string
  updatedAt: string
  assessmentAttemptId: string | null
  assessmentPhase: 'realtime' | 'final' | null
  score: number
  maxScore: number | null
}

type ProfileSubmissionListProps = {
  items: ProfileSubmissionItem[]
  messages?: StudentUiMessages
}

const PAGE_SIZE = 20
const fallbackMessages = getStudentUiMessages('zh-CN')

export function ProfileSubmissionList({ items, messages = fallbackMessages }: ProfileSubmissionListProps) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [currentPage, items],
  )

  function goToPage(nextPage: number) {
    setPage(Math.min(Math.max(nextPage, 1), totalPages))
  }

  return (
    <section className="progress-list profile-submission-list" aria-label={messages.profile.submissions}>
      <div className="progress-list-head">
        <div>
          <h2>{messages.profile.submissions}</h2>
          <span>{items.length} 条 · {messages.profile.perPage} {PAGE_SIZE} 条</span>
        </div>
        {totalPages > 1 ? <em>{currentPage}/{totalPages}</em> : null}
      </div>

      <div className="progress-scroll-list">
        {pageItems.map((item) => (
          <article className="progress-row profile-submission-row" key={item.id}>
            <div className="status-dot">
              <Clock3 size={16} />
            </div>
            <div className="progress-row-main">
              <h2>{item.levelTitle}</h2>
              <p>
                {item.levelId} · {item.knowledgePoint || messages.common.level} · {formatTime(item.createdAt)}
                {item.assessmentAttemptId ? ` · ${messages.profile.assessmentSubmission}` : ''}
              </p>
            </div>
            <span className={`history-verdict history-verdict-${submissionStatusClassName(item)}`}>
              {formatSubmissionResult(item, messages)}
            </span>
            <span className="profile-submission-cases">{formatCases(item, messages)}</span>
            <div className="profile-submission-actions">
              <Link className="icon-link" href={`/me/submissions/${item.id}`} prefetch={false}>
                <FileCode2 size={15} />
                {messages.profile.code}
              </Link>
              <Link className="icon-link" href={`/level/${item.levelId}?stageSelect=1`} prefetch={false}>
                <FileText size={15} />
                {messages.profile.problem}
              </Link>
            </div>
          </article>
        ))}
        {items.length === 0 ? <p className="profile-empty">{messages.profile.noSubmissions}</p> : null}
      </div>

      {totalPages > 1 ? (
        <nav className="progress-pager" aria-label={messages.profile.submissions}>
          <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
            <ArrowLeft size={16} />
            {messages.profile.previousPage}
          </button>
          <span>
            {messages.common.page} {currentPage} / {totalPages}
          </span>
          <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>
            {messages.profile.nextPage}
            <ArrowRight size={16} />
          </button>
        </nav>
      ) : null}
    </section>
  )
}

function formatSubmissionResult(item: ProfileSubmissionItem, messages: StudentUiMessages): string {
  if (item.verdict) return item.verdict.result
  if (item.status === 'pending') return messages.profile.pending
  if (item.status === 'judging') return messages.profile.judging
  return 'Judge Error'
}

function formatCases(item: ProfileSubmissionItem, messages: StudentUiMessages): string {
  if (item.maxScore !== null) return `${item.score}/${item.maxScore} ${messages.profile.points}`
  if (!item.verdict) return messages.history.noResult
  return `${item.verdict.passedCases}/${item.verdict.totalCases} ${messages.history.cases}`
}

function submissionStatusClassName(item: ProfileSubmissionItem): string {
  if (item.verdict) return statusClassName(item.verdict.result)
  if (item.status === 'pending' || item.status === 'judging') return item.status
  return 'judge-error'
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusClassName(value: Verdict['result'] | ProfileSubmissionItem['status']): string {
  return value.toLowerCase().replace(/\s+/g, '-')
}
