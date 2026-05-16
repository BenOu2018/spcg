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
import { CodeWorkspace, type CodeWorkspaceHandle } from '@/components/CodeWorkspace'
import { TaskCard } from '@/components/TaskCard'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'
import type { SampleRunResultMap } from '@/components/sample-run'

type ExamState = {
  attempt: AssessmentAttempt
  levels: Level[]
  items: AssessmentAttemptItem[]
  access: ExamAccess
}

type ExamHistoryItem = Awaited<ReturnType<typeof listRankedExamHistoryAction>>[number]

type ExamAccess = {
  allowed: boolean
  reason: string | null
  visibleQuestionCount: number
  fullQuestionCount: number
}

type ExamLevelProps = {
  userId: string
  userDisplayName?: string | null
  spcgLevel?: number
  canViewHints?: boolean
  hintsUpgradeMessage?: string
  messages?: StudentUiMessages
}

const fallbackMessages = getStudentUiMessages('zh-CN')
const VIDEO_MONITOR_PROCTOR_IMAGES = [
  '/assets/art/ui/exam-proctors/proctor-same-01.webp?v=same-teacher-20260514',
  '/assets/art/ui/exam-proctors/proctor-same-02.webp?v=same-teacher-20260514',
  '/assets/art/ui/exam-proctors/proctor-same-03.webp?v=same-teacher-20260514',
  '/assets/art/ui/exam-proctors/proctor-same-04.webp?v=same-teacher-20260514',
  '/assets/art/ui/exam-proctors/proctor-same-05.webp?v=same-teacher-20260514',
] as const

export function ExamLevel({
  userId,
  userDisplayName,
  spcgLevel = 1,
  canViewHints = true,
  hintsUpgradeMessage,
  messages = fallbackMessages,
}: ExamLevelProps) {
  const [durationSeconds, setDurationSeconds] = useState(3600)
  const [examState, setExamState] = useState<ExamState | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [remainingSeconds, setRemainingSeconds] = useState(3600)
  const [sampleResultsByLevel, setSampleResultsByLevel] = useState<Record<string, SampleRunResultMap>>({})
  const [taskExpanded, setTaskExpanded] = useState(false)
  const [judgeBusy, setJudgeBusy] = useState(false)
  const [questionListOpen, setQuestionListOpen] = useState(false)
  const [loadingCurrent, setLoadingCurrent] = useState(true)
  const [lastFinishedAttempt, setLastFinishedAttempt] = useState<ExamHistoryItem | null>(null)
  const [videoMonitorSelected, setVideoMonitorSelected] = useState(false)
  const [videoMonitorStream, setVideoMonitorStream] = useState<MediaStream | null>(null)
  const [starting, setStarting] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [error, setError] = useState('')
  const questionMenuRef = useRef<HTMLDivElement | null>(null)
  const codeWorkspaceRef = useRef<CodeWorkspaceHandle | null>(null)
  const visibleQuestionCount = examState?.access.visibleQuestionCount ?? RANKED_ASSESSMENT_TOTAL_QUESTIONS
  const currentLevel = currentIndex < visibleQuestionCount ? examState?.levels[currentIndex] ?? null : null
  const nextLevel = currentIndex + 1 < visibleQuestionCount ? examState?.levels[currentIndex + 1] ?? null : null
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
            access: detail.access,
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
    if (!examState) return
    const lastVisibleIndex = Math.max(0, examState.access.visibleQuestionCount - 1)
    if (currentIndex > lastVisibleIndex) setCurrentIndex(lastVisibleIndex)
  }, [currentIndex, examState?.access.visibleQuestionCount])

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

  useEffect(() => {
    return () => {
      stopMediaStream(videoMonitorStream)
    }
  }, [videoMonitorStream])

  async function startExam() {
    setStarting(true)
    setError('')

    try {
      let videoMonitorEnabled = false
      if (videoMonitorSelected) {
        await requestVideoMonitorStream()
        videoMonitorEnabled = true
      }
      const result = await startRankedExamAttemptAction({
        spcgLevel,
        durationSeconds,
        videoMonitorEnabled,
      })
      setExamState({
        attempt: result.attempt,
        levels: result.levels,
        items: result.items,
        access: result.access,
      })
      setDurationSeconds(result.attempt.durationSeconds)
      setRemainingSeconds(calculateRemainingSeconds(result.attempt))
      setCurrentIndex(0)
      setSampleResultsByLevel({})
      setTaskExpanded(false)
      setQuestionListOpen(false)
      setLastFinishedAttempt(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '段位赛开始失败。')
    } finally {
      setStarting(false)
    }
  }

  async function requestVideoMonitorStream(): Promise<MediaStream> {
    if (videoMonitorStream?.active) return videoMonitorStream
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(messages.exam.videoMonitorCameraUnsupported)
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 360 },
        },
        audio: false,
      })
      setVideoMonitorStream(stream)
      return stream
    } catch {
      throw new Error(messages.exam.videoMonitorCameraDenied)
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
        access: detail.access,
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
    const confirmed = window.confirm(messages.exam.confirmFinish)
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
            <p>{messages.exam.restoring}</p>
          </div>
        </section>
      </main>
    )
  }

  if (!examState) {
    const startDescription = lastFinishedAttempt
      ? `上一场段位赛已完成，得分 ${lastFinishedAttempt.score}/${RANKED_ASSESSMENT_TOTAL_SCORE}。可以新开始一场考试；今天再次考试仍使用同一份当日题单。`
      : `开始后系统会生成今日 ${RANKED_ASSESSMENT_TOTAL_QUESTIONS} 题试卷。第一版不扣蒜粒，后续会在这里接入蒜粒消耗。`
    const startLabel = lastFinishedAttempt ? messages.exam.startNew : messages.exam.start

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
              <strong>{messages.exam.realTimeJudge}</strong>
              <span>{messages.exam.realTimeNote}</span>
            </div>
            <label className="exam-video-monitor-option">
              <input
                type="checkbox"
                checked={videoMonitorSelected}
                onChange={(event) => setVideoMonitorSelected(event.target.checked)}
              />
              <span>
                <strong>{messages.exam.videoMonitor}</strong>
                <em>{messages.exam.videoMonitorBonus}</em>
                <small>{messages.exam.videoMonitorPrivacy}</small>
              </span>
            </label>
            {error ? <p className="exam-error">{error}</p> : null}
            <div className="exam-complete-actions">
              <button type="button" onClick={startExam} disabled={starting}>
                {starting ? messages.exam.generating : startLabel}
              </button>
              <Link href="/map">{messages.common.backToMap}</Link>
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
            <p>{messages.exam.noQuestions}</p>
            <Link href="/map">{messages.common.backToMap}</Link>
          </div>
        </section>
      </main>
    )
  }

  const completed = examState.attempt.status === 'completed' || examState.attempt.status === 'expired'
  const scoringLevel = examState.attempt.status === 'scoring' ? getCurrentScoringLevel(examState) : null
  const scoredCount = examState.items.filter((item) => item.status === 'done').length
  const resultDisplayName = userDisplayName?.trim() || 'SPCG 学员'
  const earnedCoins = examState.attempt.reward?.coinDelta ?? 0
  const isAk = examState.attempt.acceptedCount === examState.attempt.totalCount && examState.attempt.totalCount > 0
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
            <strong>{messages.exam.rankedMatch}</strong>
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
              <strong>{messages.exam.questionList}</strong>
              <em>{progressText}</em>
            </span>
            <b>{String(currentIndex + 1).padStart(2, '0')}</b>
          </button>
          {questionListOpen ? (
            <div className="exam-question-popover" role="menu">
              <div className="exam-question-popover-head">
                <strong>{messages.exam.paperQuestions}</strong>
                <span>{currentLevel.title}</span>
              </div>
              <div className="exam-question-list-grid">
                {examState.levels.map((level, index) => {
                  const item = examState.items.find((entry) => entry.levelId === level.id)
                  const submitted = isExamQuestionSubmitted(item)
                  const visible = index < examState.access.visibleQuestionCount
                  return (
                    <button
                      className={`${index === currentIndex ? 'active' : ''}${visible ? '' : ' locked'}`}
                      type="button"
                      key={level.id}
                      role="menuitem"
                      disabled={!visible}
                      onClick={() => {
                        if (!visible) return
                        setCurrentIndex(index)
                        setQuestionListOpen(false)
                      }}
                    >
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{visible ? level.title : '升级查看'}</strong>
                      <em>
                        {visible ? `${formatDisplayMode(item?.displayMode)} · ${item?.maxScore ?? 0}分` : '不暴露题面与 IDE'}
                      </em>
                      <small className={submitted ? 'submitted' : ''}>
                        {visible ? (submitted ? messages.exam.submitted : messages.exam.unanswered) : '升级开放'}
                      </small>
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

        {isVideoMonitorEnabled(examState.attempt) ? (
          <div className="exam-monitor-card exam-monitor-card-video" aria-label={messages.exam.videoMonitor}>
            <ExamVideoMonitor
              stream={videoMonitorStream}
              onStreamReady={setVideoMonitorStream}
              messages={messages}
            />
          </div>
        ) : (
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
        )}

        <button
          className="exam-finish-button"
          type="button"
          onClick={requestFinishExam}
          disabled={examState.attempt.status !== 'in_progress' || scoring}
        >
          <span>{scoring || examState.attempt.status === 'scoring' ? messages.exam.scoring : messages.exam.finish}</span>
        </button>
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
            key={`${examState.attempt.id}:${currentLevel.id}`}
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
            assessmentAttemptId={examState.attempt.id}
            assessmentItemMaxScore={currentItem?.maxScore ?? null}
            assessmentNextQuestionTitle={nextLevel?.title ?? null}
            storageScope={`ranked:${examState.attempt.id}`}
            messages={messages}
            onAssessmentSubmissionSettled={() => refreshExamState(examState.attempt.id)}
            onAssessmentNextQuestion={
              nextLevel
                ? () => {
                    setCurrentIndex((index) => Math.min(index + 1, Math.max(0, examState.access.visibleQuestionCount - 1)))
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
            <h1>{messages.exam.scoring}</h1>
            <p>{scoringLevel ? `当前判题：第 ${scoringLevel.position} 题 ${scoringLevel.level.title}` : '所有题目已判完，正在汇总成绩。'}</p>
            <div className="exam-score-list">
              {examState.items.map((item) => {
                const level = examState.levels.find((entry) => entry.id === item.levelId)
                const visible = item.position <= examState.access.visibleQuestionCount
                return (
                  <div className={`exam-score-row ${item.status}`} key={item.levelId}>
                    <strong>
                      第 {item.position} 题 · {visible ? level?.title ?? item.levelId : '升级查看'}
                    </strong>
                    <span>{visible ? formatAssessmentItemProgress(item) : '升级后查看完整试卷'}</span>
                  </div>
                )
              })}
            </div>
            <div className="exam-complete-actions">
              <button type="button" onClick={() => refreshExamState(examState.attempt.id)}>
                {messages.exam.refreshScoring}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {completed ? (
        <section className="exam-complete-modal" role="dialog" aria-modal="true" aria-label="段位赛完成">
          <div>
            <span className="exam-complete-emblem" aria-hidden="true" />
            <h1>{messages.exam.scoreTitle}</h1>
            <div className="exam-result-identity">
              <span>参赛学员</span>
              <strong>{resultDisplayName}</strong>
              <small>{buildRankedAssessmentTitle(spcgLevel)}</small>
            </div>
            <div className="exam-result-summary" aria-label="段位赛结算摘要">
              <article>
                <span>总分</span>
                <strong>
                  {examState.attempt.score}/{RANKED_ASSESSMENT_TOTAL_SCORE}
                </strong>
              </article>
              <article>
                <span>满分题</span>
                <strong>
                  {examState.attempt.acceptedCount}/{examState.attempt.totalCount}
                </strong>
              </article>
              <article className="exam-result-coins">
                <span>本场获得金币</span>
                <strong>+{earnedCoins}</strong>
              </article>
            </div>
            {isAk ? (
              <div className="exam-ak-badge">
                <img src="/assets/art/ui/rewards/ak-badge.svg" alt="AK ALL KILL" />
                <span>
                  <strong>AK</strong>
                  <em>ALL KILL · 全题满分</em>
                </span>
              </div>
            ) : null}
            <div className="exam-score-list">
              {examState.items.map((item) => {
                const level = examState.levels.find((entry) => entry.id === item.levelId)
                const visible = item.position <= examState.access.visibleQuestionCount
                return (
                  <div key={item.levelId}>
                    <strong>{visible ? level?.title ?? item.levelId : `第 ${item.position} 题 · 升级查看`}</strong>
                    <span>
                      {visible
                        ? `${item.score}/${item.maxScore} 分 · ${item.passedCases}/${item.totalCases} 点 · ${formatVerdict(item.verdict)}`
                        : '升级后查看完整试卷'}
                    </span>
                  </div>
                )
              })}
            </div>
            <a className="exam-site-mark" href="https://spcg.kidoj.com" target="_blank" rel="noreferrer">
              spcg.kidoj.com
            </a>
            <div className="exam-complete-actions">
              <button type="button" onClick={() => refreshExamState(examState.attempt.id)}>
                {messages.exam.refreshScore}
              </button>
              <Link href="/map">{messages.common.backToMap}</Link>
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

function ExamVideoMonitor({
  stream,
  onStreamReady,
  messages,
}: {
  stream: MediaStream | null
  onStreamReady: (stream: MediaStream) => void
  messages: StudentUiMessages
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const popoverVideoRef = useRef<HTMLVideoElement | null>(null)
  const monitorRef = useRef<HTMLDivElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [proctorIndex, setProctorIndex] = useState(0)

  useEffect(() => {
    setProctorIndex(Math.floor(Math.random() * VIDEO_MONITOR_PROCTOR_IMAGES.length))
    const intervalId = window.setInterval(() => {
      setProctorIndex((index) => (index + 1) % VIDEO_MONITOR_PROCTOR_IMAGES.length)
    }, 5200)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (stream?.active || !navigator.mediaDevices?.getUserMedia) return
    let cancelled = false

    async function requestStream() {
      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 360 },
          },
          audio: false,
        })
        if (cancelled) {
          stopMediaStream(nextStream)
          return
        }
        setCameraError('')
        onStreamReady(nextStream)
      } catch {
        if (!cancelled) setCameraError('摄像头暂未连接，监控奖励资格已保留。')
      }
    }

    void requestStream()

    return () => {
      cancelled = true
    }
  }, [onStreamReady, stream])

  useEffect(() => {
    attachVideoStream(videoRef.current, stream)
    attachVideoStream(popoverVideoRef.current, stream)
  }, [stream, expanded])

  useEffect(() => {
    if (!expanded) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (monitorRef.current?.contains(target)) return
      setExpanded(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [expanded])

  return (
    <div className="exam-video-monitor" ref={monitorRef}>
      <span className="exam-proctor-frame">
        <img src={VIDEO_MONITOR_PROCTOR_IMAGES[proctorIndex]} alt="" />
      </span>
      <span className="exam-video-status">
        <strong>{messages.exam.videoMonitorEnabled}</strong>
      </span>
      <button
        className="exam-video-camera-button"
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-label={messages.exam.videoMonitorExpand}
        aria-expanded={expanded}
        title={messages.exam.videoMonitorExpand}
      >
        <span className="exam-video-frame" aria-hidden="true">
          {stream?.active ? (
            <video ref={videoRef} muted playsInline autoPlay />
          ) : (
            <span className="exam-video-placeholder">{cameraError || messages.exam.videoMonitorLocalOnly}</span>
          )}
        </span>
      </button>

      {expanded ? (
        <div className="exam-video-popover" role="dialog" aria-label={messages.exam.videoMonitor}>
          <div className="exam-video-popover-head">
            <strong>{messages.exam.videoMonitorLocalOnly}</strong>
            <span>{messages.exam.videoMonitorPrivacy}</span>
          </div>
          <div className="exam-video-popover-main">
            {stream?.active ? (
              <video ref={popoverVideoRef} muted playsInline autoPlay />
            ) : (
              <span>{cameraError || messages.exam.videoMonitorLocalOnly}</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function attachVideoStream(video: HTMLVideoElement | null, stream: MediaStream | null) {
  if (!video) return
  if (video.srcObject !== stream) {
    video.srcObject = stream
  }
  if (stream?.active) {
    void video.play().catch(() => undefined)
  }
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
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

function isVideoMonitorEnabled(attempt: AssessmentAttempt): boolean {
  return Boolean(attempt.metadata.videoMonitor?.enabled)
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
