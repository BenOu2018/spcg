'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Level } from '@spcg/shared/types'
import type { AssessmentAttempt } from '@spcg/shared/types'
import { finishExamAttemptAction, startExamAttemptAction } from '@/app/exam/actions'
import { getUnlockedLevelSolutionAction } from '@/app/level/actions'
import { CodeWorkspace } from '@/components/CodeWorkspace'
import { TaskCard } from '@/components/TaskCard'
import type { SampleRunResultMap } from '@/components/sample-run'

type ExamLevelProps = {
  levels: Level[]
}

const EXAM_DURATION_SECONDS = 90 * 60

export function ExamLevel({ levels }: ExamLevelProps) {
  const [examLevels, setExamLevels] = useState(levels)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [remainingSeconds, setRemainingSeconds] = useState(EXAM_DURATION_SECONDS)
  const [sampleResultsByLevel, setSampleResultsByLevel] = useState<Record<string, SampleRunResultMap>>({})
  const [taskExpanded, setTaskExpanded] = useState(false)
  const [questionListOpen, setQuestionListOpen] = useState(false)
  const [finished, setFinished] = useState(false)
  const [attempt, setAttempt] = useState<AssessmentAttempt | null>(null)
  const [finishError, setFinishError] = useState('')
  const startAttemptPromiseRef = useRef<Promise<AssessmentAttempt> | null>(null)
  const currentLevel = examLevels[currentIndex] ?? examLevels[0]
  const sampleResults = currentLevel ? sampleResultsByLevel[currentLevel.id] ?? {} : {}
  const layoutVersion = useExamLayoutRefresh(taskExpanded, currentIndex)
  const currentNumber = currentIndex + 1
  const totalQuestions = examLevels.length
  const progressText = useMemo(
    () => `Question ${String(currentNumber).padStart(2, '0')} / ${String(totalQuestions).padStart(2, '0')}`,
    [currentNumber, totalQuestions],
  )

  useEffect(() => {
    setExamLevels(levels)
    setCurrentIndex((value) => Math.min(value, Math.max(0, levels.length - 1)))
  }, [levels])

  useEffect(() => {
    let cancelled = false
    startAttemptPromiseRef.current ??= startExamAttemptAction({ sessionId: 'spcg-level-1', totalCount: levels.length })
    startAttemptPromiseRef.current
      .then((nextAttempt) => {
        if (!cancelled) setAttempt(nextAttempt)
      })
      .catch((error) => {
        if (!cancelled) setFinishError(error instanceof Error ? error.message : '段位赛记录创建失败。')
      })

    return () => {
      cancelled = true
    }
  }, [levels.length])

  useEffect(() => {
    if (finished) return

    const intervalId = window.setInterval(() => {
      setRemainingSeconds((value) => Math.max(0, value - 1))
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [finished])

  useEffect(() => {
    setTaskExpanded(false)
    setQuestionListOpen(false)
  }, [currentLevel?.id])

  useEffect(() => {
    if (remainingSeconds === 0) {
      void finishExam(true)
    }
  }, [remainingSeconds])

  if (!currentLevel) {
    return (
      <main className="exam-page">
        <section className="exam-empty">
          <div>
            <h1>SPCG Ranked Match</h1>
            <p>当前没有可用于段位赛的关卡。</p>
            <Link href="/map">返回新手村</Link>
          </div>
        </section>
      </main>
    )
  }

  function goToQuestion(index: number) {
    setCurrentIndex(Math.min(Math.max(index, 0), examLevels.length - 1))
  }

  function setSampleResults(levelId: string, results: SampleRunResultMap) {
    setSampleResultsByLevel((value) => ({
      ...value,
      [levelId]: results,
    }))
  }

  async function refreshSolutionUnlock(levelId: string) {
    const unlocked = await getUnlockedLevelSolutionAction(levelId)
    if (!unlocked.solutionUnlocked) return

    setExamLevels((currentLevels) =>
      currentLevels.map((level) =>
        level.id === levelId
          ? {
              ...level,
              solutionUnlocked: true,
              solution: unlocked.solution ?? level.solution,
              officialCode: unlocked.officialCode ?? level.officialCode,
              solutionVideoUrl: unlocked.solutionVideoUrl ?? level.solutionVideoUrl ?? null,
            }
          : level,
      ),
    )
  }

  async function finishExam(expired = false) {
    setFinished(true)
    if (!attempt || attempt.status !== 'in_progress') return

    try {
      const finishedAttempt = await finishExamAttemptAction({
        attemptId: attempt.id,
        totalCount: examLevels.length,
        expired,
      })
      setAttempt(finishedAttempt)
    } catch (error) {
      setFinishError(error instanceof Error ? error.message : '段位赛结算失败。')
    }
  }

  return (
    <main className="exam-page">
      <header className="exam-topbar">
        <section className="exam-title-card" aria-label="SPCG Ranked Match">
          <span className="exam-title-emblem" aria-hidden="true" />
          <span className="exam-title-copy">
            <strong>SPCG Ranked Match</strong>
            <em>SPCG 段位赛</em>
          </span>
        </section>

        <div className="exam-question-menu">
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
            <b>{String(currentNumber).padStart(2, '0')}</b>
          </button>
          {questionListOpen ? (
            <div className="exam-question-popover" role="menu">
              <div className="exam-question-popover-head">
                <strong>SPCG 段位赛题目</strong>
                <span>{currentLevel.title}</span>
              </div>
              <div className="exam-question-list-grid">
                {examLevels.map((level, index) => (
                  <button
                    className={index === currentIndex ? 'active' : ''}
                    type="button"
                    key={level.id}
                    role="menuitem"
                    onClick={() => goToQuestion(index)}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{level.title}</strong>
                    <em>{level.knowledgePoint}</em>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="exam-status-card timer">
          <span className="exam-clock-glyph" aria-hidden="true" />
          <span>{formatRemainingTime(remainingSeconds)}</span>
        </div>

        <div className="exam-monitor-card" aria-label="段位赛监控状态">
          <span>
            <i className="exam-status-dot camera" />
            Camera On
          </span>
          <span>
            <i className="exam-status-dot recording" />
            Recording
          </span>
        </div>

        <button className="exam-finish-button" type="button" onClick={() => finishExam(false)}>
          <span>Finish Match</span>
        </button>
      </header>

      <section className={taskExpanded ? 'exam-main task-expanded' : 'exam-main'}>
        <TaskCard
          level={currentLevel}
          sampleResults={sampleResults}
          expanded={taskExpanded}
          onToggleExpanded={() => setTaskExpanded((value) => !value)}
        />
        <div className="exam-workbench-wrap">
          <CodeWorkspace
            key={currentLevel.id}
            level={currentLevel}
            layoutVersion={layoutVersion}
            onRunStart={() => setSampleResults(currentLevel.id, buildJudgingSamples(currentLevel))}
            onRunComplete={(results) => setSampleResults(currentLevel.id, results)}
            onAccepted={() => refreshSolutionUnlock(currentLevel.id)}
          />
        </div>
      </section>

      {finished ? (
        <section className="exam-complete-modal" role="dialog" aria-modal="true" aria-label="段位赛完成">
          <div>
            <span className="exam-complete-emblem" aria-hidden="true" />
            <h1>SPCG 段位赛已结束</h1>
            <p>{formatExamReward(attempt, finishError)}</p>
            <div className="exam-complete-actions">
              <button type="button" onClick={() => setFinished(false)}>
                继续查看
              </button>
              <Link href="/map">返回新手村</Link>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  )
}

function formatExamReward(attempt: AssessmentAttempt | null, error: string): string {
  if (error) return error
  if (!attempt || attempt.status === 'in_progress') return '段位赛正在结算奖励，请稍候查看。'
  const reward = attempt.reward
  if (!reward || reward.ledgerIds.length === 0) {
    return `本次得分 ${attempt.score}，通过 ${attempt.acceptedCount}/${attempt.totalCount} 题。`
  }

  const parts = [`本次得分 ${attempt.score}，通过 ${attempt.acceptedCount}/${attempt.totalCount} 题`]
  if (reward.coinDelta > 0) parts.push(`金币 +${reward.coinDelta}`)
  if (reward.garlicDelta > 0) parts.push(`蒜粒 +${reward.garlicDelta}`)
  if (reward.items.length > 0) parts.push(`装备 ${reward.items.map((item) => item.name).join('、')}`)
  return `${parts.join(' · ')}。`
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
