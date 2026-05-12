'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3 } from 'lucide-react'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'

export type AttemptedProgressItem = {
  levelId: string
  title: string
  knowledgePoint: string
  passed: boolean
  lastSubmittedAt: string
}

type AttemptedProgressListProps = {
  items: AttemptedProgressItem[]
  messages?: StudentUiMessages
}

const PAGE_SIZE = 20

const fallbackMessages = getStudentUiMessages('zh-CN')

export function AttemptedProgressList({ items, messages = fallbackMessages }: AttemptedProgressListProps) {
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
    <section className="progress-list" aria-label={messages.profile.attempted}>
      <div className="progress-list-head">
        <div>
          <h2>{messages.profile.attempted}</h2>
          <span>{items.length} 题 · {messages.profile.perPage} {PAGE_SIZE} 条</span>
        </div>
        {totalPages > 1 ? <em>{currentPage}/{totalPages}</em> : null}
      </div>

      <div className="progress-scroll-list">
        {pageItems.map((item) => (
          <article className="progress-row" key={item.levelId}>
            <div className={item.passed ? 'status-dot done' : 'status-dot'}>
              {item.passed ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}
            </div>
            <div className="progress-row-main">
              <h2>{item.title}</h2>
              <p>
                {messages.common.level} {item.levelId} · {item.knowledgePoint}
              </p>
            </div>
            <span className={item.passed ? 'progress-state passed' : 'progress-state'}>
              {item.passed ? messages.profile.passed : messages.profile.practicing}
            </span>
            <Link className="icon-link" href={`/level/${item.levelId}`} prefetch={false}>
              {messages.common.enter}
              <ArrowRight size={16} />
            </Link>
          </article>
        ))}
        {items.length === 0 ? <p className="profile-empty">{messages.profile.noAttempted}</p> : null}
      </div>

      {totalPages > 1 ? (
        <nav className="progress-pager" aria-label={messages.profile.attempted}>
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
