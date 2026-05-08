import Link from 'next/link'
import { CheckCircle2, LoaderCircle, Maximize2, Minimize2, XCircle } from 'lucide-react'
import type { Level, SisterProblem } from '@spcg/shared/types'
import { getDifficultyCoefficient } from '@spcg/shared/difficulty'
import { StatementMarkdown } from './StatementMarkdown'
import type { SampleRunResultMap, SampleRunStatus } from './sample-run'

type TaskCardProps = {
  level: Level
  sampleResults: SampleRunResultMap
  expanded?: boolean
  onToggleExpanded?: () => void
  onPlayVideo?: () => void
}

export function TaskCard({ level, sampleResults, expanded = false, onToggleExpanded, onPlayVideo }: TaskCardProps) {
  const visibleSamples = level.publicCases.slice(0, 2)
  const visibleDescription = stripPrivateStatementSections(level.description)
  const difficultyCoefficient = getDifficultyCoefficient(level.difficulty)
  const symbolNotes = collectSymbolNotes({
    description: visibleDescription,
    inputFormat: level.inputFormat,
    outputFormat: level.outputFormat,
  })

  return (
    <aside className={expanded ? 'task expanded' : 'task'}>
      <div className="task-scroll">
        <div className="task-top">
          <div className="section-label">
            <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-book.svg" alt="" />
            Goal
          </div>
          <div className="task-title-row">
            <h1>{level.title}</h1>
          </div>
          <button
            className="task-expand-button"
            type="button"
            aria-label={expanded ? '缩小题目阅读栏' : '放大题目阅读栏'}
            aria-pressed={expanded}
            title={expanded ? '缩小题目阅读栏' : '放大题目阅读栏'}
            disabled={!onToggleExpanded}
            onClick={onToggleExpanded}
          >
            {expanded ? <Minimize2 size={16} strokeWidth={2.6} /> : <Maximize2 size={16} strokeWidth={2.6} />}
          </button>
        </div>

        <div className="task-meta">
          <span>{level.difficulty.levelLabel}</span>
          <span>{level.difficulty.stars}层</span>
          <span>{level.difficulty.label}</span>
          <span>难度系数 {difficultyCoefficient}</span>
        </div>

        {level.sisterProblem ? (
          <section>
            <h2>Sister Quest</h2>
            <Link className="sister-card" href={`/level/${level.sisterProblem.levelId}`}>
              <span className="sister-card-icon">
                <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-star.svg" alt="" />
              </span>
              <span>
                <strong>{level.sisterProblem.title}</strong>
                {level.sisterProblem.note ? <small>{level.sisterProblem.note}</small> : null}
              </span>
              <em>{formatRelation(level.sisterProblem.relation)}</em>
            </Link>
          </section>
        ) : null}

        <section>
          <StatementMarkdown markdown={visibleDescription} assets={level.statementAssets} hideImages />
        </section>

        <section>
          <h2>Input</h2>
          <StatementMarkdown markdown={level.inputFormat} assets={[]} hideImages />
        </section>

        <section>
          <h2>Output</h2>
          <StatementMarkdown markdown={level.outputFormat} assets={[]} hideImages />
        </section>

        {symbolNotes ? (
          <section className="symbol-glossary">
            <h2>符号说明</h2>
            <StatementMarkdown markdown={symbolNotes} assets={[]} hideImages />
          </section>
        ) : null}

        <section>
          <h2>Samples</h2>
          <div className="sample-list">
            {visibleSamples.map((sample, index) => {
              const result = sampleResults[sample.id]
              const status = result?.status ?? 'idle'
              const sampleNumber = index + 1

              return (
                <div className={`sample-row sample-row-${statusClassName(status)}`} key={sample.id}>
                  <div className="sample-head">
                    <span>样例 {sampleNumber}</span>
                    <strong className={`sample-status sample-status-${statusClassName(status)}`}>
                      <SampleStatusIcon status={status} />
                      {formatStatus(status)}
                    </strong>
                  </div>
                  <div className="sample-io-grid">
                    <div className="sample-io-panel">
                      <div className="sample-io-title">Input</div>
                      <pre>{formatCaseText(sample.input)}</pre>
                    </div>
                    <div className="sample-io-panel">
                      <div className="sample-io-title">Expected</div>
                      <pre>{formatCaseText(sample.expectedOutput)}</pre>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section>
          <h2>Algorithm Video</h2>
          <button className="video-card" type="button" onClick={onPlayVideo} disabled={!onPlayVideo}>
            <span className="video-card-icon">
              <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-play.svg" alt="" />
            </span>
            <strong>{level.title}</strong>
            <span>{onPlayVideo ? 'Play' : 'Waiting'}</span>
          </button>
        </section>

        <section className="task-foldouts">
          <details>
            <summary>Hints</summary>
            <div className="hint-list">
              {level.hints.map((hint) => (
                <details key={hint.step}>
                  <summary>
                    {hint.step}. {hint.title}
                  </summary>
                  <StatementMarkdown markdown={hint.content} assets={[]} hideImages />
                </details>
              ))}
            </div>
          </details>

          <details>
            <summary>Solution</summary>
            {level.solutionUnlocked && level.solution ? (
              <div className="solution-foldout">
                <StatementMarkdown markdown={level.solution.explanation} assets={[]} hideImages />
                <ul>
                  {level.solution.keyPoints.map((point) => (
                    <li key={point}>
                      <StatementMarkdown markdown={point} assets={[]} hideImages />
                    </li>
                  ))}
                </ul>
                <div className="solution-complexity">
                  <div className="solution-complexity-item">
                    Time <StatementMarkdown markdown={level.solution.complexity.time} assets={[]} hideImages />
                  </div>
                  <div className="solution-complexity-item">
                    Memory <StatementMarkdown markdown={level.solution.complexity.memory} assets={[]} hideImages />
                  </div>
                </div>
                {level.officialCode ? <pre>{level.officialCode}</pre> : null}
              </div>
            ) : (
              <p className="solution-locked">AC 后解锁题解。</p>
            )}
          </details>
        </section>
      </div>
    </aside>
  )
}

function SampleStatusIcon({ status }: { status: SampleRunStatus }) {
  if (status === 'idle') return <span className="sample-status-dot" aria-hidden="true" />
  if (status === 'judging') return <LoaderCircle size={13} strokeWidth={2.8} aria-hidden="true" />
  if (status === 'AC') return <CheckCircle2 size={13} strokeWidth={3} aria-hidden="true" />

  return <XCircle size={13} strokeWidth={3} aria-hidden="true" />
}

function stripPrivateStatementSections(markdown: string): string {
  return markdown.replace(/\n#{1,6}\s*(提示|题解|解题|参考代码|官方代码|Hints?|Solutions?)(?:\s|$)[\s\S]*$/i, '').trim()
}

function collectSymbolNotes(input: { description: string; inputFormat: string; outputFormat: string }): string {
  if (/符号说明/.test(input.description)) return ''

  const text = `${input.description}\n${input.inputFormat}\n${input.outputFormat}`
  const notes: string[] = []
  const add = (pattern: RegExp, note: string) => {
    if (pattern.test(text) && !notes.includes(note)) notes.push(note)
  }

  add(/\\(?:big)?oplus|⊕|\bXOR\b|\bxor\b/i, '- $x \\oplus y$：按位异或，也常写作 `xor`；相同位为 $0$，不同位为 $1$。')
  add(/\\leq?|≤/, '- $a \\le b$：$a$ 小于或等于 $b$。')
  add(/\\geq?|≥/, '- $a \\ge b$：$a$ 大于或等于 $b$。')
  add(/\\neq?|≠/, '- $a \\ne b$：$a$ 不等于 $b$。')
  add(/\\(?:ldots|cdots)|…/, '- $a_1, a_2, \\ldots, a_n$：省略中间连续项，表示从第 $1$ 项到第 $n$ 项。')
  add(/\\bmod\b|\\pmod|\bmod\b/i, '- $x \\bmod p$：$x$ 除以 $p$ 后的余数。')
  add(/\\in\b|∈/, '- $x \\in S$：$x$ 属于集合 $S$。')
  add(/\\sum\b|∑/, '- $\\sum$：求和符号，表示把一组数加起来。')
  add(/\$?O\s*\(/, '- $O(\\cdot)$：复杂度记号，用来描述算法随输入规模增长的时间或空间量级。')

  return notes.join('\n')
}

function formatCaseText(value: string): string {
  return value.trim().length > 0 ? value.trimEnd() : '无输入'
}

function formatRelation(relation: SisterProblem['relation']): string {
  const labels: Record<SisterProblem['relation'], string> = {
    'same-pattern': 'Pattern',
    'same-knowledge': 'Knowledge',
    review: 'Review',
  }

  return labels[relation]
}

function formatStatus(status: SampleRunStatus): string {
  const labels: Record<SampleRunStatus, string> = {
    idle: 'Ready',
    judging: 'Running',
    AC: 'AC',
    WA: 'WA',
    CE: 'CE',
    RE: 'RE',
    TLE: 'TLE',
    MLE: 'MLE',
    PE: 'PE',
    'Judge Error': 'Judge Error',
  }

  return labels[status]
}

function statusClassName(status: SampleRunStatus): string {
  return status.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
