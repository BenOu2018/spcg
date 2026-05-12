'use client'

import { useEffect, useRef, useState } from 'react'
import type { Level, Progress } from '@spcg/shared/types'
import { getUnlockedLevelSolutionAction } from '@/app/level/actions'
import { CodeWorkspace } from '@/components/CodeWorkspace'
import { TaskCard } from '@/components/TaskCard'
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

const fallbackMessages = getStudentUiMessages('zh-CN')

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
  const [localPassedIds, setLocalPassedIds] = useState<Set<string>>(
    () => new Set(progressRecords.filter((progress) => progress.passed).map((progress) => progress.levelId)),
  )
  const layoutVersion = useProgrammingLayoutRefresh()
  const videoUrl = activeLevel.solutionVideoUrl ?? null
  const activeProgress = progressRecords.find((progress) => progress.levelId === activeLevel.id) ?? null

  useEffect(() => {
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
    <div className={taskExpanded ? 'programming-layout task-expanded' : 'programming-layout'}>
      <TaskCard
        level={activeLevel}
        sampleResults={sampleResults}
        expanded={taskExpanded}
        onToggleExpanded={() => setTaskExpanded((value) => !value)}
        onPlayVideo={videoUrl ? () => setVideoOpen(true) : undefined}
        canViewHints={canViewHints}
        hintsUpgradeMessage={hintsUpgradeMessage}
        messages={messages}
      />
      <CodeWorkspace
        level={activeLevel}
        userId={userId}
        initialProgress={activeProgress}
        layoutVersion={layoutVersion + (taskExpanded ? 1 : 0)}
        onRunStart={() => setSampleResults(buildJudgingSamples(activeLevel))}
        onRunComplete={setSampleResults}
        onAccepted={refreshSolutionUnlock}
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
    </div>
  )
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
