'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssessmentAttemptItem, Level } from '@spcg/shared/types'
import { completeDailyReviewAction, getDailyReviewAttemptAction } from '@/app/daily-review/actions'
import { CodeWorkspace, type CodeWorkspaceHandle } from '@/components/CodeWorkspace'
import { TaskCard } from '@/components/TaskCard'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'
import type { DailyReviewDetail } from '@/lib/services/daily-review-service'
import type { SampleRunResultMap } from '@/components/sample-run'

type DailyReviewLevelProps = {
  detail: DailyReviewDetail
  userId: string
  canViewHints?: boolean
  hintsUpgradeMessage?: string
  messages?: StudentUiMessages
}

const fallbackMessages = getStudentUiMessages('zh-CN')

export function DailyReviewLevel({
  detail,
  userId,
  canViewHints = true,
  hintsUpgradeMessage,
  messages = fallbackMessages,
}: DailyReviewLevelProps) {
  const [reviewState, setReviewState] = useState(detail)
  const [currentIndex, setCurrentIndex] = useState(() => findFirstOpenIndex(detail.items))
  const [sampleResultsByLevel, setSampleResultsByLevel] = useState<Record<string, SampleRunResultMap>>({})
  const [taskExpanded, setTaskExpanded] = useState(false)
  const [judgeBusy, setJudgeBusy] = useState(false)
  const [questionListOpen, setQuestionListOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const questionMenuRef = useRef<HTMLDivElement | null>(null)
  const codeWorkspaceRef = useRef<CodeWorkspaceHandle | null>(null)
  const currentLevel = reviewState.levels[currentIndex] ?? reviewState.levels[0] ?? null
  const currentItem = currentLevel ? reviewState.items.find((item) => item.levelId === currentLevel.id) ?? null : null
  const nextOpenIndex = useMemo(() => findNextOpenIndex(reviewState.items, currentIndex), [reviewState.items, currentIndex])
  const nextOpenLevel = nextOpenIndex === null ? null : reviewState.levels[nextOpenIndex] ?? null
  const continueHref = reviewState.currentEntryLevelId ? `/level/${reviewState.currentEntryLevelId}` : '/map'
  const completed = reviewState.completed || reviewState.attempt.status === 'completed'
  const completedCount = reviewState.items.filter((item) => item.status === 'done').length
  const progressText = `${completedCount}/${reviewState.items.length}`
  const layoutVersion = useDailyReviewLayoutRefresh(taskExpanded, currentIndex)
  const sampleResults = currentLevel ? sampleResultsByLevel[currentLevel.id] ?? {} : {}

  useEffect(() => {
    setReviewState(detail)
    setCurrentIndex(findFirstOpenIndex(detail.items))
  }, [detail.attempt.id])

  useEffect(() => {
    if (currentIndex > Math.max(0, reviewState.levels.length - 1)) {
      setCurrentIndex(Math.max(0, reviewState.levels.length - 1))
    }
  }, [currentIndex, reviewState.levels.length])

  useEffect(() => {
    setTaskExpanded(false)
    setQuestionListOpen(false)
    setJudgeBusy(false)
  }, [currentLevel?.id])

  useEffect(() => {
    if (!questionListOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (questionMenuRef.current?.contains(target)) return
      setQuestionListOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [questionListOpen])

  async function refreshReviewState(moveToOpen = false) {
    setRefreshing(true)
    setError('')

    try {
      const next = await completeDailyReviewAction(reviewState.attempt.id)
      setReviewState(next)
      if (moveToOpen && !next.completed) setCurrentIndex(findFirstOpenIndex(next.items))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '今日任务状态刷新失败。')
    } finally {
      setRefreshing(false)
    }
  }

  async function restoreReviewState() {
    setRefreshing(true)
    setError('')

    try {
      setReviewState(await getDailyReviewAttemptAction(reviewState.attempt.id))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '今日任务读取失败。')
    } finally {
      setRefreshing(false)
    }
  }

  function setSampleResults(levelId: string, results: SampleRunResultMap) {
    setSampleResultsByLevel((value) => ({
      ...value,
      [levelId]: results,
    }))
  }

  if (!currentLevel) {
    return (
      <main className="exam-page">
        <section className="exam-empty">
          <div>
            <h1>今日任务</h1>
            <p>今日任务暂时没有题目。</p>
            <Link href={continueHref}>继续当前关卡</Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="exam-page">
      <header className="exam-topbar">
        <section className="exam-title-card" aria-label="今日任务">
          <span className="exam-title-emblem" aria-hidden="true" />
          <span className="exam-title-copy">
            <strong>今日任务</strong>
            <em>复习上两关 · {reviewState.dateKey}</em>
          </span>
        </section>

        <div className="exam-question-menu" ref={questionMenuRef}>
          <button
            className="exam-question-trigger"
            type="button"
            aria-expanded={questionListOpen}
            aria-haspopup="menu"
            onClick={() => setQuestionListOpen((value) => !value)}
          >
            <span className="exam-menu-glyph" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="exam-trigger-copy">
              <strong>复习题单</strong>
              <em>
                第 {String(currentIndex + 1).padStart(2, '0')} 题 / {String(reviewState.items.length).padStart(2, '0')}
              </em>
            </span>
            <b>{String(currentIndex + 1).padStart(2, '0')}</b>
          </button>
          {questionListOpen ? (
            <div className="exam-question-popover" role="menu">
              <div className="exam-question-popover-head">
                <strong>今日复习题</strong>
                <span>{currentLevel.title}</span>
              </div>
              <div className="exam-question-list-grid">
                {reviewState.levels.map((level, index) => {
                  const item = reviewState.items.find((entry) => entry.levelId === level.id)
                  const accepted = item?.status === 'done'
                  return (
                    <button
                      className={index === currentIndex ? 'active' : ''}
                      type="button"
                      key={level.id}
                      role="menuitem"
                      onClick={() => {
                        setCurrentIndex(index)
                        setQuestionListOpen(false)
                      }}
                    >
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{level.title}</strong>
                      <em>复习题 · 2 金币任务</em>
                      <small className={accepted ? 'submitted' : ''}>{accepted ? '已通过' : formatItemStatus(item)}</small>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="exam-status-card timer">
          <span className="exam-clock-glyph" aria-hidden="true" />
          <span>{completed ? '已完成' : `进度 ${progressText}`}</span>
        </div>

        <div className="exam-monitor-card" aria-label="今日任务状态">
          <span>
            <i className={completed ? 'exam-status-dot' : 'exam-status-dot recording'} />
            {completed ? '金币 +2 已记录' : '复习不影响原题进度'}
          </span>
          <span>{currentItem?.status === 'done' ? '当前题已通过' : '可随时跳过'}</span>
        </div>

        <Link className="exam-finish-button" href={continueHref}>
          <span>跳过并继续</span>
        </Link>
      </header>

      {error ? <div className="exam-inline-error">{error}</div> : null}

      <section className={taskExpanded ? 'exam-main task-expanded' : 'exam-main'}>
        <TaskCard
          level={currentLevel}
          sampleResults={sampleResults}
          expanded={taskExpanded}
          onToggleExpanded={() => setTaskExpanded((value) => !value)}
          onRunSample={(sample) => void codeWorkspaceRef.current?.runSampleInput(sample.id, sample.input)}
          sampleRunDisabled={judgeBusy}
          canViewHints={canViewHints}
          hintsUpgradeMessage={hintsUpgradeMessage}
          messages={messages}
        />
        <div className="exam-workbench-wrap">
          <CodeWorkspace
            ref={codeWorkspaceRef}
            key={`${reviewState.attempt.id}:${currentLevel.id}`}
            level={currentLevel}
            userId={userId}
            layoutVersion={layoutVersion}
            onRunStart={(event) =>
              setSampleResults(
                currentLevel.id,
                event ? (event.sampleId ? buildJudgingSample(currentLevel, event.sampleId) : {}) : buildJudgingSamples(currentLevel),
              )
            }
            onRunComplete={(results) => setSampleResults(currentLevel.id, results)}
            onJudgeBusyChange={setJudgeBusy}
            assessmentAttemptId={reviewState.attempt.id}
            assessmentItemMaxScore={currentItem?.maxScore ?? 1}
            assessmentNextQuestionTitle={nextOpenLevel?.title ?? null}
            onAssessmentNextQuestion={nextOpenIndex === null ? undefined : () => setCurrentIndex(nextOpenIndex)}
            onAssessmentSubmissionSettled={() => refreshReviewState(true)}
            storageScope={`daily-review:${reviewState.attempt.id}`}
            messages={messages}
          />
        </div>
      </section>

      {completed ? (
        <section className="exam-complete-modal" role="dialog" aria-modal="true" aria-label="今日任务完成">
          <div>
            <span className="exam-complete-emblem" aria-hidden="true" />
            <h1>今日任务完成</h1>
            <p>
              已通过 {reviewState.attempt.acceptedCount}/{reviewState.attempt.totalCount} 道复习题，
              {formatReward(reviewState.reward)}。
            </p>
            <div className="exam-score-list">
              {reviewState.items.map((item) => {
                const level = reviewState.levels.find((entry) => entry.id === item.levelId)
                return (
                  <div key={item.levelId}>
                    <strong>
                      第 {item.position} 题 · {level?.title ?? item.levelId}
                    </strong>
                    <span>{formatCompletedItem(item)}</span>
                  </div>
                )
              })}
            </div>
            <div className="exam-complete-actions">
              <button type="button" onClick={restoreReviewState} disabled={refreshing}>
                {refreshing ? '刷新中...' : '刷新'}
              </button>
              <Link href={continueHref}>继续当前关卡</Link>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  )
}

function useDailyReviewLayoutRefresh(taskExpanded: boolean, currentIndex: number) {
  const [layoutVersion, setLayoutVersion] = useState(0)

  useEffect(() => {
    const root = document.documentElement
    const applyViewportVars = () => {
      const viewport = window.visualViewport
      const viewportWidth = viewport?.width ?? window.innerWidth
      const viewportHeight = viewport?.height ?? window.innerHeight

      root.style.setProperty('--programming-viewport-width', `${Math.round(viewportWidth)}px`)
      root.style.setProperty('--programming-viewport-height', `${Math.round(viewportHeight)}px`)
      setLayoutVersion((value) => (value + 1) % 100000)
    }

    applyViewportVars()
    window.addEventListener('resize', applyViewportVars)
    window.visualViewport?.addEventListener('resize', applyViewportVars)

    return () => {
      window.removeEventListener('resize', applyViewportVars)
      window.visualViewport?.removeEventListener('resize', applyViewportVars)
      root.style.removeProperty('--programming-viewport-width')
      root.style.removeProperty('--programming-viewport-height')
    }
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'))
      setLayoutVersion((value) => (value + 1) % 100000)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [taskExpanded, currentIndex])

  return layoutVersion
}

function buildJudgingSample(level: Level, sampleId: string): SampleRunResultMap {
  const sample = level.publicCases.find((item) => item.id === sampleId)
  return sample ? { [sample.id]: { status: 'judging', passed: false } } : {}
}

function buildJudgingSamples(level: Level): SampleRunResultMap {
  return Object.fromEntries(
    level.publicCases.slice(0, 2).map((sample) => [sample.id, { status: 'judging', passed: false }]),
  ) as SampleRunResultMap
}

function findFirstOpenIndex(items: AssessmentAttemptItem[]): number {
  const index = items.findIndex((item) => item.status !== 'done')
  return Math.max(0, index)
}

function findNextOpenIndex(items: AssessmentAttemptItem[], currentIndex: number): number | null {
  const next = items.findIndex((item, index) => index > currentIndex && item.status !== 'done')
  if (next >= 0) return next
  const first = items.findIndex((item) => item.status !== 'done')
  return first >= 0 && first !== currentIndex ? first : null
}

function formatItemStatus(item?: AssessmentAttemptItem | null): string {
  if (!item?.latestRealtimeSubmissionId) return '未提交'
  if (item.verdict?.result) return item.verdict.result
  if (item.status === 'scoring') return '判题中'
  return '已提交'
}

function formatCompletedItem(item: AssessmentAttemptItem): string {
  if (!item.latestRealtimeSubmissionId) return '未提交'
  return `${item.verdict?.result ?? '已提交'} · ${item.passedCases}/${item.totalCases} 点`
}

function formatReward(reward: DailyReviewDetail['reward']): string {
  const coins = reward?.coinDelta ?? 2
  return `奖励金币 +${coins}`
}
