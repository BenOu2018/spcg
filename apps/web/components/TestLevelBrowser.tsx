'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import type { Difficulty, ProblemSource } from '@spcg/shared/types'
import { getDifficultyCoefficient } from '@spcg/shared/difficulty'

export type TestLevelBrowserItem = {
  id: string
  chapterId: string
  order: number
  title: string
  knowledgePoint: string
  difficulty: Difficulty
  status: string
  publicCases: number
  hiddenCases: number
  hintsCount: number
  timeLimitMs: number
  memoryLimitMb: number
  source: ProblemSource
  hasStatementAssets: boolean
  hasSolutionVideo: boolean
  updatedAt: string | null
  passed: boolean
}

type TestLevelBrowserProps = {
  levels: TestLevelBrowserItem[]
}

const PAGE_SIZE = 20

export function TestLevelBrowser({ levels }: TestLevelBrowserProps) {
  const categories = useMemo(() => buildCategories(levels), [levels])
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(1)
  const filteredLevels = useMemo(
    () => levels.filter((level) => category === 'all' || String(level.difficulty.spcgLevel) === category),
    [category, levels],
  )
  const totalPages = Math.max(1, Math.ceil(filteredLevels.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visibleLevels = filteredLevels.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function chooseCategory(nextCategory: string) {
    setCategory(nextCategory)
    setPage(1)
  }

  function goToPage(nextPage: number) {
    setPage(Math.min(Math.max(nextPage, 1), totalPages))
  }

  return (
    <section className="test-level-table" aria-label="题目列表">
      <div className="test-filter-bar" aria-label="按级别分类">
        {categories.map((item) => (
          <button
            className={item.value === category ? 'active' : ''}
            type="button"
            key={item.value}
            onClick={() => chooseCategory(item.value)}
          >
            {item.label}
            <span>{item.count}</span>
          </button>
        ))}
      </div>

      <div className="test-level-table-head">
        <span>ID / 题目</span>
        <span>难度</span>
        <span>内容信息</span>
        <span>状态</span>
        <span>操作</span>
      </div>

      <div className="test-level-scroll">
        {visibleLevels.map((level) => (
          <article className="test-level-row" key={level.id}>
            <div>
              <strong>{level.title}</strong>
              <small>
                {level.id} · {level.chapterId} · 第 {level.order} 关
              </small>
              <em>{level.knowledgePoint}</em>
            </div>
            <div>
              <span>{level.difficulty.levelLabel}</span>
              <small>
                {level.difficulty.stars}层 · 难度系数 {getDifficultyCoefficient(level.difficulty)} · {level.difficulty.label}
                {level.difficulty.lglevel ? ` · LG ${level.difficulty.lglevel}` : ''}
              </small>
            </div>
            <div>
              <span>
                样例 {level.publicCases} / 隐藏 {level.hiddenCases}
              </span>
              <small>
                提示 {level.hintsCount} · {level.timeLimitMs}ms · {level.memoryLimitMb}MB
              </small>
              <small>
                图片 {level.hasStatementAssets ? '有' : '无'} · 视频 {level.hasSolutionVideo ? '有' : '无'}
              </small>
            </div>
            <div>
              <span className="test-status-stack">
                <StatusPill status={level.status} />
                {level.passed ? (
                  <em className="test-pass-pill">
                    <CheckCircle2 size={13} />
                    已通过
                  </em>
                ) : null}
              </span>
              <small>{level.updatedAt ? new Date(level.updatedAt).toLocaleDateString('zh-CN') : '未更新'}</small>
              <small>{level.source.name}</small>
            </div>
            <Link className="test-open-link" href={`/test/${level.id}`}>
              测试
              <ArrowRight size={16} />
            </Link>
          </article>
        ))}

        {filteredLevels.length === 0 ? <p className="test-empty">当前分类下没有题目。</p> : null}
      </div>

      <nav className="test-pager" aria-label="题目分页">
        <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
          <ArrowLeft size={16} />
          上一页
        </button>
        <span>
          第 {currentPage} 页 / 共 {totalPages} 页 · 每页 {PAGE_SIZE} 题
        </span>
        <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>
          下一页
          <ArrowRight size={16} />
        </button>
      </nav>
    </section>
  )
}

function buildCategories(levels: TestLevelBrowserItem[]) {
  const counts = new Map<string, number>()
  for (const level of levels) {
    const key = String(level.difficulty.spcgLevel)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return [
    { value: 'all', label: '全部级别', count: levels.length },
    ...[...counts.entries()]
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([value, count]) => ({ value, label: `SPCG ${value}级`, count })),
  ]
}

function StatusPill({ status }: { status: string }) {
  return <em className={`test-status test-status-${status}`}>{status}</em>
}
