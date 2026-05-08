import type { ReactNode } from 'react'
import type { JudgeProgress, Verdict } from '@spcg/shared/types'

type TestResultsProps = {
  verdict: Verdict | null
  status: 'idle' | 'judging' | 'done'
  progress?: JudgeProgress | null
  progressKind?: 'test' | 'sample'
  debugInfo?: string[]
  action?: ReactNode
  analysis?: ReactNode
}

export function TestResults({
  verdict,
  status,
  progress = null,
  progressKind = 'test',
  debugInfo = [],
  action,
  analysis,
}: TestResultsProps) {
  if (status === 'judging') {
    const progressLine = formatProgressLine(progress, progressKind)

    return (
      <div className="result-list pending">
        <div className="result-title">
          <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-play.svg" alt="" />
          Judging
          <TitleAction action={action} />
        </div>
        <div className="case muted-case">
          <span />
          <span>{progressLine.label}</span>
          <span>{progressLine.value}</span>
        </div>
        <DebugInfo items={debugInfo} />
        {analysis}
      </div>
    )
  }

  if (!verdict) {
    return (
      <div className="result-list">
        <div className="result-title">
          <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-check.svg" alt="" />
          Test Results
          <TitleAction action={action} />
        </div>
        <div className="case muted-case">
          <span />
          <span>Ready</span>
          <span>Submit when done.</span>
        </div>
        <DebugInfo items={debugInfo} />
        {analysis}
      </div>
    )
  }

  const passed = verdict.result === 'AC'
  return (
    <div className={`result-list result-${resultClassName(verdict.result)}`}>
      <div className="result-title">
        <ResultIcon passed={passed} />
        {verdict.result}
        <TitleAction action={action} />
      </div>
      <div className="case">
        <ResultIcon passed={passed} />
        <span>Cases</span>
        <span>
          {verdict.passedCases}/{verdict.totalCases} · {verdict.maxRuntimeMs} ms
        </span>
      </div>
      <div className="case">
        <span />
        <span>Message</span>
        <span>{verdict.childFriendlyMessage}</span>
      </div>
      {verdict.failedCaseIndex !== null ? (
        <div className="case failed-case">
          <span />
          <span>Failed</span>
          <span>#{verdict.failedCaseIndex + 1}</span>
        </div>
      ) : null}
      {verdict.errorDetail ? <pre className="result-error">{verdict.errorDetail}</pre> : null}
      <DebugInfo items={debugInfo} />
      {analysis}
    </div>
  )
}

function formatProgressLine(progress: JudgeProgress | null, kind: NonNullable<TestResultsProps['progressKind']>) {
  const singleLabel = kind === 'sample' ? 'Public Sample' : 'Test Case'
  const pluralLabel = kind === 'sample' ? 'Public Samples' : 'Test Cases'

  if (!progress || progress.totalCases <= 0) {
    return { label: singleLabel, value: 'Running...' }
  }

  if (progress.phase === 'queued') {
    return { label: pluralLabel, value: `Queued... ${progress.completedCases}/${progress.totalCases}` }
  }

  if (progress.runningCaseRange) {
    const { from, to } = progress.runningCaseRange
    return {
      label: `${pluralLabel} ${from}-${to}`,
      value: `Running... Completed ${progress.completedCases}/${progress.totalCases}`,
    }
  }

  if (progress.currentCaseIndex) {
    return {
      label: `${singleLabel} ${progress.currentCaseIndex} / ${progress.totalCases}`,
      value: `Running... Completed ${progress.completedCases}/${progress.totalCases}`,
    }
  }

  return {
    label: pluralLabel,
    value:
      progress.phase === 'completed'
        ? `Completed ${progress.completedCases}/${progress.totalCases}`
        : `Running... Completed ${progress.completedCases}/${progress.totalCases}`,
  }
}

function TitleAction({ action }: { action?: ReactNode }) {
  if (!action) return null

  return <span className="result-title-action">{action}</span>
}

function DebugInfo({ items }: { items: string[] }) {
  if (items.length === 0) return null

  return (
    <div className="result-debug-info">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  )
}

function resultClassName(result: Verdict['result']): string {
  return result.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function ResultIcon({ passed }: { passed: boolean }) {
  return passed ? (
    <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-check.svg" alt="" />
  ) : (
    <span className="result-mark" aria-hidden="true">
      x
    </span>
  )
}
