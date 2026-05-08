'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Editor, loader, type BeforeMount, type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { AlignLeft, ChevronsDown, ChevronsUp, FileCode2, History, RefreshCw, X } from 'lucide-react'
import type { CodeErrorAnalysis, JudgeProgress, Level, Progress, SubmissionErrorAnalysis, Verdict } from '@spcg/shared/types'
import { normalizeOutput } from '@spcg/shared/judge'
import { getProblemSetItemDisplayModeLabel } from '@spcg/shared/curriculum'
import {
  LANGUAGE_MODES,
  getLanguageLabel,
  getMonacoLanguage,
  normalizeLanguageMode,
  resolveLanguageMode,
  type LanguageMode,
  type ResolvedLanguage,
} from '@spcg/shared/language-config'
import {
  explainSubmissionErrorAction,
  getSubmissionHistoryAction,
  getAssessmentSubmissionHistoryAction,
  getSubmissionVerdictAction,
  runCodeAction,
  runPublicSamplesAction,
  submitCodeAction,
} from '@/app/level/actions'
import { AlgorithmWhiteboardButton, AlgorithmWhiteboardModal } from '@/components/AlgorithmWhiteboard'
import { TestResults } from '@/components/TestResults'
import type { SampleRunResultMap } from '@/components/sample-run'

loader.config({
  paths: {
    vs: '/monaco/vs',
  },
})

type SubmissionPollResult = Awaited<ReturnType<typeof getSubmissionVerdictAction>>
type SubmissionHistoryResult = Awaited<ReturnType<typeof getSubmissionHistoryAction>>
type SubmissionHistoryItem = SubmissionHistoryResult['items'][number]
type SubmissionAnalysisState =
  | { status: 'loading'; analysis?: CodeErrorAnalysis; error?: string; cached?: boolean }
  | { status: 'done'; analysis: CodeErrorAnalysis; error?: string; cached?: boolean }
  | { status: 'error'; analysis?: CodeErrorAnalysis; error: string; cached?: boolean }

type CodeWorkspaceProps = {
  level: Level
  initialProgress?: Progress | null
  layoutVersion?: number
  onRunStart?: () => void
  onRunComplete?: (sampleResults: SampleRunResultMap) => void
  onAccepted?: () => void | Promise<void>
  stagePath?: StagePath
  assessmentAttemptId?: string | null
  assessmentItemMaxScore?: number | null
  assessmentNextQuestionTitle?: string | null
  onAssessmentNextQuestion?: () => void
  onAssessmentSubmissionSettled?: () => void | Promise<void>
}

type StagePath = {
  title: string
  stageNo: number
  passedLevelIds: string[]
  items: Array<{
    levelId: string
    title: string
    position: number
    displayMode: string
  }>
}

type LearningFeedback = {
  kind: 'accepted' | 'repair'
  title: string
  body: string
  steps?: string[]
  nextHref?: string
  nextLabel?: string
  nextActionLabel?: string
  nextAction?: () => void
}

type IdeBugContext = {
  levelId: string
  levelTitle: string
  language: string
  resolvedLanguage: string
  code: string
}

declare global {
  interface Window {
    __spcgCurrentIdeContext?: IdeBugContext
  }
}

export function CodeWorkspace({
  level,
  initialProgress = null,
  layoutVersion = 0,
  onRunStart,
  onRunComplete,
  onAccepted,
  stagePath,
  assessmentAttemptId = null,
  assessmentItemMaxScore = null,
  assessmentNextQuestionTitle = null,
  onAssessmentNextQuestion,
  onAssessmentSubmissionSettled,
}: CodeWorkspaceProps) {
  const [languageMode, setLanguageMode] = useState<LanguageMode>(() => readCachedLanguageMode(level.id))
  const [code, setCode] = useState(() => {
    const cachedLanguage = readCachedLanguageMode(level.id)
    return readCachedCode(level.id, cachedLanguage) ?? getStarterCodeForLanguage(level, cachedLanguage)
  })
  const [lastRunCode, setLastRunCode] = useState(level.starterCode)
  const [expanded, setExpanded] = useState(false)
  const [outputExpanded, setOutputExpanded] = useState(false)
  const [resultsMaximized, setResultsMaximized] = useState(false)
  const [status, setStatus] = useState<'idle' | 'judging' | 'done'>('idle')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [consoleInput, setConsoleInput] = useState(() => getDefaultConsoleInput(level))
  const [consoleOutput, setConsoleOutput] = useState('')
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  const [judgeProgress, setJudgeProgress] = useState<JudgeProgress | null>(null)
  const [sampleProgress, setSampleProgress] = useState<JudgeProgress | null>(null)
  const [lastRemoteSubmissionId, setLastRemoteSubmissionId] = useState<string | null>(null)
  const [analysisBySubmissionId, setAnalysisBySubmissionId] = useState<Record<string, SubmissionAnalysisState>>({})
  const [learningFeedback, setLearningFeedback] = useState<LearningFeedback | null>(null)
  const [repairAttemptCount, setRepairAttemptCount] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [whiteboardOpen, setWhiteboardOpen] = useState(false)
  const [historyItems, setHistoryItems] = useState<SubmissionHistoryItem[]>([])
  const [historyStatus, setHistoryStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [historyError, setHistoryError] = useState('')
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [toolbarRenderKey, setToolbarRenderKey] = useState(0)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const workbenchRef = useRef<HTMLElement | null>(null)
  const editorShellRef = useRef<HTMLElement | null>(null)
  const ideLayoutFrameRef = useRef<number | null>(null)
  const ideLayoutSnapshotRef = useRef('')
  const statusRef = useRef(status)
  const editorDisposablesRef = useRef<Array<{ dispose: () => void }>>([])
  const selectedHistory = historyItems.find((item) => item.id === selectedHistoryId) ?? null
  const selectedHistorySource = selectedHistory?.canViewCode && selectedHistory.code ? selectedHistory : null
  const resolvedLanguage = useMemo(() => resolveLanguageMode(languageMode, code), [languageMode, code])
  const usesConsole = useMemo(
    () =>
      /\b(?:cin|scanf|input)\b/.test(code) || level.publicCases.some((sample) => sample.input.trim().length > 0),
    [code, level],
  )

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    const cachedLanguage = readCachedLanguageMode(level.id)
    const cachedCode = readCachedCode(level.id, cachedLanguage)
    const restoredCode = cachedCode ?? getStarterCodeForLanguage(level, cachedLanguage)
    const completedProgress = initialProgress?.passed ? initialProgress : null
    const completedVerdict = completedProgress ? buildCompletedProgressVerdict(level, completedProgress) : null
    setLanguageMode(cachedLanguage)
    setCode(restoredCode)
    setLastRunCode(restoredCode)
    setConsoleInput(getDefaultConsoleInput(level))
    setConsoleOutput('')
    setDebugInfo(completedProgress ? formatCompletedProgressDebugInfo(completedProgress) : [])
    setJudgeProgress(null)
    setSampleProgress(null)
    setVerdict(completedVerdict)
    setStatus(completedVerdict ? 'done' : 'idle')
    setOutputExpanded(false)
    setResultsMaximized(false)
    setLastRemoteSubmissionId(null)
    setAnalysisBySubmissionId({})
    setLearningFeedback(completedVerdict ? buildPreviouslyAcceptedLearningFeedback(level.id, stagePath) : null)
    setRepairAttemptCount(0)
    setHistoryOpen(false)
    setWhiteboardOpen(false)
    setHistoryItems([])
    setHistoryStatus('idle')
    setHistoryError('')
    setSelectedHistoryId(null)
  }, [level.id, initialProgress?.passed, initialProgress?.bestRuntimeMs, initialProgress?.attemptCount, initialProgress?.lastSubmittedAt])

  useEffect(() => {
    if (!initialProgress?.passed || assessmentAttemptId) return

    let cancelled = false

    async function restoreAcceptedSubmission() {
      try {
        const history = await getSubmissionHistoryAction(level.id)
        if (cancelled) return

        const latestAccepted = history.items.find(
          (item) => item.canViewCode && item.status === 'done' && item.verdict?.result === 'AC',
        )
        if (!latestAccepted) return

        setHistoryItems(history.items)
        setHistoryStatus(history.error ? 'error' : 'done')
        setHistoryError(history.error ?? '')

        const result = await getSubmissionVerdictAction(latestAccepted.id)
        if (cancelled || statusRef.current !== 'done') return

        const acceptedVerdict = result.verdict?.result === 'AC' ? result.verdict : latestAccepted.verdict
        if (!acceptedVerdict || acceptedVerdict.result !== 'AC') return

        setLastRemoteSubmissionId(latestAccepted.id)
        setVerdict(acceptedVerdict)
        setJudgeProgress(null)
        setDebugInfo(
          formatRemoteSubmissionDebugInfo(
            latestAccepted.id,
            {
              status: result.status === 'missing' ? latestAccepted.status : result.status,
              verdict: acceptedVerdict,
              language: result.language ?? latestAccepted.language,
              resolvedLanguage: result.resolvedLanguage ?? latestAccepted.resolvedLanguage,
              reward: result.reward,
            },
            acceptedVerdict,
          ),
        )
        setLearningFeedback(buildPreviouslyAcceptedLearningFeedback(level.id, stagePath))
      } catch {
        // 如果历史提交恢复失败，保留 progress 已通过状态即可。
      }
    }

    void restoreAcceptedSubmission()

    return () => {
      cancelled = true
    }
  }, [assessmentAttemptId, initialProgress?.passed, level.id])

  useEffect(() => {
    if (!assessmentAttemptId) return

    let cancelled = false
    const activeAssessmentAttemptId = assessmentAttemptId

    async function restoreLatestAssessmentSubmission() {
      try {
        const history = await getAssessmentSubmissionHistoryAction({ levelId: level.id, assessmentAttemptId: activeAssessmentAttemptId })
        if (cancelled) return

        const latestOwnSubmission = history.items.find((item) => item.canViewCode)
        if (!latestOwnSubmission) return

        setLastRemoteSubmissionId(latestOwnSubmission.id)
        setHistoryItems(history.items)
        setHistoryStatus(history.error ? 'error' : 'done')
        setHistoryError(history.error ?? '')

        if (latestOwnSubmission.status === 'pending' || latestOwnSubmission.status === 'judging') {
          setStatus('judging')
          setVerdict(null)
          setOutputExpanded(true)
          setJudgeProgress(buildSubmissionProgress(level, latestOwnSubmission.status))
          setDebugInfo(
            formatRemoteSubmissionDebugInfo(latestOwnSubmission.id, {
              status: latestOwnSubmission.status,
              verdict: latestOwnSubmission.verdict,
              language: latestOwnSubmission.language,
              resolvedLanguage: latestOwnSubmission.resolvedLanguage,
            }),
          )
          const result = await pollRemoteSubmission(latestOwnSubmission.id, (nextResult) => {
            if (!cancelled) {
              setJudgeProgress(nextResult.judgeProgress ?? buildSubmissionProgress(level, nextResult.status))
              setDebugInfo(formatRemoteSubmissionDebugInfo(latestOwnSubmission.id, nextResult))
            }
          })
          if (cancelled) return

          const nextVerdict =
            result.verdict ??
            buildServiceVerdict('Judge Error', result.error ?? '远程判题结果暂未返回。')
          setVerdict(nextVerdict)
          setDebugInfo(formatRemoteSubmissionDebugInfo(latestOwnSubmission.id, result, nextVerdict))
          setJudgeProgress(null)
          setStatus('done')
          updateLearningFeedback(nextVerdict)
          void onAssessmentSubmissionSettled?.()
          void refreshHistory(false)
          return
        }

        if (latestOwnSubmission.verdict) {
          setStatus('done')
          setVerdict(latestOwnSubmission.verdict)
          setJudgeProgress(null)
          setOutputExpanded(true)
          setDebugInfo(
            formatRemoteSubmissionDebugInfo(latestOwnSubmission.id, {
              status: latestOwnSubmission.status,
              verdict: latestOwnSubmission.verdict,
              language: latestOwnSubmission.language,
              resolvedLanguage: latestOwnSubmission.resolvedLanguage,
            }),
          )
          updateLearningFeedback(latestOwnSubmission.verdict)
          return
        }

        if (latestOwnSubmission.status === 'error') {
          const nextVerdict = buildServiceVerdict('Judge Error', '远程判题失败，请查看提交记录或重新提交。')
          setStatus('done')
          setVerdict(nextVerdict)
          setJudgeProgress(null)
          setOutputExpanded(true)
          setDebugInfo(
            formatRemoteSubmissionDebugInfo(
              latestOwnSubmission.id,
              {
                status: latestOwnSubmission.status,
                verdict: latestOwnSubmission.verdict,
                language: latestOwnSubmission.language,
                resolvedLanguage: latestOwnSubmission.resolvedLanguage,
              },
              nextVerdict,
            ),
          )
        }
      } catch {
        // 恢复失败不阻塞继续写代码，历史面板刷新时仍会显示错误。
      }
    }

    void restoreLatestAssessmentSubmission()

    return () => {
      cancelled = true
    }
  }, [assessmentAttemptId, level.id])

  useEffect(() => {
    return () => {
      editorRef.current = null
      if (ideLayoutFrameRef.current !== null) {
        window.cancelAnimationFrame(ideLayoutFrameRef.current)
      }
      disposeEditorListeners(editorDisposablesRef.current)
    }
  }, [])

  useEffect(() => {
    window.__spcgCurrentIdeContext = {
      levelId: level.id,
      levelTitle: level.title,
      language: languageMode,
      resolvedLanguage,
      code,
    }

    return () => {
      if (window.__spcgCurrentIdeContext?.levelId === level.id) {
        delete window.__spcgCurrentIdeContext
      }
    }
  }, [level.id, level.title, languageMode, resolvedLanguage, code])

  useEffect(() => {
    setToolbarRenderKey((current) => current + 1)

    const layoutEditor = () => {
      editorRef.current?.layout()
    }

    layoutEditor()
    const animationFrame = window.requestAnimationFrame(layoutEditor)
    const timeout = window.setTimeout(layoutEditor, 260)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.clearTimeout(timeout)
    }
  }, [expanded, outputExpanded, resultsMaximized, layoutVersion])

  useEffect(() => {
    const readLayoutSnapshot = () => {
      const workbenchRect = workbenchRef.current?.getBoundingClientRect()
      const editorShellRect = editorShellRef.current?.getBoundingClientRect()
      const viewport = window.visualViewport

      return [
        Math.round(window.innerWidth),
        Math.round(window.innerHeight),
        Math.round(viewport?.width ?? window.innerWidth),
        Math.round(viewport?.height ?? window.innerHeight),
        window.devicePixelRatio.toFixed(3),
        Math.round(workbenchRect?.width ?? 0),
        Math.round(workbenchRect?.height ?? 0),
        Math.round(editorShellRect?.width ?? 0),
        Math.round(editorShellRect?.height ?? 0),
      ].join(':')
    }

    const refreshLayout = () => {
      if (ideLayoutFrameRef.current !== null) return

      ideLayoutFrameRef.current = window.requestAnimationFrame(() => {
        ideLayoutFrameRef.current = null
        const nextSnapshot = readLayoutSnapshot()

        editorRef.current?.layout()

        if (nextSnapshot !== ideLayoutSnapshotRef.current) {
          ideLayoutSnapshotRef.current = nextSnapshot
          setToolbarRenderKey((current) => current + 1)
        }
      })
    }

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            refreshLayout()
          })

    if (workbenchRef.current) resizeObserver?.observe(workbenchRef.current)
    if (editorShellRef.current) resizeObserver?.observe(editorShellRef.current)

    window.addEventListener('resize', refreshLayout)
    window.addEventListener('orientationchange', refreshLayout)
    window.visualViewport?.addEventListener('resize', refreshLayout)
    window.visualViewport?.addEventListener('scroll', refreshLayout)
    refreshLayout()

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', refreshLayout)
      window.removeEventListener('orientationchange', refreshLayout)
      window.visualViewport?.removeEventListener('resize', refreshLayout)
      window.visualViewport?.removeEventListener('scroll', refreshLayout)
      if (ideLayoutFrameRef.current !== null) {
        window.cancelAnimationFrame(ideLayoutFrameRef.current)
        ideLayoutFrameRef.current = null
      }
    }
  }, [])

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
    disposeEditorListeners(editorDisposablesRef.current)
    editorDisposablesRef.current = [
      editor.onDidFocusEditorText(() => {
        setOutputExpanded(false)
      }),
      editor.onMouseDown(() => {
        setOutputExpanded(false)
      }),
    ]
  }

  function updateCode(nextCode: string) {
    setCode(nextCode)
    writeCachedCode(level.id, languageMode, nextCode)
  }

  function updateLanguageMode(nextValue: string) {
    const nextLanguageMode = normalizeLanguageMode(nextValue)
    const nextCode = readCachedCode(level.id, nextLanguageMode) ?? getStarterCodeForLanguage(level, nextLanguageMode)
    writeCachedLanguageMode(level.id, nextLanguageMode)
    setLanguageMode(nextLanguageMode)
    setCode(nextCode)
    setLastRunCode(nextCode)
    setConsoleOutput('')
    setVerdict(null)
    setDebugInfo([])
    setJudgeProgress(null)
    setSampleProgress(null)
    setLearningFeedback(null)
    setStatus('idle')
  }

  async function runCode() {
    setStatus('judging')
    setVerdict(null)
    setLearningFeedback(null)
    setLastRemoteSubmissionId(null)
    setJudgeProgress(null)
    setSampleProgress(buildLocalSampleProgress(level, 1, 0))
    setOutputExpanded(true)
    setConsoleOutput('')
    setDebugInfo([`Action: Run`, `Language: ${getLanguageLabel(resolvedLanguage)}`, 'Status: running'])
    setLastRunCode(code)
    onRunStart?.()

    try {
      const [runResult, sampleResult] = await Promise.all([
        runCodeAction({
          levelId: level.id,
          code,
          languageMode,
          stdin: usesConsole ? consoleInput : '',
        }),
        runVisiblePublicSamples(),
      ])
      const execution = runResult.execution
      const nextVerdict = buildRunVerdict(level, consoleInput, execution, pickLocalMessage)

      setConsoleOutput(execution.stdout ?? '')
      setDebugInfo([
        `Action: Run`,
        `Language: ${getLanguageLabel(runResult.resolvedLanguage)}`,
        `Status: ${nextVerdict.result}`,
      ])
      setSampleProgress(null)
      setVerdict(nextVerdict)
      setStatus('done')
      onRunComplete?.(sampleResult.samples)
    } catch (error) {
      const message = error instanceof Error ? error.message : '运行失败。'
      const nextVerdict = buildServiceVerdict('Judge Error', message)
      setConsoleOutput('')
      setDebugInfo([`Action: Run`, `Language: ${getLanguageLabel(resolvedLanguage)}`, `Status: Judge Error`])
      setSampleProgress(null)
      setVerdict(nextVerdict)
      setStatus('done')
    }
  }

  async function runVisiblePublicSamples(): Promise<{ samples: SampleRunResultMap }> {
    const samples = level.publicCases.slice(0, 2)
    if (samples.length === 0) {
      setSampleProgress(null)
      return { samples: {} }
    }

    const entries: Array<readonly [string, SampleRunResultMap[string]]> = []

    for (const [index, sample] of samples.entries()) {
      setSampleProgress(buildLocalSampleProgress(level, index + 1, index, samples.length))

      try {
        const runResult = await runCodeAction({
          levelId: level.id,
          code,
          languageMode,
          stdin: sample.input,
        })
        const execution = runResult.execution
        const passed = execution.result === 'AC' && normalizeOutput(execution.stdout) === normalizeOutput(sample.expectedOutput)
        const status: SampleRunResultMap[string]['status'] = execution.result === 'AC' ? (passed ? 'AC' : 'WA') : execution.result
        entries.push([sample.id, { status, passed }])
      } catch {
        entries.push([sample.id, { status: 'Judge Error', passed: false }])
      }

      setSampleProgress(buildLocalSampleProgress(level, index + 2, index + 1, samples.length))
    }

    return { samples: Object.fromEntries(entries) }
  }

  async function submitCode() {
    setStatus('judging')
    setVerdict(null)
    setLastRemoteSubmissionId(null)
    setJudgeProgress(buildSubmissionProgress(level, 'pending'))
    setSampleProgress(null)
    setOutputExpanded(true)
    setLastRunCode(code)
    setConsoleOutput('')
    setDebugInfo([`Action: Submit`, `Language: ${getLanguageLabel(resolvedLanguage)}`, 'Status: submitting'])
    setLearningFeedback(null)
    onRunStart?.()

    try {
      const remoteSubmission = await submitCodeAction({
        levelId: level.id,
        code,
        languageMode,
        assessmentAttemptId,
        assessmentPhase: assessmentAttemptId ? 'realtime' : null,
        judgeMode: assessmentAttemptId ? 'fast' : null,
        maxScore: assessmentItemMaxScore,
      })

      if (remoteSubmission.mode === 'remote') {
        setLastRemoteSubmissionId(remoteSubmission.submissionId)
        if (assessmentAttemptId) void onAssessmentSubmissionSettled?.()
        setJudgeProgress(buildSubmissionProgress(level, remoteSubmission.status))
        setDebugInfo(
          formatRemoteSubmissionDebugInfo(remoteSubmission.submissionId, {
            status: remoteSubmission.status,
            verdict: null,
            language: remoteSubmission.language,
            resolvedLanguage: remoteSubmission.resolvedLanguage,
          }),
        )
        const result = await pollRemoteSubmission(remoteSubmission.submissionId, (nextResult) => {
          setJudgeProgress(nextResult.judgeProgress ?? buildSubmissionProgress(level, nextResult.status))
          setDebugInfo(formatRemoteSubmissionDebugInfo(remoteSubmission.submissionId, nextResult))
        })
        const nextVerdict =
          result.verdict ??
          buildServiceVerdict('Judge Error', result.error ?? '远程判题结果暂未返回。')

        setDebugInfo(formatRemoteSubmissionDebugInfo(remoteSubmission.submissionId, result, nextVerdict))
        setJudgeProgress(null)
        setVerdict(nextVerdict)
        updateLearningFeedback(nextVerdict)
        setStatus('done')
        const sampleResult = await runPublicSamplesAction({
          levelId: level.id,
          code,
          languageMode,
        })
        onRunComplete?.(sampleResult.samples)
        if (assessmentAttemptId) void onAssessmentSubmissionSettled?.()
        if (nextVerdict.result === 'AC') void onAccepted?.()
        void refreshHistory(false)
        return
      }

      const nextVerdict = buildServiceVerdict('Judge Error', remoteSubmission.reason)
      setConsoleOutput('')
      setDebugInfo([`Action: Submit`, `Language: ${getLanguageLabel(resolvedLanguage)}`, `Status: Judge Error`])
      setJudgeProgress(null)
      setVerdict(nextVerdict)
      updateLearningFeedback(nextVerdict)
      setStatus('done')
      void refreshHistory(false)
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : '远程提交失败。'
      const nextVerdict = buildServiceVerdict('Judge Error', message)
      setConsoleOutput('')
      setDebugInfo([`Action: Submit`, `Language: ${getLanguageLabel(resolvedLanguage)}`, `Status: Judge Error`])
      setJudgeProgress(null)
      setVerdict(nextVerdict)
      updateLearningFeedback(nextVerdict)
      setStatus('done')
      void refreshHistory(false)
      return
    }
  }

  function updateLearningFeedback(nextVerdict: Verdict) {
    if (nextVerdict.result === 'AC') {
      setRepairAttemptCount(0)
      setLearningFeedback(
        assessmentAttemptId
          ? buildAssessmentAcceptedLearningFeedback(assessmentNextQuestionTitle, onAssessmentNextQuestion)
          : buildAcceptedLearningFeedback(level.id, stagePath),
      )
      return
    }

    const nextRepairAttemptCount = repairAttemptCount + 1
    setRepairAttemptCount(nextRepairAttemptCount)
    setLearningFeedback(buildRepairLearningFeedback(nextVerdict.result, nextRepairAttemptCount))
  }

  async function openHistory() {
    setHistoryOpen(true)
    await refreshHistory(false)
  }

  async function refreshHistory(selectFirst: boolean) {
    setHistoryStatus('loading')
    setHistoryError('')

    try {
      const result = assessmentAttemptId
        ? await getAssessmentSubmissionHistoryAction({ levelId: level.id, assessmentAttemptId })
        : await getSubmissionHistoryAction(level.id)
      setHistoryItems(result.items)
      if (!result.items.some((item) => item.id === selectedHistoryId)) {
        setSelectedHistoryId(selectFirst ? result.items.find((item) => item.canViewCode)?.id ?? null : null)
      }
      setHistoryStatus(result.error ? 'error' : 'done')
      setHistoryError(result.error ?? '')
    } catch (error) {
      setHistoryStatus('error')
      setHistoryError(error instanceof Error ? error.message : '历史提交读取失败。')
    }
  }

  function loadHistoryCode(item: SubmissionHistoryItem) {
    if (!item.canViewCode || !item.code) return
    const nextLanguageMode = normalizeLanguageMode(item.language)
    writeCachedLanguageMode(level.id, nextLanguageMode)
    setLanguageMode(nextLanguageMode)
    setCode(item.code)
    writeCachedCode(level.id, nextLanguageMode, item.code)
    setLastRunCode(item.code)
    setHistoryOpen(false)
  }

  function formatCurrentCode() {
    const formattedCode = formatCodeForLanguage(code, resolvedLanguage)
    if (formattedCode === code) {
      editorRef.current?.focus()
      return
    }

    updateCode(formattedCode)
    window.requestAnimationFrame(() => {
      editorRef.current?.focus()
      editorRef.current?.layout()
    })
  }

  async function explainSubmissionError(submissionId: string) {
    const previous = analysisBySubmissionId[submissionId]
    setAnalysisBySubmissionId((current) => ({
      ...current,
      [submissionId]: { status: 'loading', analysis: previous?.analysis, cached: previous?.cached },
    }))

    try {
      const result = await explainSubmissionErrorAction({ submissionId })
      if (result.ok) {
        setAnalysisBySubmissionId((current) => ({
          ...current,
          [submissionId]: {
            status: 'done',
            analysis: result.analysis,
            cached: result.cached,
          },
        }))
        void refreshHistory(false)
        return
      }

      setAnalysisBySubmissionId((current) => ({
        ...current,
        [submissionId]: {
          status: 'error',
          analysis: previous?.analysis,
          error: result.error,
          cached: previous?.cached,
        },
      }))
    } catch (error) {
      setAnalysisBySubmissionId((current) => ({
        ...current,
        [submissionId]: {
          status: 'error',
          analysis: previous?.analysis,
          error: error instanceof Error ? error.message : 'AI 错误分析失败。',
          cached: previous?.cached,
        },
      }))
    }
  }

  const currentCanExplain =
    Boolean(lastRemoteSubmissionId) && status === 'done' && canAnalyzeVerdict(verdict)
  const currentAnalysisState = lastRemoteSubmissionId ? analysisBySubmissionId[lastRemoteSubmissionId] : undefined
  const resultSupport = (
    <>
      {learningFeedback ? <LearningFeedbackCard feedback={learningFeedback} /> : null}
      {lastRemoteSubmissionId && currentAnalysisState ? (
        <SubmissionAnalysisPanel
          state={currentAnalysisState}
          onRetry={() => explainSubmissionError(lastRemoteSubmissionId)}
        />
      ) : null}
    </>
  )
  const ideToolButtons = (
    <div key={toolbarRenderKey} className="tool-buttons" aria-label="IDE 工具按钮">
      <button type="button" aria-label="重置代码" title="重置代码" data-tooltip="重置代码" onClick={() => updateCode(level.starterCode)}>
        <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-undo.svg" alt="" />
      </button>
      <button
        type="button"
        aria-label="恢复上次运行代码"
        title="恢复上次运行代码"
        data-tooltip="恢复上次运行代码"
        onClick={() => updateCode(lastRunCode)}
      >
        <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-redo.svg" alt="" />
      </button>
      <button type="button" aria-label="查看历史提交" title="历史提交" data-tooltip="历史提交" onClick={openHistory}>
        <History size={18} strokeWidth={2.4} />
      </button>
      <button type="button" aria-label="自动排版代码" title="自动排版代码" data-tooltip="自动排版代码" onClick={formatCurrentCode}>
        <AlignLeft size={18} strokeWidth={2.4} />
      </button>
      <AlgorithmWhiteboardButton onOpen={() => setWhiteboardOpen(true)} />
      <button
        type="button"
        aria-label="展开编辑器"
        title={expanded ? '收起编辑器' : '展开编辑器'}
        data-tooltip={expanded ? '收起编辑器' : '展开编辑器'}
        onClick={() => setExpanded((value) => !value)}
      >
        <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-expand.svg" alt="" />
      </button>
    </div>
  )

  return (
    <section
      ref={workbenchRef}
      className={[
        'workbench',
        expanded ? 'expanded' : '',
        outputExpanded ? 'output-expanded' : '',
        resultsMaximized ? 'results-maximized' : '',
        historyOpen ? 'history-open' : '',
        selectedHistorySource ? 'history-has-source' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-layout-version={layoutVersion}
    >
      {ideToolButtons}
      <section ref={editorShellRef} className="editor-shell">
        <div className="editor-toolbar">
          <div className="editor-language-control">
            <span>{getLanguageLabel(resolvedLanguage)} Editor</span>
            <select
              aria-label="选择编程语言"
              value={languageMode}
              onChange={(event) => updateLanguageMode(event.target.value)}
            >
              {LANGUAGE_MODES.map((option) => (
                <option key={option} value={option}>
                  {getLanguageLabel(option)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Editor
          className="monaco-surface"
          height="100%"
          language={getMonacoLanguage(resolvedLanguage)}
          path={`${level.id}.${resolvedLanguage}`}
          theme="sublime-monokai"
          value={code}
          beforeMount={configureMonokai}
          onMount={handleEditorMount}
          onChange={(value) => updateCode(value ?? '')}
          loading={<div className="editor-loading">Loading editor...</div>}
          options={{
            autoIndent: 'advanced',
            automaticLayout: true,
            detectIndentation: false,
            formatOnPaste: true,
            formatOnType: true,
            fontFamily: '"SFMono-Regular", "Consolas", "Liberation Mono", monospace',
            fontLigatures: false,
            fontSize: 15,
            insertSpaces: true,
            lineHeight: 24,
            minimap: { enabled: false },
            padding: { top: 14, bottom: 96 },
            renderLineHighlight: 'all',
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            tabSize: 4,
            wordWrap: 'on',
          }}
        />
        <div className="judge-actions editor-actions">
          <button className="asset-button run" type="button" onClick={runCode} disabled={status === 'judging'}>
            <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-play.svg" alt="" />
            Run
          </button>
          <button className="asset-button submit" type="button" onClick={submitCode} disabled={status === 'judging'}>
            <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-star.svg" alt="" />
            {status === 'judging' ? 'Judging' : 'Submit'}
          </button>
        </div>
        {whiteboardOpen ? <AlgorithmWhiteboardModal level={level} onClose={() => setWhiteboardOpen(false)} /> : null}
      </section>

      <section className="results-dock">
        <TestResults
          verdict={verdict}
          status={status}
          progress={sampleProgress ?? judgeProgress}
          progressKind={sampleProgress ? 'sample' : 'test'}
          debugInfo={debugInfo}
          action={
            <>
              {currentCanExplain && lastRemoteSubmissionId ? (
                <button
                  className="ai-analysis-button"
                  type="button"
                  disabled={currentAnalysisState?.status === 'loading'}
                  onClick={() => explainSubmissionError(lastRemoteSubmissionId)}
                >
                  {currentAnalysisState?.status === 'loading' ? '分析中' : 'AI 分析'}
                </button>
              ) : null}
              {status === 'done' && canAnalyzeVerdict(verdict) && !lastRemoteSubmissionId ? (
                <span className="ai-analysis-hint">Submit 后可分析</span>
              ) : null}
              <button
                className="results-dock-toggle"
                type="button"
                aria-label={resultsMaximized ? '收起调试区域' : '展开调试区域'}
                aria-pressed={resultsMaximized}
                title={resultsMaximized ? '收起调试区域' : '展开调试区域'}
                onClick={() => setResultsMaximized((value) => !value)}
              >
                {resultsMaximized ? <ChevronsDown size={16} strokeWidth={2.6} /> : <ChevronsUp size={16} strokeWidth={2.6} />}
              </button>
            </>
          }
          analysis={resultSupport}
        />
        <section className="console-panel">
          <div className="console-column">
            <label htmlFor={`${level.id}-stdin`}>stdin</label>
            <textarea
              id={`${level.id}-stdin`}
              value={consoleInput}
              onChange={(event) => setConsoleInput(event.target.value)}
              placeholder={usesConsole ? '输入运行数据' : '本题无输入'}
              spellCheck={false}
            />
          </div>
          <div className="console-column">
            <span>stdout</span>
            <pre>{consoleOutput}</pre>
          </div>
        </section>
      </section>

      {historyOpen ? (
        <aside className="submission-history-panel" aria-label="历史提交记录">
          <div className="history-panel-head">
            <div>
              <span>History</span>
              <strong>提交记录</strong>
            </div>
            <div className="history-panel-actions">
              <button type="button" aria-label="刷新历史提交" title="刷新历史提交" onClick={() => refreshHistory(false)}>
                <RefreshCw size={16} strokeWidth={2.4} />
              </button>
              <button type="button" aria-label="关闭历史提交" title="关闭历史提交" onClick={() => setHistoryOpen(false)}>
                <X size={18} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          <div className="history-panel-body">
            {selectedHistorySource ? (
              <div className="history-detail">
                <div className="history-detail-meta">
                  <FileCode2 size={18} strokeWidth={2.3} />
                  <div>
                    <strong>{formatHistoryResult(selectedHistorySource)}</strong>
                    <span>
                      {formatHistoryCases(selectedHistorySource.verdict)} · {formatHistoryLanguage(selectedHistorySource)} ·{' '}
                      {formatHistoryTime(selectedHistorySource.createdAt)}
                    </span>
                  </div>
                  <div className="history-detail-actions">
                    {canAnalyzeHistoryItem(selectedHistorySource) ? (
                      <button
                        type="button"
                        disabled={analysisBySubmissionId[selectedHistorySource.id]?.status === 'loading'}
                        onClick={() => explainSubmissionError(selectedHistorySource.id)}
                      >
                        {analysisBySubmissionId[selectedHistorySource.id]?.status === 'loading' ? '分析中' : 'AI 分析'}
                      </button>
                    ) : null}
                    <button type="button" onClick={() => loadHistoryCode(selectedHistorySource)}>
                      Load
                    </button>
                  </div>
                </div>
                <pre>{selectedHistorySource.code}</pre>
                <SubmissionAnalysisPanel
                  state={analysisBySubmissionId[selectedHistorySource.id]}
                  fallback={selectedHistorySource.errorAnalysis}
                  onRetry={() => explainSubmissionError(selectedHistorySource.id)}
                />
              </div>
            ) : null}

            <div className="history-list">
              <div className="history-table-head" aria-hidden="true">
                <span>状态</span>
                <span>提交人</span>
                <span>提交时间</span>
                <span>源码</span>
              </div>
              {historyStatus === 'loading' && historyItems.length === 0 ? <p className="history-empty">Loading...</p> : null}
              {historyError ? <p className="history-error">{historyError}</p> : null}
              {historyStatus !== 'loading' && historyItems.length === 0 && !historyError ? (
                <p className="history-empty">暂无提交记录</p>
              ) : null}
              {historyItems.map((item) => (
                <button
                  className={selectedHistory?.id === item.id ? 'history-item active' : 'history-item'}
                  type="button"
                  key={item.id}
                  onClick={() => setSelectedHistoryId(item.canViewCode ? item.id : null)}
                >
                  <span className="history-cell history-cell-status">
                    <span className={`history-verdict history-verdict-${statusClassName(item.verdict?.result ?? item.status)}`}>
                      {formatHistoryResult(item)}
                    </span>
                  </span>
                  <strong className="history-cell history-cell-owner">{formatSubmissionOwner(item)}</strong>
                  <span className="history-cell history-cell-time">{formatHistoryTime(item.createdAt)}</span>
                  <em className={item.canViewCode ? 'history-source-allowed' : 'history-source-locked'}>
                    {item.canViewCode ? '源码' : '仅基础信息'}
                  </em>
                </button>
              ))}
            </div>
          </div>
        </aside>
      ) : null}
    </section>
  )
}

function SubmissionAnalysisPanel({
  state,
  fallback,
  onRetry,
}: {
  state?: SubmissionAnalysisState
  fallback?: SubmissionErrorAnalysis | null
  onRetry: () => void
}) {
  const analysis = state?.analysis ?? fallback?.analysis
  const cached = state?.cached ?? Boolean(fallback)

  if (state?.status === 'loading') {
    return (
      <section className="ai-analysis-panel loading">
        <div className="ai-analysis-panel-head">
          <strong>AI 错误分析</strong>
          <span>生成中...</span>
        </div>
        <p>正在结合本次提交代码和判题结果分析错误原因。</p>
      </section>
    )
  }

  if (state?.status === 'error') {
    return (
      <section className="ai-analysis-panel error">
        <div className="ai-analysis-panel-head">
          <strong>AI 错误分析</strong>
          <button type="button" onClick={onRetry}>
            重试
          </button>
        </div>
        <p>{state.error}</p>
      </section>
    )
  }

  if (!analysis) return null

  return (
    <section className="ai-analysis-panel">
      <div className="ai-analysis-panel-head">
        <strong>AI 错误分析</strong>
        <span>{cached ? '已保存' : '新生成'}</span>
      </div>
      <p>{analysis.summary}</p>
      <dl>
        <div>
          <dt>错在哪里</dt>
          <dd>{analysis.whereWrong ?? analysis.summary}</dd>
        </div>
        <div>
          <dt>原因分析</dt>
          <dd>
            <ul>
              {readReasonList(analysis).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </dd>
        </div>
        {analysis.lineHints.length > 0 ? (
          <div>
            <dt>定位提示</dt>
            <dd>
              <ul>
                {analysis.lineHints.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        {analysis.nextSteps.length > 0 ? (
          <div>
            <dt>下一步</dt>
            <dd>
              <ul>
                {analysis.nextSteps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>知识点</dt>
          <dd>{analysis.fixedConcept}</dd>
        </div>
      </dl>
    </section>
  )
}

function readReasonList(analysis: CodeErrorAnalysis): string[] {
  return analysis.reasonList && analysis.reasonList.length > 0 ? analysis.reasonList : [analysis.likelyCause]
}

function LearningFeedbackCard({ feedback }: { feedback: LearningFeedback }) {
  return (
    <section className={`learning-feedback-card ${feedback.kind}`}>
      <div>
        <strong>{feedback.title}</strong>
        <p>{feedback.body}</p>
      </div>
      {feedback.steps && feedback.steps.length > 0 ? (
        <ul>
          {feedback.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      ) : null}
      {feedback.nextHref && feedback.nextLabel ? (
        <Link href={feedback.nextHref}>{feedback.nextLabel}</Link>
      ) : null}
      {feedback.nextAction && feedback.nextActionLabel ? (
        <button type="button" onClick={feedback.nextAction}>
          {feedback.nextActionLabel}
        </button>
      ) : null}
    </section>
  )
}

function buildCompletedProgressVerdict(level: Level, progress: Progress): Verdict {
  const totalCases = Math.max(1, level.publicCases.length + level.hiddenCount)

  return {
    result: 'AC',
    passedCases: totalCases,
    totalCases,
    maxRuntimeMs: progress.bestRuntimeMs ?? 0,
    failedCaseIndex: null,
    childFriendlyMessage: '这道题已经 AC，可回看题解、复盘代码，或继续挑战下一题。',
  }
}

function formatCompletedProgressDebugInfo(progress: Progress): string[] {
  const lines = ['Action: Previous Submit', 'Status: AC']

  if (progress.bestRuntimeMs !== null) {
    lines.push(`Runtime: ${progress.bestRuntimeMs} ms`)
  }

  if (progress.attemptCount > 0) {
    lines.push(`Attempts: ${progress.attemptCount}`)
  }

  if (progress.lastSubmittedAt) {
    lines.push(`Last submit: ${new Date(progress.lastSubmittedAt).toLocaleString('zh-CN')}`)
  }

  return lines
}

function buildPreviouslyAcceptedLearningFeedback(levelId: string, stagePath?: StagePath): LearningFeedback {
  const feedback = buildAcceptedLearningFeedback(levelId, stagePath)

  return {
    ...feedback,
    title: feedback.title === 'AC，通过啦' ? '已 AC' : `已 AC · ${feedback.title}`,
  }
}

function buildAssessmentAcceptedLearningFeedback(
  nextQuestionTitle?: string | null,
  onNextQuestion?: () => void,
): LearningFeedback {
  if (onNextQuestion && nextQuestionTitle) {
    return {
      kind: 'accepted',
      title: 'AC，通过啦',
      body: '考试中这道题已经通过。继续保持节奏，建议马上进入下一题。',
      nextActionLabel: `下一题：${nextQuestionTitle}`,
      nextAction: onNextQuestion,
    }
  }

  return {
    kind: 'accepted',
    title: 'AC，通过啦',
    body: '这是试卷中的最后一道题。可以回到题目列表检查其他题，确认后再交卷。',
  }
}

function buildAcceptedLearningFeedback(levelId: string, stagePath?: StagePath): LearningFeedback {
  if (!stagePath) {
    return {
      kind: 'accepted',
      title: 'AC，通过啦',
      body: '先把这道题的关键做法记住，再去地图继续推进。',
      nextHref: '/map',
      nextLabel: '回地图',
    }
  }

  const passedIds = new Set(stagePath.passedLevelIds)
  passedIds.add(levelId)
  const current = stagePath.items.find((item) => item.levelId === levelId)
  const mainlinePassed = stagePath.items.filter((item) => item.position <= 3 && passedIds.has(item.levelId)).length
  const totalPassed = stagePath.items.filter((item) => passedIds.has(item.levelId)).length
  const nextUnpassed = stagePath.items.find((item) => item.position > (current?.position ?? 0) && !passedIds.has(item.levelId))
  const nextMainline = stagePath.items.find((item) => item.position <= 3 && !passedIds.has(item.levelId))
  const recommended = nextMainline ?? nextUnpassed

  if (totalPassed >= 5) {
    return {
      kind: 'accepted',
      title: '本关完全掌握',
      body: '5 道题已经全部通过，可以放心进入下一关，也可以回顾题解总结这一关的模型。',
      nextHref: '/map',
      nextLabel: '回地图',
    }
  }

  if (mainlinePassed >= 3) {
    return {
      kind: 'accepted',
      title: totalPassed >= 4 ? '掌握良好' : '本关主线已完成',
      body:
        totalPassed >= 4
          ? '提高题也通过了，离完全掌握只差最后一步。'
          : '前 3 道主线题已通过，可以进入下一关，也可以继续挑战提高题。',
      nextHref: recommended ? `/level/${recommended.levelId}` : '/map',
      nextLabel: recommended ? `挑战：${recommended.title}` : '回地图',
    }
  }

  if (recommended) {
    return {
      kind: 'accepted',
      title: '继续下一题',
      body: `下一步建议完成 ${getProblemSetItemDisplayModeLabel(recommended.displayMode)}，把这关的主线能力补齐。`,
      nextHref: `/level/${recommended.levelId}`,
      nextLabel: `去做：${recommended.title}`,
    }
  }

  return {
    kind: 'accepted',
    title: 'AC，通过啦',
    body: '这道题已经完成，可以回地图选择下一关。',
    nextHref: '/map',
    nextLabel: '回地图',
  }
}

function buildRepairLearningFeedback(result: Verdict['result'], attemptCount: number): LearningFeedback {
  if (result === 'CE') {
    return {
      kind: 'repair',
      title: '先修编译错误',
      body: '代码还没有编译通过，优先检查变量名、分号、括号配对和头文件。',
      steps: ['从第一条编译错误开始改，不要一次改太多处', '确认变量是否先声明再使用', '改完后先 Run 样例，再 Submit'],
    }
  }

  if (result === 'RE') {
    return {
      kind: 'repair',
      title: '先定位运行错误',
      body: '程序运行中断，通常和越界、除以 0、空输入或递归过深有关。',
      steps: ['检查数组下标范围', '检查分母是否可能为 0', '用最小样例手动走一遍变量变化'],
    }
  }

  if (result === 'TLE' || result === 'MLE') {
    return {
      kind: 'repair',
      title: result === 'TLE' ? '先减少重复计算' : '先减少内存使用',
      body: result === 'TLE' ? '当前算法可能跑太久，试试减少循环层数或重复计算。' : '当前程序占用内存太多，检查数组规模和缓存数量。',
      steps: ['回看题目数据范围', '估算时间复杂度和空间复杂度', '优先优化最外层重复逻辑'],
    }
  }

  if (attemptCount <= 1) {
    return {
      kind: 'repair',
      title: '先把这题修到 AC',
      body: '不要急着换题，先用公开样例确认题意和输出格式。',
      steps: ['重新跑样例，逐字对照输出', '检查边界：0、1、最大值、相等值', '把失败样例在纸上或画板里手算一遍'],
    }
  }

  if (attemptCount === 2) {
    return {
      kind: 'repair',
      title: '用提示或画板定位',
      body: '第二次没过，说明可能不是简单格式问题。把变量变化画出来，会更快找到分叉点。',
      steps: ['打开题目提示，先看第一条', '用逻辑画板画数组、表格或流程', '只改一个怀疑点，再重新提交'],
    }
  }

  return {
    kind: 'repair',
    title: '建议请求分析',
    body: '已经连续多次没过，适合让 AI 或老师帮你定位“错在哪里”，但仍然由你自己修到 AC。',
    steps: ['点击 AI 分析查看错误位置', '查看题解视频或关键题解，不直接复制代码', '把本次提交和你的思路发给老师'],
  }
}

function buildRunVerdict(
  level: Level,
  stdin: string,
  execution: Awaited<ReturnType<typeof runCodeAction>>['execution'],
  childMessage: (result: Verdict['result']) => string,
): Verdict {
  const matchingCase = level.publicCases.find((sample) => normalizeOutput(sample.input) === normalizeOutput(stdin))
  const result =
    execution.result !== 'AC'
      ? execution.result
      : matchingCase && normalizeOutput(execution.stdout) !== normalizeOutput(matchingCase.expectedOutput)
        ? 'WA'
        : 'AC'

  return {
    result,
    passedCases: result === 'AC' ? 1 : 0,
    totalCases: 1,
    maxRuntimeMs: execution.maxRuntimeMs,
    failedCaseIndex: result === 'AC' ? null : 0,
    childFriendlyMessage: childMessage(result),
    ...(execution.errorDetail ? { errorDetail: execution.errorDetail } : {}),
  }
}

function buildSubmissionProgress(level: Level, status: SubmissionPollResult['status'] | 'pending' | 'judging'): JudgeProgress | null {
  if (status !== 'pending' && status !== 'judging') return null

  const totalCases = Math.max(0, level.publicCases.length + level.hiddenCount)
  return buildJudgeProgress({
    phase: status === 'pending' ? 'queued' : 'judging',
    currentCaseIndex: status === 'judging' && totalCases > 0 ? 1 : null,
    runningCaseRange: null,
    completedCases: 0,
    totalCases,
  })
}

function buildLocalSampleProgress(
  level: Level,
  currentCaseIndex: number,
  completedCases: number,
  totalCases = Math.min(2, level.publicCases.length),
): JudgeProgress | null {
  if (totalCases <= 0) return null

  return buildJudgeProgress({
    phase: completedCases >= totalCases ? 'completed' : 'judging',
    currentCaseIndex: currentCaseIndex <= totalCases ? currentCaseIndex : null,
    runningCaseRange: null,
    completedCases,
    totalCases,
  })
}

function buildJudgeProgress(progress: Omit<JudgeProgress, 'updatedAt'>): JudgeProgress {
  return {
    ...progress,
    updatedAt: new Date().toISOString(),
  }
}

function getDefaultConsoleInput(level: Level): string {
  return level.publicCases.find((sample) => sample.input.trim().length > 0)?.input ?? ''
}

async function pollRemoteSubmission(
  submissionId: string,
  onUpdate: (result: SubmissionPollResult) => void,
): Promise<SubmissionPollResult> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const result = await getSubmissionVerdictAction(submissionId)
    onUpdate(result)
    if (result.status === 'done' || result.status === 'error' || result.status === 'missing') {
      return result
    }

    await sleep(attempt < 5 ? 500 : 1000)
  }

  return {
    status: 'error',
    verdict: buildServiceVerdict('Judge Error', '远程判题等待超时，请稍后在进度页查看结果或重新提交。'),
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function buildServiceVerdict(result: Verdict['result'], message: string): Verdict {
  return {
    result,
    passedCases: 0,
    totalCases: 0,
    maxRuntimeMs: 0,
    failedCaseIndex: null,
    childFriendlyMessage: message,
    errorDetail: message,
  }
}

function formatRemoteSubmissionDebugInfo(submissionId: string, result: SubmissionPollResult, verdict?: Verdict): string[] {
  const visibleStatus = verdict?.result ?? result.verdict?.result ?? formatCompilerStatus(result.status)
  const visibleVerdict = verdict ?? result.verdict
  const lines = [`Action: Submit`, `Submitted: ${submissionId}`, `Status: ${visibleStatus}`]

  if (result.resolvedLanguage) {
    lines.push(`Language: ${getLanguageLabel(result.resolvedLanguage)}`)
  }

  if (visibleVerdict) {
    lines.push(`Cases: ${visibleVerdict.passedCases}/${visibleVerdict.totalCases}`)
    lines.push(`Runtime: ${visibleVerdict.maxRuntimeMs} ms`)
  }

  if (visibleVerdict?.errorDetail) lines.push(visibleVerdict.errorDetail)
  if (result.reward && result.reward.ledgerIds.length > 0) {
    const rewards = []
    if (result.reward.coinDelta > 0) rewards.push(`金币 +${result.reward.coinDelta}`)
    if (result.reward.garlicDelta > 0) rewards.push(`蒜粒 +${result.reward.garlicDelta}`)
    for (const item of result.reward.items) {
      rewards.push(`${item.name} +${item.quantity}`)
    }
    if (rewards.length > 0) lines.push(`Rewards: ${rewards.join(', ')}`)
    if (result.reward.rankBefore !== result.reward.rankAfter) {
      lines.push(`Rank up: ${result.reward.rankBefore} -> ${result.reward.rankAfter}`)
    }
    if (result.reward.title) lines.push(`Title: ${result.reward.title}`)
  }
  return lines
}

function formatCompilerStatus(status: SubmissionPollResult['status'] | 'pending' | 'judging'): string {
  if (status === 'pending') return 'pending'
  if (status === 'judging') return 'judging'
  return 'Judge Error'
}

function formatHistoryResult(item: SubmissionHistoryItem): string {
  if (item.verdict) return item.verdict.result
  if (item.status === 'pending' || item.status === 'judging') return item.status
  return 'Judge Error'
}

function formatHistoryCases(verdict: Verdict | null): string {
  if (!verdict) return 'No result'
  return `${verdict.passedCases}/${verdict.totalCases} cases`
}

function formatHistoryLanguage(item: SubmissionHistoryItem): string {
  const selected = getLanguageLabel(normalizeLanguageMode(item.language))
  const resolved = item.resolvedLanguage ? getLanguageLabel(item.resolvedLanguage) : selected
  return selected === resolved ? resolved : `${selected} -> ${resolved}`
}

function formatSubmissionOwner(item: SubmissionHistoryItem): string {
  if (item.canViewCode) return '我'
  return item.userDisplayName ?? item.userEmail ?? shortSubmissionId(item.userId)
}

function formatHistoryTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function canAnalyzeVerdict(verdict: Verdict | null): boolean {
  return Boolean(verdict && verdict.result !== 'AC')
}

function canAnalyzeHistoryItem(item: SubmissionHistoryItem): boolean {
  return item.canViewCode && item.status === 'done' && canAnalyzeVerdict(item.verdict)
}

function shortSubmissionId(id: string): string {
  return id.slice(0, 8)
}

function statusClassName(status: string): string {
  return status.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function languageModeCacheKey(levelId: string): string {
  return `spcg:language:${levelId}`
}

function codeCacheKey(levelId: string, languageMode: LanguageMode): string {
  return `spcg:code:${levelId}:${languageMode}`
}

function readCachedLanguageMode(levelId: string): LanguageMode {
  if (typeof window === 'undefined') return 'auto'

  try {
    return normalizeLanguageMode(window.localStorage.getItem(languageModeCacheKey(levelId)))
  } catch {
    return 'auto'
  }
}

function writeCachedLanguageMode(levelId: string, languageMode: LanguageMode) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(languageModeCacheKey(levelId), languageMode)
  } catch {
    // Local storage can be disabled in private browsing; editing should still work.
  }
}

function readCachedCode(levelId: string, languageMode: LanguageMode): string | null {
  if (typeof window === 'undefined') return null

  try {
    const value = window.localStorage.getItem(codeCacheKey(levelId, languageMode))
    if (value && value.trim().length > 0) return value

    if (languageMode === 'auto') {
      const legacyValue = window.localStorage.getItem(`spcg:code:${levelId}`)
      if (legacyValue && legacyValue.trim().length > 0) return legacyValue
    }

    return value && value.trim().length > 0 ? value : null
  } catch {
    return null
  }
}

function writeCachedCode(levelId: string, languageMode: LanguageMode, code: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(codeCacheKey(levelId, languageMode), code)
  } catch {
    // Local storage can be disabled in private browsing; editing should still work.
  }
}

function formatCodeForLanguage(source: string, language: ResolvedLanguage): string {
  if (!source.trim()) return source
  if (language === 'python3') return formatPythonCode(source)
  return formatBraceLanguageCode(source)
}

function formatBraceLanguageCode(source: string): string {
  const lines = normalizeEditorNewlines(source).split('\n')
  const formattedLines: string[] = []
  let indentLevel = 0
  let inBlockComment = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.length === 0) {
      formattedLines.push('')
      continue
    }

    const syntaxState = stripCStyleSyntaxForIndent(trimmed, inBlockComment)
    inBlockComment = syntaxState.inBlockComment
    const syntax = syntaxState.text.trim()
    const preprocessor = trimmed.startsWith('#')
    const accessSpecifier = /^(?:public|private|protected)\s*:/.test(syntax)
    const caseLabel = /^(?:case\b[\s\S]*:|default\s*:)/.test(syntax)
    let lineIndent = indentLevel

    if (preprocessor) {
      lineIndent = 0
    } else {
      if (/^(?:\}|\)|\])/.test(syntax)) lineIndent = Math.max(0, lineIndent - 1)
      if (accessSpecifier || caseLabel) lineIndent = Math.max(0, lineIndent - 1)
    }

    formattedLines.push(`${indentText(lineIndent)}${trimmed}`)

    if (!preprocessor) {
      const braceDelta = countCharacters(syntax, '{') - countCharacters(syntax, '}')
      indentLevel = Math.max(0, indentLevel + braceDelta)
      if (caseLabel && braceDelta === 0) indentLevel = Math.max(indentLevel, lineIndent + 1)
    }
  }

  return formattedLines.join('\n')
}

function formatPythonCode(source: string): string {
  const lines = normalizeEditorNewlines(source).split('\n')
  const formattedLines: string[] = []
  let indentLevel = 0
  let pendingTerminalDedent = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.length === 0) {
      formattedLines.push('')
      continue
    }

    const syntax = stripPythonSyntaxForIndent(trimmed).trim()
    const blockContinuation = /^(?:elif|else|except|finally)\b/.test(syntax)
    if (blockContinuation || pendingTerminalDedent) {
      indentLevel = Math.max(0, indentLevel - 1)
      pendingTerminalDedent = false
    }

    formattedLines.push(`${indentText(indentLevel)}${trimmed}`)

    if (endsPythonBlock(syntax)) {
      indentLevel += 1
      pendingTerminalDedent = false
      continue
    }

    if (isPythonTerminalStatement(syntax)) {
      pendingTerminalDedent = true
    }
  }

  return formattedLines.join('\n')
}

function normalizeEditorNewlines(source: string): string {
  return source.replace(/\r\n?/g, '\n')
}

function indentText(level: number): string {
  return '    '.repeat(Math.max(0, level))
}

function countCharacters(value: string, character: string): number {
  let count = 0
  for (const current of value) {
    if (current === character) count += 1
  }
  return count
}

function stripCStyleSyntaxForIndent(line: string, initialBlockComment: boolean): { text: string; inBlockComment: boolean } {
  let text = ''
  let inBlockComment = initialBlockComment
  let index = 0

  while (index < line.length) {
    const current = line[index]
    const next = line[index + 1]

    if (inBlockComment) {
      if (current === '*' && next === '/') {
        inBlockComment = false
        index += 2
      } else {
        index += 1
      }
      continue
    }

    if (current === '/' && next === '*') {
      inBlockComment = true
      index += 2
      continue
    }

    if (current === '/' && next === '/') break

    if (current === '"' || current === "'") {
      const endIndex = skipQuotedValue(line, index, current)
      text += current === '"' ? '""' : "''"
      index = endIndex
      continue
    }

    text += current
    index += 1
  }

  return { text, inBlockComment }
}

function stripPythonSyntaxForIndent(line: string): string {
  let text = ''
  let index = 0

  while (index < line.length) {
    const current = line[index]

    if (current === '#') break

    if (current === '"' || current === "'") {
      const tripleQuote = line.slice(index, index + 3) === current.repeat(3)
      const endIndex = tripleQuote ? skipTripleQuotedValue(line, index, current) : skipQuotedValue(line, index, current)
      text += tripleQuote ? `${current.repeat(3)}${current.repeat(3)}` : `${current}${current}`
      index = endIndex
      continue
    }

    text += current
    index += 1
  }

  return text
}

function skipQuotedValue(line: string, startIndex: number, quote: string): number {
  let index = startIndex + 1

  while (index < line.length) {
    if (line[index] === '\\') {
      index += 2
      continue
    }

    if (line[index] === quote) return index + 1
    index += 1
  }

  return line.length
}

function skipTripleQuotedValue(line: string, startIndex: number, quote: string): number {
  const terminator = quote.repeat(3)
  const endIndex = line.indexOf(terminator, startIndex + 3)
  return endIndex === -1 ? line.length : endIndex + 3
}

function endsPythonBlock(syntax: string): boolean {
  return /:\s*(?:#.*)?$/.test(syntax)
}

function isPythonTerminalStatement(syntax: string): boolean {
  return /^(?:return|break|continue|pass|raise)\b/.test(syntax)
}

function getStarterCodeForLanguage(level: Level, languageMode: LanguageMode): string {
  if (languageMode === 'c') return ''
  if (languageMode === 'python3') return ''
  return level.starterCode
}

function disposeEditorListeners(disposables: Array<{ dispose: () => void }>) {
  while (disposables.length > 0) {
    disposables.pop()?.dispose()
  }
}

const configureMonokai: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('sublime-monokai', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'F8F8F2', background: '272822' },
      { token: 'comment', foreground: '75715E', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'F92672' },
      { token: 'number', foreground: 'AE81FF' },
      { token: 'string', foreground: 'E6DB74' },
      { token: 'type', foreground: '66D9EF', fontStyle: 'italic' },
      { token: 'identifier', foreground: 'F8F8F2' },
      { token: 'delimiter', foreground: 'F8F8F2' },
    ],
    colors: {
      'editor.background': '#272822',
      'editor.foreground': '#F8F8F2',
      'editorCursor.foreground': '#F8F8F0',
      'editorLineNumber.foreground': '#8F908A',
      'editorLineNumber.activeForeground': '#F8F8F2',
      'editor.selectionBackground': '#49483E',
      'editor.inactiveSelectionBackground': '#3E3D32',
      'editor.lineHighlightBackground': '#3E3D32',
      'editorIndentGuide.background1': '#3B3A32',
      'editorIndentGuide.activeBackground1': '#9D550F',
    },
  })
}

function pickLocalMessage(result: Verdict['result']) {
  const messages: Record<Verdict['result'], string> = {
    AC: '通过啦！这段代码已经完成任务。',
    WA: '还有测试点没过，先对照公开样例看输出格式。',
    CE: '代码还没编译通过，检查括号、分号或变量名。',
    RE: '程序运行时遇到意外，看看除以 0、越界或输入。',
    TLE: '代码跑太久了，试试减少重复计算。',
    MLE: '程序使用的内存太多了，试试减少数组或缓存的规模。',
    PE: '输出格式还不完全正确，检查空格、换行和标点。',
    'Judge Error': '判题服务遇到问题，请稍后再试。',
  }

  return messages[result]
}
