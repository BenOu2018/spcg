'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Editor, type BeforeMount, type OnMount } from '@monaco-editor/react'
import { ChevronsDown, ChevronsUp, FileCode2, History, RefreshCw, X } from 'lucide-react'
import type { CodeErrorAnalysis, Level, StatementAsset, SubmissionErrorAnalysis, Verdict } from '@spcg/shared/types'
import { normalizeOutput } from '@spcg/shared/judge'
import {
  LANGUAGE_MODES,
  getLanguageLabel,
  getMonacoLanguage,
  normalizeLanguageMode,
  resolveLanguageMode,
  type LanguageMode,
} from '@spcg/shared/language-config'
import {
  explainSubmissionErrorAction,
  getSubmissionHistoryAction,
  getSubmissionVerdictAction,
  runCodeAction,
  runPublicSamplesAction,
  submitCodeAction,
} from '@/app/level/actions'
import { AlgorithmWhiteboardButton, AlgorithmWhiteboardModal } from '@/components/AlgorithmWhiteboard'
import { TestResults } from '@/components/TestResults'
import type { SampleRunResultMap } from '@/components/sample-run'

type SubmissionPollResult = Awaited<ReturnType<typeof getSubmissionVerdictAction>>
type SubmissionHistoryResult = Awaited<ReturnType<typeof getSubmissionHistoryAction>>
type SubmissionHistoryItem = SubmissionHistoryResult['items'][number]
type SubmissionAnalysisState =
  | { status: 'loading'; analysis?: CodeErrorAnalysis; error?: string; cached?: boolean }
  | { status: 'done'; analysis: CodeErrorAnalysis; error?: string; cached?: boolean }
  | { status: 'error'; analysis?: CodeErrorAnalysis; error: string; cached?: boolean }

type CodeWorkspaceProps = {
  level: Level
  layoutVersion?: number
  onRunStart?: () => void
  onRunComplete?: (sampleResults: SampleRunResultMap) => void
  onAccepted?: () => void | Promise<void>
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

export function CodeWorkspace({ level, layoutVersion = 0, onRunStart, onRunComplete, onAccepted }: CodeWorkspaceProps) {
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
  const [lastRemoteSubmissionId, setLastRemoteSubmissionId] = useState<string | null>(null)
  const [analysisBySubmissionId, setAnalysisBySubmissionId] = useState<Record<string, SubmissionAnalysisState>>({})
  const [historyOpen, setHistoryOpen] = useState(false)
  const [whiteboardOpen, setWhiteboardOpen] = useState(false)
  const [historyItems, setHistoryItems] = useState<SubmissionHistoryItem[]>([])
  const [historyStatus, setHistoryStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [historyError, setHistoryError] = useState('')
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [statementPreviewState, setStatementPreviewState] = useState<'hidden' | 'visible' | 'leaving'>('hidden')
  const editorDisposablesRef = useRef<Array<{ dispose: () => void }>>([])
  const statementPreviewHideTimeoutRef = useRef<number | null>(null)
  const statementPreviewSettleTimeoutRef = useRef<number | null>(null)
  const statementPreviewAsset = useMemo(() => pickStatementPreviewAsset(level.statementAssets), [level.statementAssets])
  const selectedHistory = historyItems.find((item) => item.id === selectedHistoryId) ?? historyItems[0] ?? null
  const resolvedLanguage = useMemo(() => resolveLanguageMode(languageMode, code), [languageMode, code])
  const usesConsole = useMemo(
    () =>
      /\b(?:cin|scanf|input)\b/.test(code) || level.publicCases.some((sample) => sample.input.trim().length > 0),
    [code, level],
  )

  useEffect(() => {
    const cachedLanguage = readCachedLanguageMode(level.id)
    const cachedCode = readCachedCode(level.id, cachedLanguage)
    const restoredCode = cachedCode ?? getStarterCodeForLanguage(level, cachedLanguage)
    const hasEditedCache = Boolean(cachedCode && cachedCode !== level.starterCode)
    setLanguageMode(cachedLanguage)
    setCode(restoredCode)
    setLastRunCode(restoredCode)
    setConsoleInput(getDefaultConsoleInput(level))
    setConsoleOutput('')
    setDebugInfo([])
    setVerdict(null)
    setStatus('idle')
    setOutputExpanded(false)
    setResultsMaximized(false)
    setLastRemoteSubmissionId(null)
    setAnalysisBySubmissionId({})
    setHistoryOpen(false)
    setWhiteboardOpen(false)
    setHistoryItems([])
    setHistoryStatus('idle')
    setHistoryError('')
    setSelectedHistoryId(null)
    if (hasEditedCache) setStatementPreviewState('hidden')
  }, [level])

  useEffect(() => {
    return () => {
      disposeEditorListeners(editorDisposablesRef.current)
      clearStatementPreviewHideTimeout(statementPreviewHideTimeoutRef)
      clearStatementPreviewHideTimeout(statementPreviewSettleTimeoutRef)
    }
  }, [])

  useEffect(() => {
    clearStatementPreviewHideTimeout(statementPreviewHideTimeoutRef)
    clearStatementPreviewHideTimeout(statementPreviewSettleTimeoutRef)
    if (!statementPreviewAsset || hasEditedCachedCodeForAnyLanguage(level)) {
      setStatementPreviewState('hidden')
      return
    }

    setStatementPreviewState('visible')
    statementPreviewHideTimeoutRef.current = window.setTimeout(() => {
      setStatementPreviewState((current) => (current === 'visible' ? 'leaving' : current))
      statementPreviewHideTimeoutRef.current = null
      statementPreviewSettleTimeoutRef.current = window.setTimeout(() => {
        setStatementPreviewState('hidden')
        statementPreviewSettleTimeoutRef.current = null
      }, 980)
    }, 4000)

    return () => {
      clearStatementPreviewHideTimeout(statementPreviewHideTimeoutRef)
      clearStatementPreviewHideTimeout(statementPreviewSettleTimeoutRef)
    }
  }, [level.id, level.starterCode, statementPreviewAsset])

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

  const handleEditorMount: OnMount = (editor) => {
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
    if (nextCode !== level.starterCode) {
      clearStatementPreviewHideTimeout(statementPreviewHideTimeoutRef)
      clearStatementPreviewHideTimeout(statementPreviewSettleTimeoutRef)
      setStatementPreviewState('hidden')
    }
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
    setStatus('idle')
  }

  async function runCode() {
    setStatus('judging')
    setVerdict(null)
    setLastRemoteSubmissionId(null)
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
        runPublicSamplesAction({
          levelId: level.id,
          code,
          languageMode,
        }),
      ])
      const execution = runResult.execution
      const nextVerdict = buildRunVerdict(level, consoleInput, execution, pickLocalMessage)

      setConsoleOutput(execution.stdout ?? '')
      setDebugInfo([
        `Action: Run`,
        `Language: ${getLanguageLabel(runResult.resolvedLanguage)}`,
        `Status: ${nextVerdict.result}`,
      ])
      setVerdict(nextVerdict)
      setStatus('done')
      onRunComplete?.(sampleResult.samples)
    } catch (error) {
      const message = error instanceof Error ? error.message : '运行失败。'
      const nextVerdict = buildServiceVerdict('Judge Error', message)
      setConsoleOutput('')
      setDebugInfo([`Action: Run`, `Language: ${getLanguageLabel(resolvedLanguage)}`, `Status: Judge Error`])
      setVerdict(nextVerdict)
      setStatus('done')
    }
  }

  async function submitCode() {
    setStatus('judging')
    setVerdict(null)
    setLastRemoteSubmissionId(null)
    setOutputExpanded(true)
    setLastRunCode(code)
    setConsoleOutput('')
    setDebugInfo([`Action: Submit`, `Language: ${getLanguageLabel(resolvedLanguage)}`, 'Status: submitting'])
    onRunStart?.()

    try {
      const remoteSubmission = await submitCodeAction({
        levelId: level.id,
        code,
        languageMode,
      })

      if (remoteSubmission.mode === 'remote') {
        setLastRemoteSubmissionId(remoteSubmission.submissionId)
        setDebugInfo(
          formatRemoteSubmissionDebugInfo(remoteSubmission.submissionId, {
            status: remoteSubmission.status,
            verdict: null,
            language: remoteSubmission.language,
            resolvedLanguage: remoteSubmission.resolvedLanguage,
          }),
        )
        const result = await pollRemoteSubmission(remoteSubmission.submissionId, (nextResult) => {
          setDebugInfo(formatRemoteSubmissionDebugInfo(remoteSubmission.submissionId, nextResult))
        })
        const nextVerdict =
          result.verdict ??
          buildServiceVerdict('Judge Error', result.error ?? '远程判题结果暂未返回。')

        setDebugInfo(formatRemoteSubmissionDebugInfo(remoteSubmission.submissionId, result, nextVerdict))
        const sampleResult = await runPublicSamplesAction({
          levelId: level.id,
          code,
          languageMode,
        })

        setVerdict(nextVerdict)
        setStatus('done')
        onRunComplete?.(sampleResult.samples)
        if (nextVerdict.result === 'AC') void onAccepted?.()
        void refreshHistory(false)
        return
      }

      const nextVerdict = buildServiceVerdict('Judge Error', remoteSubmission.reason)
      setConsoleOutput('')
      setDebugInfo([`Action: Submit`, `Language: ${getLanguageLabel(resolvedLanguage)}`, `Status: Judge Error`])
      setVerdict(nextVerdict)
      setStatus('done')
      void refreshHistory(false)
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : '远程提交失败。'
      const nextVerdict = buildServiceVerdict('Judge Error', message)
      setConsoleOutput('')
      setDebugInfo([`Action: Submit`, `Language: ${getLanguageLabel(resolvedLanguage)}`, `Status: Judge Error`])
      setVerdict(nextVerdict)
      setStatus('done')
      void refreshHistory(false)
      return
    }
  }

  async function openHistory() {
    setHistoryOpen(true)
    await refreshHistory(true)
  }

  async function refreshHistory(selectFirst: boolean) {
    setHistoryStatus('loading')
    setHistoryError('')

    try {
      const result = await getSubmissionHistoryAction(level.id)
      setHistoryItems(result.items)
      if (selectFirst || !selectedHistoryId || !result.items.some((item) => item.id === selectedHistoryId)) {
        setSelectedHistoryId(result.items[0]?.id ?? null)
      }
      setHistoryStatus(result.error ? 'error' : 'done')
      setHistoryError(result.error ?? '')
    } catch (error) {
      setHistoryStatus('error')
      setHistoryError(error instanceof Error ? error.message : '历史提交读取失败。')
    }
  }

  function loadHistoryCode(item: SubmissionHistoryItem) {
    const nextLanguageMode = normalizeLanguageMode(item.language)
    writeCachedLanguageMode(level.id, nextLanguageMode)
    setLanguageMode(nextLanguageMode)
    setCode(item.code)
    writeCachedCode(level.id, nextLanguageMode, item.code)
    setLastRunCode(item.code)
    setHistoryOpen(false)
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

  return (
    <section
      className={[
        'workbench',
        expanded ? 'expanded' : '',
        outputExpanded ? 'output-expanded' : '',
        resultsMaximized ? 'results-maximized' : '',
        historyOpen ? 'history-open' : '',
        statementPreviewState !== 'hidden' ? 'statement-preview-visible' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-layout-version={layoutVersion}
    >
      <section className="editor-shell">
        {statementPreviewAsset && statementPreviewState !== 'hidden' ? (
          <figure className={`ide-statement-frame ${statementPreviewState}`} aria-label={statementPreviewAsset.alt}>
            <img src={statementPreviewAsset.url} alt={statementPreviewAsset.alt} />
            {statementPreviewAsset.caption ? <figcaption>{statementPreviewAsset.caption}</figcaption> : null}
          </figure>
        ) : null}

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
          <div className="tool-buttons">
            <button type="button" aria-label="重置代码" title="重置代码" onClick={() => updateCode(level.starterCode)}>
              <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-undo.svg" alt="" />
            </button>
            <button type="button" aria-label="恢复上次运行代码" title="恢复上次运行代码" onClick={() => updateCode(lastRunCode)}>
              <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-redo.svg" alt="" />
            </button>
            <button type="button" aria-label="查看历史提交" title="历史提交" onClick={openHistory}>
              <History size={18} strokeWidth={2.4} />
            </button>
            <AlgorithmWhiteboardButton onOpen={() => setWhiteboardOpen(true)} />
            <button type="button" aria-label="展开编辑器" title={expanded ? '收起编辑器' : '展开编辑器'} onClick={() => setExpanded((value) => !value)}>
              <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-expand.svg" alt="" />
            </button>
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
            automaticLayout: true,
            fontFamily: '"SFMono-Regular", "Consolas", "Liberation Mono", monospace',
            fontLigatures: false,
            fontSize: 15,
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
          analysis={
            lastRemoteSubmissionId && currentAnalysisState ? (
              <SubmissionAnalysisPanel
                state={currentAnalysisState}
                onRetry={() => explainSubmissionError(lastRemoteSubmissionId)}
              />
            ) : null
          }
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
            <div className="history-list">
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
                  onClick={() => setSelectedHistoryId(item.id)}
                >
                  <span className={`history-verdict history-verdict-${statusClassName(item.verdict?.result ?? item.status)}`}>
                    {formatHistoryResult(item)}
                  </span>
                  <strong>{formatHistoryTime(item.createdAt)}</strong>
                  <small>{formatHistoryLanguage(item)} · {shortSubmissionId(item.id)}</small>
                </button>
              ))}
            </div>

            <div className="history-detail">
              {selectedHistory ? (
                <>
                  <div className="history-detail-meta">
                    <FileCode2 size={18} strokeWidth={2.3} />
                    <div>
                      <strong>{formatHistoryResult(selectedHistory)}</strong>
                      <span>
                        {formatHistoryCases(selectedHistory.verdict)} · {formatHistoryLanguage(selectedHistory)} ·{' '}
                        {formatHistoryTime(selectedHistory.createdAt)}
                      </span>
                    </div>
                    <div className="history-detail-actions">
                      {canAnalyzeHistoryItem(selectedHistory) ? (
                        <button
                          type="button"
                          disabled={analysisBySubmissionId[selectedHistory.id]?.status === 'loading'}
                          onClick={() => explainSubmissionError(selectedHistory.id)}
                        >
                          {analysisBySubmissionId[selectedHistory.id]?.status === 'loading' ? '分析中' : 'AI 分析'}
                        </button>
                      ) : null}
                      <button type="button" onClick={() => loadHistoryCode(selectedHistory)}>
                        Load
                      </button>
                    </div>
                  </div>
                  <pre>{selectedHistory.code}</pre>
                  <SubmissionAnalysisPanel
                    state={analysisBySubmissionId[selectedHistory.id]}
                    fallback={selectedHistory.errorAnalysis}
                    onRetry={() => explainSubmissionError(selectedHistory.id)}
                  />
                </>
              ) : (
                <p className="history-empty">选择一次提交查看代码</p>
              )}
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
  return item.status === 'done' && canAnalyzeVerdict(item.verdict)
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

function hasEditedCachedCode(levelId: string, languageMode: LanguageMode, starterCode: string): boolean {
  const cachedCode = readCachedCode(levelId, languageMode)
  return Boolean(cachedCode && cachedCode !== starterCode)
}

function hasEditedCachedCodeForAnyLanguage(level: Level): boolean {
  return LANGUAGE_MODES.some((languageMode) =>
    hasEditedCachedCode(level.id, languageMode, getStarterCodeForLanguage(level, languageMode)),
  )
}

function writeCachedCode(levelId: string, languageMode: LanguageMode, code: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(codeCacheKey(levelId, languageMode), code)
  } catch {
    // Local storage can be disabled in private browsing; editing should still work.
  }
}

function clearStatementPreviewHideTimeout(timeoutRef: { current: number | null }) {
  if (timeoutRef.current === null || typeof window === 'undefined') return
  window.clearTimeout(timeoutRef.current)
  timeoutRef.current = null
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

function pickStatementPreviewAsset(assets: StatementAsset[]): StatementAsset | null {
  return assets.find((asset) => asset.type === 'image') ?? null
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
    'Judge Error': '判题服务遇到问题，请稍后再试。',
  }

  return messages[result]
}
