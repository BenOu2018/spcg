'use client'

import { useEffect, useRef, useState } from 'react'
import type { Level, Progress } from '@spcg/shared/types'
import { getUnlockedLevelSolutionAction } from '@/app/level/actions'
import { CodeWorkspace } from '@/components/CodeWorkspace'
import { TaskCard } from '@/components/TaskCard'
import { emitBehaviorEvent } from '@/components/behavior-events'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'
import type { SampleRunResultMap } from '@/components/sample-run'

type StagePathMenu = {
  title: string
  stageNo: number
  items: Array<{
    levelId: string
    title: string
    position: number
    displayMode: string
  }>
} | null

type ProgrammingLevelProps = {
  level: Level
  userId: string
  stageMenu?: StagePathMenu
  progressRecords?: Progress[]
  canViewHints?: boolean
  hintsUpgradeMessage?: string
  messages?: StudentUiMessages
}

type CompletionAnimationPhase = 'idle' | 'slide-out' | 'ko-show' | 'impact' | 'next-ready'

type RecommendedNextLevel = {
  href: string
  label: string
}

const fallbackMessages = getStudentUiMessages('zh-CN')
const KO_ASSET_URL = '/assets/art/ui/effects/ko-clear-v1.webp'
const COMPLETION_TIMING = {
  slideMs: 820,
  koShowMs: 1000,
  impactMs: 760,
}

export function ProgrammingLevel({
  level,
  userId,
  stageMenu = null,
  progressRecords = [],
  canViewHints = true,
  hintsUpgradeMessage,
  messages = fallbackMessages,
}: ProgrammingLevelProps) {
  const [activeLevel, setActiveLevel] = useState(level)
  const [sampleResults, setSampleResults] = useState<SampleRunResultMap>({})
  const [videoOpen, setVideoOpen] = useState(false)
  const [taskExpanded, setTaskExpanded] = useState(false)
  const [completionPhase, setCompletionPhase] = useState<CompletionAnimationPhase>('idle')
  const [localPassedIds, setLocalPassedIds] = useState<Set<string>>(
    () => new Set(progressRecords.filter((progress) => progress.passed).map((progress) => progress.levelId)),
  )
  const completionTimersRef = useRef<number[]>([])
  const layoutVersion = useProgrammingLayoutRefresh()
  const videoUrl = activeLevel.solutionVideoUrl ?? null
  const activeProgress = progressRecords.find((progress) => progress.levelId === activeLevel.id) ?? null
  const recommendedNext = getRecommendedNextLevel(activeLevel.id, stageMenu, localPassedIds)
  const showKoOverlay = completionPhase === 'slide-out' || completionPhase === 'ko-show' || completionPhase === 'impact'

  useEffect(() => {
    resetCompletionAnimation()
    setActiveLevel(level)
    setSampleResults({})
    setVideoOpen(false)
    setTaskExpanded(false)
  }, [level.id])

  useEffect(() => {
    setLocalPassedIds(new Set(progressRecords.filter((progress) => progress.passed).map((progress) => progress.levelId)))
  }, [progressRecords])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => window.cancelAnimationFrame(frame)
  }, [taskExpanded])

  useEffect(() => {
    return () => clearCompletionTimers()
  }, [])

  function clearCompletionTimers() {
    for (const timer of completionTimersRef.current) window.clearTimeout(timer)
    completionTimersRef.current = []
  }

  function resetCompletionAnimation() {
    clearCompletionTimers()
    setCompletionPhase('idle')
  }

  function startCompletionAnimation() {
    clearCompletionTimers()
    setCompletionPhase('slide-out')

    const showTimer = window.setTimeout(() => {
      setCompletionPhase('ko-show')
    }, COMPLETION_TIMING.slideMs)

    const impactTimer = window.setTimeout(() => {
      setCompletionPhase('impact')
    }, COMPLETION_TIMING.slideMs + COMPLETION_TIMING.koShowMs)

    const doneTimer = window.setTimeout(() => {
      setCompletionPhase('next-ready')
      window.dispatchEvent(new Event('resize'))
    }, COMPLETION_TIMING.slideMs + COMPLETION_TIMING.koShowMs + COMPLETION_TIMING.impactMs)

    completionTimersRef.current = [showTimer, impactTimer, doneTimer]
  }

  async function handleAccepted() {
    startCompletionAnimation()
    await refreshSolutionUnlock()
  }

  async function refreshSolutionUnlock() {
    setLocalPassedIds((current) => {
      const next = new Set(current)
      next.add(activeLevel.id)
      return next
    })
    const unlocked = await getUnlockedLevelSolutionAction(activeLevel.id)
    if (!unlocked.solutionUnlocked) return

    setActiveLevel((current) => {
      if (current.id !== activeLevel.id) return current

      return {
        ...current,
        solutionUnlocked: true,
        solution: unlocked.solution ?? current.solution,
        officialCode: unlocked.officialCode ?? current.officialCode,
        solutionVideoUrl: unlocked.solutionVideoUrl ?? current.solutionVideoUrl ?? null,
      }
    })
  }

  return (
    <div
      className={[
        'programming-layout',
        taskExpanded ? 'task-expanded' : '',
        completionPhase !== 'idle' ? 'completion-animation' : '',
        completionPhase !== 'idle' ? `completion-${completionPhase}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <TaskCard
        level={activeLevel}
        sampleResults={sampleResults}
        className="completion-task-panel"
        expanded={taskExpanded}
        onToggleExpanded={() => setTaskExpanded((value) => !value)}
        onPlayVideo={
          videoUrl
            ? () => {
                emitBehaviorEvent({
                  type: 'solution_video',
                  levelId: activeLevel.id,
                  metadata: { action: 'open' },
                })
                setVideoOpen(true)
              }
            : undefined
        }
        canViewHints={canViewHints}
        hintsUpgradeMessage={hintsUpgradeMessage}
        messages={messages}
      />
      <CodeWorkspace
        level={activeLevel}
        userId={userId}
        initialProgress={activeProgress}
        layoutVersion={layoutVersion + (taskExpanded ? 1 : 0)}
        className="completion-workbench-panel"
        completionNextHref={recommendedNext?.href ?? null}
        completionNextLabel={recommendedNext?.label ?? '下一题'}
        completionNextVisible={completionPhase === 'next-ready' && Boolean(recommendedNext)}
        onRunStart={() => setSampleResults(buildJudgingSamples(activeLevel))}
        onRunComplete={setSampleResults}
        onAccepted={handleAccepted}
        messages={messages}
        stagePath={
          stageMenu
            ? {
                title: stageMenu.title,
                stageNo: stageMenu.stageNo,
                items: stageMenu.items,
                passedLevelIds: [...localPassedIds],
              }
            : undefined
        }
      />
      {videoOpen && videoUrl ? (
        <FloatingVideoPlayer
          title={`${activeLevel.title} · ${messages.task.algorithmVideo}`}
          closeLabel={messages.common.close}
          url={videoUrl}
          onClose={() => setVideoOpen(false)}
        />
      ) : null}
      {showKoOverlay ? (
        <div className={`completion-ko-overlay completion-ko-${completionPhase}`} aria-hidden="true">
          <img src={KO_ASSET_URL} alt="" />
        </div>
      ) : null}
    </div>
  )
}

function getRecommendedNextLevel(
  levelId: string,
  stageMenu: StagePathMenu,
  passedLevelIds: Set<string>,
): RecommendedNextLevel | null {
  if (!stageMenu) return null
  const passedIds = new Set(passedLevelIds)
  passedIds.add(levelId)
  const current = stageMenu.items.find((item) => item.levelId === levelId)
  const nextMainline = stageMenu.items.find((item) => item.position <= 3 && !passedIds.has(item.levelId))
  const nextUnpassed = stageMenu.items.find((item) => item.position > (current?.position ?? 0) && !passedIds.has(item.levelId))
  const recommended = nextMainline ?? nextUnpassed
  if (!recommended) return null
  return {
    href: `/level/${recommended.levelId}`,
    label: '下一题',
  }
}

function useProgrammingLayoutRefresh() {
  const [layoutVersion, setLayoutVersion] = useState(0)
  const frameRef = useRef<number | null>(null)
  const snapshotRef = useRef('')
  const isSyntheticResizeRef = useRef(false)

  useEffect(() => {
    const root = document.documentElement
    const readSnapshot = () => {
      const viewport = window.visualViewport
      const visualWidth = viewport?.width ?? window.innerWidth
      const visualHeight = viewport?.height ?? window.innerHeight

      return [
        Math.round(window.innerWidth),
        Math.round(window.innerHeight),
        Math.round(visualWidth),
        Math.round(visualHeight),
        window.devicePixelRatio.toFixed(3),
      ].join(':')
    }
    const applyViewportVars = () => {
      const viewport = window.visualViewport
      const viewportWidth = viewport?.width ?? window.innerWidth
      const viewportHeight = viewport?.height ?? window.innerHeight

      root.style.setProperty('--programming-viewport-width', `${Math.round(viewportWidth)}px`)
      root.style.setProperty('--programming-viewport-height', `${Math.round(viewportHeight)}px`)
    }
    const scheduleRefresh = (notifyResizeObservers: boolean) => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        snapshotRef.current = readSnapshot()
        applyViewportVars()
        setLayoutVersion((value) => (value + 1) % 100000)

        if (notifyResizeObservers) {
          isSyntheticResizeRef.current = true
          window.dispatchEvent(new Event('resize'))
          isSyntheticResizeRef.current = false
        }
      })
    }
    const handleResize = () => {
      if (isSyntheticResizeRef.current) return
      scheduleRefresh(true)
    }
    const checkViewport = () => {
      const nextSnapshot = readSnapshot()

      if (nextSnapshot !== snapshotRef.current) {
        scheduleRefresh(true)
      }
    }

    snapshotRef.current = readSnapshot()
    scheduleRefresh(false)

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    window.visualViewport?.addEventListener('resize', handleResize)

    const intervalId = window.setInterval(checkViewport, 350)

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }

      window.clearInterval(intervalId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
      window.visualViewport?.removeEventListener('resize', handleResize)
      root.style.removeProperty('--programming-viewport-width')
      root.style.removeProperty('--programming-viewport-height')
    }
  }, [])

  return layoutVersion
}

function buildJudgingSamples(level: Level): SampleRunResultMap {
  return Object.fromEntries(
    level.publicCases.slice(0, 2).map((sample) => [sample.id, { status: 'judging', passed: false }]),
  ) as SampleRunResultMap
}

type FloatingVideoPlayerProps = {
  title: string
  closeLabel: string
  url: string
  onClose: () => void
}

function FloatingVideoPlayer({ title, closeLabel, url, onClose }: FloatingVideoPlayerProps) {
  return (
    <aside className="floating-video" aria-label={title}>
      <div className="floating-video-head">
        <span>{title}</span>
        <button type="button" onClick={onClose} aria-label={closeLabel}>
          x
        </button>
      </div>
      <video src={url} controls autoPlay playsInline />
    </aside>
  )
}
