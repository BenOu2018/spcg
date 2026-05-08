'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  RANKED_ASSESSMENT_DURATION_OPTIONS,
  RANKED_ASSESSMENT_TOTAL_QUESTIONS,
  RANKED_ASSESSMENT_TOTAL_SCORE,
  buildRankedAssessmentTitle,
} from '@spcg/shared/ranked-assessment'
import type { AssessmentAttempt, AssessmentAttemptItem, Level } from '@spcg/shared/types'
import {
  finishRankedExamAttemptAction,
  getCurrentRankedExamAttemptAction,
  getRankedExamAttemptAction,
  listRankedExamHistoryAction,
  startRankedExamAttemptAction,
} from '@/app/exam/actions'
import { CodeWorkspace } from '@/components/CodeWorkspace'
import { TaskCard } from '@/components/TaskCard'
import type { SampleRunResultMap } from '@/components/sample-run'

type ExamState = {
  attempt: AssessmentAttempt
  levels: Level[]
  items: AssessmentAttemptItem[]
}

type ExamHistoryItem = Awaited<ReturnType<typeof listRankedExamHistoryAction>>[number]

type ExamLevelProps = {
  spcgLevel?: number
}

export function ExamLevel({ spcgLevel = 1 }: ExamLevelProps) {
  const [durationSeconds, setDurationSeconds] = useState(3600)
  const [examState, setExamState] = useState<ExamState | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [remainingSeconds, setRemainingSeconds] = useState(3600)
  const [sampleResultsByLevel, setSampleResultsByLevel] = useState<Record<string, SampleRunResultMap>>({})
  const [taskExpanded, setTaskExpanded] = useState(false)
  const [questionListOpen, setQuestionListOpen] = useState(false)
  const [loadingCurrent, setLoadingCurrent] = useState(true)
  const [lastFinishedAttempt, setLastFinishedAttempt] = useState<ExamHistoryItem | null>(null)
  const [starting, setStarting] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [error, setError] = useState('')
  const questionMenuRef = useRef<HTMLDivElement | null>(null)
  const currentLevel = examState?.levels[currentIndex] ?? null
  const nextLevel = examState?.levels[currentIndex + 1] ?? null
  const currentItem = currentLevel ? examState?.items.find((item) => item.levelId === currentLevel.id) ?? null : null
  const sampleResults = currentLevel ? sampleResultsByLevel[currentLevel.id] ?? {} : {}
  const layoutVersion = useExamLayoutRefresh(taskExpanded, currentIndex)
  const progressText = useMemo(() => {
    const total = examState?.levels.length ?? RANKED_ASSESSMENT_TOTAL_QUESTIONS
    return `Question ${String(currentIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
  }, [currentIndex, examState?.levels.length])

  useEffect(() => {
    let cancelled = false

    async function loadCurrentAttempt() {
      setLoadingCurrent(true)
      try {
        const [detail, history] = await Promise.all([
          getCurrentRankedExamAttemptAction({ spcgLevel }),
          listRankedExamHistoryAction({ limit: 1, spcgLevel }),
        ])
        if (cancelled) return

        if (detail) {
          setExamState({
            attempt: detail.attempt,
            levels: detail.levels,
            items: detail.items,
          })
          setDurationSeconds(detail.attempt.durationSeconds)
          setRemainingSeconds(calculateRemainingSeconds(detail.attempt))
          setLastFinishedAttempt(null)
        } else {
          setLastFinishedAttempt(history.find((item) => item.status === 'completed' || item.status === 'expired') ?? null)
        }
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : '段位赛恢复失败。')
      } finally {
        if (!cancelled) setLoadingCurrent(false)
      }
    }

    void loadCurrentAttempt()

    return () => {
      cancelled = true
    }
  }, [spcgLevel])

  useEffect(() => {
    if (!examState || examState.attempt.status !== 'in_progress') return

    const refreshRemainingSeconds = () => {
      setRemainingSeconds(calculateRemainingSeconds(examState.attempt))
    }

    refreshRemainingSeconds()
    const intervalId = window.setInterval(() => {
      refreshRemainingSeconds()
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [examState?.attempt.id, examState?.attempt.startedAt, examState?.attempt.durationSeconds, examState?.attempt.status])

  useEffect(() => {
    if (!examState || examState.attempt.status !== 'scoring') return

    const intervalId = window.setInterval(() => {
      void refreshExamState(examState.attempt.id)
    }, 2000)

    return () => window.clearInterval(intervalId)
  }, [examState?.attempt.id, examState?.attempt.status])

  useEffect(() => {
    setTaskExpanded(false)
    setQuestionListOpen(false)
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

  async function startExam() {
    setStarting(true)
    setError('')

    try {
      const result = await startRankedExamAttemptAction({
        spcgLevel,
        durationSeconds,
      })
      setExamState({
        attempt: result.attempt,
        levels: result.levels,
        items: result.items,
      })
      setDurationSeconds(result.attempt.durationSeconds)
      setRemainingSeconds(calculateRemainingSeconds(result.attempt))
      setCurrentIndex(0)
      setLastFinishedAttempt(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '段位赛开始失败。')
    } finally {
      setStarting(false)
    }
  }

  async function finishExam(expired = false) {
    if (!examState || examState.attempt.status !== 'in_progress') return
    setScoring(true)
    setError('')

    try {
      const attempt = await finishRankedExamAttemptAction({
        attemptId: examState.attempt.id,
        expired,
      })
      setExamState((current) => (current ? { ...current, attempt } : current))
      setQuestionListOpen(false)
      void refreshExamState(attempt.id)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '段位赛交卷失败。')
    } finally {
      setScoring(false)
    }
  }

  async function refreshExamState(attemptId: string) {
    try {
      const detail = await getRankedExamAttemptAction({ attemptId })
      setExamState({
        attempt: detail.attempt,
        levels: detail.levels,
        items: detail.items,
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '段位赛结果刷新失败。')
    }
  }

  function setSampleResults(levelId: string, results: SampleRunResultMap) {
    setSampleResultsByLevel((value) => ({
      ...value,
      [levelId]: results,
    }))
  }

  function requestFinishExam() {
    if (!examState || examState.attempt.status !== 'in_progress') return
    const confirmed = window.confirm('确认交卷吗？交卷后本次段位赛会进入最终判题，不能继续修改代码。')
    if (!confirmed) return
    void finishExam(false)
  }

  if (loadingCurrent) {
    return (
      <main className="exam-page">
        <section className="exam-start-panel">
          <div>
            <span className="exam-complete-emblem" aria-hidden="true" />
            <h1>{buildRankedAssessmentTitle(spcgLevel)}</h1>
            <p>正在恢复本次考试进度...</p>
          </div>
        </section>
      </main>
    )
  }

  if (!examState) {
    const startDescription = lastFinishedAttempt
      ? `上一场段位赛已完成，得分 ${lastFinishedAttempt.score}/${RANKED_ASSESSMENT_TOTAL_SCORE}。可以新开始一场考试；今天再次考试仍使用同一份当日题单。`
      : `开始后系统会生成今日 ${RANKED_ASSESSMENT_TOTAL_QUESTIONS} 题试卷。第一版不扣蒜粒，后续会在这里接入蒜粒消耗。`
    const startLabel = lastFinishedAttempt ? '新开始一场考试' : '开始考试'

    return (
      <main className="exam-page">
        <section className="exam-start-panel">
          <div>
            <span className="exam-complete-emblem" aria-hidden="true" />
            <h1>{buildRankedAssessmentTitle(spcgLevel)}</h1>
            <p>{startDescription}</p>
            <div className="exam-duration-options" role="radiogroup" aria-label="选择考试时间">
              {RANKED_ASSESSMENT_DURATION_OPTIONS.map((option) => (
                <button
                  className={durationSeconds === option.seconds ? 'active' : ''}
                  type="button"
                  key={option.seconds}
                  onClick={() => setDurationSeconds(option.seconds)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="exam-mode-note">
              <strong>实时判题</strong>
              <span>考试中快速反馈；交卷后会重新跑满测试点并计算总分。</span>
            </div>
            {error ? <p className="exam-error">{error}</p> : null}
            <div className="exam-complete-actions">
              <button type="button" onClick={startExam} disabled={starting}>
                {starting ? '正在生成试卷...' : startLabel}
              </button>
              <Link href="/map">返回地图</Link>
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (!currentLevel) {
    return (
      <main className="exam-page">
        <section className="exam-empty">
          <div>
            <h1>{buildRankedAssessmentTitle(spcgLevel)}</h1>
            <p>当前没有可用于段位赛的题目。</p>
            <Link href="/map">返回地图</Link>
          </div>
        </section>
      </main>
    )
  }

  const completed = examState.attempt.status === 'completed' || examState.attempt.status === 'expired'
  const scoringLevel = examState.attempt.status === 'scoring' ? getCurrentScoringLevel(examState) : null
  const scoredCount = examState.items.filter((item) => item.status === 'done').length
  const statusText =
    examState.attempt.status === 'scoring'
      ? scoringLevel
        ? `判题中 ${scoringLevel.position}/${examState.items.length}`
        : '正在汇总'
      : completed
        ? `总分 ${examState.attempt.score}/${RANKED_ASSESSMENT_TOTAL_SCORE}`
        : formatRemainingTime(remainingSeconds)

  return (
    <main className="exam-page">
      <header className="exam-topbar">
        <section className="exam-title-card" aria-label="SPCG Ranked Match">
          <span className="exam-title-emblem" aria-hidden="true" />
          <span className="exam-title-copy">
            <strong>SPCG Ranked Match</strong>
            <em>{buildRankedAssessmentTitle(spcgLevel)}</em>
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
              <strong>题目列表</strong>
              <em>{progressText}</em>
            </span>
            <b>{String(currentIndex + 1).padStart(2, '0')}</b>
          </button>
          {questionListOpen ? (
            <div className="exam-question-popover" role="menu">
              <div className="exam-question-popover-head">
                <strong>SPCG 段位赛题目</strong>
                <span>{currentLevel.title}</span>
              </div>
              <div className="exam-question-list-grid">
                {examState.levels.map((level, index) => {
                  const item = examState.items.find((entry) => entry.levelId === level.id)
                  const submitted = isExamQuestionSubmitted(item)
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
                      <em>
                        {formatDisplayMode(item?.displayMode)} · {item?.maxScore ?? 0}分
                      </em>
                      <small className={submitted ? 'submitted' : ''}>{submitted ? '已提交' : '未答题'}</small>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="exam-status-card timer">
          <span className="exam-clock-glyph" aria-hidden="true" />
          <span>{statusText}</span>
        </div>

        <div className="exam-monitor-card" aria-label="段位赛判题状态">
          <span>
            <i className="exam-status-dot recording" />
            {scoringLevel
              ? `正在判题：${scoringLevel.level.title}`
              : currentItem
                ? `${formatDisplayMode(currentItem.displayMode)} · ${currentItem.maxScore}分`
                : '实时判题'}
          </span>
          <span>
            {examState.attempt.status === 'scoring'
              ? `完成 ${scoredCount}/${examState.items.length}`
              : completed
                ? `${examState.attempt.acceptedCount}/${examState.attempt.totalCount} 满分题`
                : '实时判题'}
          </span>
        </div>

        <button
          className="exam-finish-button"
          type="button"
          onClick={requestFinishExam}
          disabled={examState.attempt.status !== 'in_progress' || scoring}
        >
          <span>{scoring || examState.attempt.status === 'scoring' ? 'Scoring...' : 'Finish Match'}</span>
        </button>
      </header>

      {error ? <div className="exam-inline-error">{error}</div> : null}

      <section className={taskExpanded ? 'exam-main task-expanded' : 'exam-main'}>
        <TaskCard
          level={currentLevel}
          sampleResults={sampleResults}
          expanded={taskExpanded}
          onToggleExpanded={() => setTaskExpanded((value) => !value)}
        />
        <div className="exam-workbench-wrap">
          <CodeWorkspace
            key={`${examState.attempt.id}:${currentLevel.id}`}
            level={currentLevel}
            layoutVersion={layoutVersion}
            onRunStart={() => setSampleResults(currentLevel.id, buildJudgingSamples(currentLevel))}
            onRunComplete={(results) => setSampleResults(currentLevel.id, results)}
            assessmentAttemptId={examState.attempt.id}
            assessmentItemMaxScore={currentItem?.maxScore ?? null}
            assessmentNextQuestionTitle={nextLevel?.title ?? null}
            onAssessmentSubmissionSettled={() => refreshExamState(examState.attempt.id)}
            onAssessmentNextQuestion={
              nextLevel
                ? () => {
                    setCurrentIndex((index) => Math.min(index + 1, examState.levels.length - 1))
                    setQuestionListOpen(false)
                  }
                : undefined
            }
          />
        </div>
      </section>

      {examState.attempt.status === 'scoring' ? (
        <section className="exam-complete-modal exam-scoring-modal" role="status" aria-label="段位赛正在判题">
          <div>
            <span className="exam-complete-emblem" aria-hidden="true" />
            <h1>正在判题</h1>
            <p>{scoringLevel ? `当前判题：第 ${scoringLevel.position} 题 ${scoringLevel.level.title}` : '所有题目已判完，正在汇总成绩。'}</p>
            <div className="exam-score-list">
              {examState.items.map((item) => {
                const level = examState.levels.find((entry) => entry.id === item.levelId)
                return (
                  <div className={`exam-score-row ${item.status}`} key={item.levelId}>
                    <strong>
                      第 {item.position} 题 · {level?.title ?? item.levelId}
                    </strong>
                    <span>{formatAssessmentItemProgress(item)}</span>
                  </div>
                )
              })}
            </div>
            <div className="exam-complete-actions">
              <button type="button" onClick={() => refreshExamState(examState.attempt.id)}>
                刷新判题进度
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {completed ? (
        <section className="exam-complete-modal" role="dialog" aria-modal="true" aria-label="段位赛完成">
          <div>
            <span className="exam-complete-emblem" aria-hidden="true" />
            <h1>SPCG 段位赛成绩</h1>
            <p>
              总分 {examState.attempt.score}/{RANKED_ASSESSMENT_TOTAL_SCORE}，满分题 {examState.attempt.acceptedCount}/
              {examState.attempt.totalCount}。
            </p>
            <div className="exam-score-list">
              {examState.items.map((item) => {
                const level = examState.levels.find((entry) => entry.id === item.levelId)
                return (
                  <div key={item.levelId}>
                    <strong>{level?.title ?? item.levelId}</strong>
                    <span>
                      {item.score}/{item.maxScore} 分 · {item.passedCases}/{item.totalCases} 点 · {formatVerdict(item.verdict)}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="exam-complete-actions">
              <button type="button" onClick={() => refreshExamState(examState.attempt.id)}>
                刷新成绩
              </button>
              <Link href="/map">返回地图</Link>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  )
}

function useExamLayoutRefresh(taskExpanded: boolean, currentIndex: number) {
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

function buildJudgingSamples(level: Level): SampleRunResultMap {
  return Object.fromEntries(
    level.publicCases.slice(0, 2).map((sample) => [sample.id, { status: 'judging', passed: false }]),
  ) as SampleRunResultMap
}

function formatRemainingTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function calculateRemainingSeconds(attempt: AssessmentAttempt): number {
  const startedAt = new Date(attempt.startedAt).getTime()
  if (!Number.isFinite(startedAt)) return attempt.durationSeconds

  const endsAt = startedAt + attempt.durationSeconds * 1000
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
}

function formatDisplayMode(mode?: string): string {
  if (mode === 'basic') return '基础题'
  if (mode === 'variant') return '变式题'
  if (mode === 'challenge') return '挑战题'
  if (mode === 'advanced') return '提高题'
  return '考试题'
}

function formatVerdict(verdict: AssessmentAttemptItem['verdict']): string {
  return verdict?.result ?? '未提交'
}

function isExamQuestionSubmitted(item?: AssessmentAttemptItem | null): boolean {
  return Boolean(item?.latestRealtimeSubmissionId || item?.finalSubmissionId)
}

function getCurrentScoringLevel(examState: ExamState): { item: AssessmentAttemptItem; level: Level; position: number } | null {
  const item = examState.items.find((entry) => entry.status === 'scoring') ?? null
  if (!item) return null
  const level = examState.levels.find((entry) => entry.id === item.levelId)
  if (!level) return null
  return { item, level, position: item.position }
}

function formatAssessmentItemProgress(item: AssessmentAttemptItem): string {
  if (item.status === 'done') {
    if (!item.finalSubmissionId && !item.latestRealtimeSubmissionId) return `未提交 · 0/${item.maxScore} 分`
    return `${item.score}/${item.maxScore} 分 · ${item.passedCases}/${item.totalCases} 点 · ${formatVerdict(item.verdict)}`
  }

  if (item.status === 'scoring') return '判题中'
  return isExamQuestionSubmitted(item) ? '等待判题' : '未提交'
}
