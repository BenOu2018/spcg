'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3 } from 'lucide-react'

export type AttemptedProgressItem = {
  levelId: string
  title: string
  knowledgePoint: string
  passed: boolean
  lastSubmittedAt: string
}

type AttemptedProgressListProps = {
  items: AttemptedProgressItem[]
}

const PAGE_SIZE = 20

export function AttemptedProgressList({ items }: AttemptedProgressListProps) {
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
    <section className="progress-list" aria-label="做过的题目">
      <div className="progress-list-head">
        <div>
          <h2>做过的题目</h2>
          <span>{items.length} 题 · 每页 {PAGE_SIZE} 条</span>
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
                关卡 {item.levelId} · {item.knowledgePoint}
              </p>
            </div>
            <span className={item.passed ? 'progress-state passed' : 'progress-state'}>{item.passed ? '已通过' : '练习中'}</span>
            <Link className="icon-link" href={`/level/${item.levelId}`}>
              进入
              <ArrowRight size={16} />
            </Link>
          </article>
        ))}
        {items.length === 0 ? <p className="profile-empty">还没有做过的题目。</p> : null}
      </div>

      {totalPages > 1 ? (
        <nav className="progress-pager" aria-label="做过的题目分页">
          <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
            <ArrowLeft size={16} />
            上一页
          </button>
          <span>
            第 {currentPage} 页 / 共 {totalPages} 页
          </span>
          <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>
            下一页
            <ArrowRight size={16} />
          </button>
        </nav>
      ) : null}
    </section>
  )
}
