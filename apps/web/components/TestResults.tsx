import type { ReactNode } from 'react'
import type { JudgeProgress, Verdict } from '@spcg/shared/types'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'

type TestResultsProps = {
  verdict: Verdict | null
  status: 'idle' | 'judging' | 'done'
  progress?: JudgeProgress | null
  progressKind?: 'test' | 'sample'
  debugInfo?: string[]
  action?: ReactNode
  analysis?: ReactNode
  messages?: StudentUiMessages
  onCasesClick?: () => void
}

const fallbackMessages = getStudentUiMessages('zh-CN')

export function TestResults({
  verdict,
  status,
  progress = null,
  progressKind = 'test',
  debugInfo = [],
  action,
  analysis,
  messages = fallbackMessages,
  onCasesClick,
}: TestResultsProps) {
  if (status === 'judging') {
    const progressLine = formatProgressLine(progress, progressKind, messages)

    return (
      <div className="result-list pending">
        <div className="result-title">
          <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-play.svg" alt="" />
          {messages.results.judging}
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
      <div className="result-list result-idle">
        <div className="result-title">
          <span className="result-pending-mark" aria-hidden="true" />
          {messages.results.notStarted}
          <TitleAction action={action} />
        </div>
        <div className="case muted-case">
          <span className="result-pending-mark small" aria-hidden="true" />
          <span>{messages.results.title}</span>
          <span>{messages.results.submitWhenDone}</span>
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
      <button
        className="case case-button"
        type="button"
        title="查看所有判题样例"
        onClick={onCasesClick}
        aria-disabled={onCasesClick ? 'false' : 'true'}
      >
        <ResultIcon passed={passed} />
        <span>{messages.results.cases}</span>
        <span>
          {verdict.passedCases}/{verdict.totalCases} · {verdict.maxRuntimeMs} ms
        </span>
      </button>
      <div className="case">
        <span />
        <span>{messages.results.message}</span>
        <span>{verdict.childFriendlyMessage}</span>
      </div>
      {verdict.failedCaseIndex !== null ? (
        <div className="case failed-case">
          <span />
          <span>{messages.results.failed}</span>
          <span>#{verdict.failedCaseIndex + 1}</span>
        </div>
      ) : null}
      {verdict.errorDetail ? <pre className="result-error">{verdict.errorDetail}</pre> : null}
      <DebugInfo items={debugInfo} onCasesClick={onCasesClick} />
      {analysis}
    </div>
  )
}

function formatProgressLine(
  progress: JudgeProgress | null,
  kind: NonNullable<TestResultsProps['progressKind']>,
  messages: StudentUiMessages,
) {
  const singleLabel = kind === 'sample' ? messages.results.publicSample : messages.results.testCase
  const pluralLabel = kind === 'sample' ? messages.results.publicSamples : messages.results.testCases

  if (!progress || progress.totalCases <= 0) {
    return { label: singleLabel, value: messages.results.running }
  }

  if (progress.phase === 'queued') {
    return { label: pluralLabel, value: `${messages.results.queued} ${progress.completedCases}/${progress.totalCases}` }
  }

  if (progress.runningCaseRange) {
    const { from, to } = progress.runningCaseRange
    return {
      label: `${pluralLabel} ${from}-${to}`,
      value: `${messages.results.running} ${messages.results.completedCount} ${progress.completedCases}/${progress.totalCases}`,
    }
  }

  if (progress.currentCaseIndex) {
    return {
      label: `${singleLabel} ${progress.currentCaseIndex} / ${progress.totalCases}`,
      value: `${messages.results.running} ${messages.results.completedCount} ${progress.completedCases}/${progress.totalCases}`,
    }
  }

  return {
    label: pluralLabel,
    value:
      progress.phase === 'completed'
        ? `${messages.results.completed} ${progress.completedCases}/${progress.totalCases}`
        : `${messages.results.running} ${messages.results.completedCount} ${progress.completedCases}/${progress.totalCases}`,
  }
}

function TitleAction({ action }: { action?: ReactNode }) {
  if (!action) return null

  return <span className="result-title-action">{action}</span>
}

function DebugInfo({ items, onCasesClick }: { items: string[]; onCasesClick?: () => void }) {
  if (items.length === 0) return null

  return (
    <div className="result-debug-info">
      {items.map((item) =>
        onCasesClick && /^Cases:\s*\d+\/\d+/.test(item) ? (
          <button className="result-debug-info-button cases-debug-button" type="button" key={item} onClick={onCasesClick}>
            {item}
          </button>
        ) : (
          <span key={item}>{item}</span>
        ),
      )}
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
