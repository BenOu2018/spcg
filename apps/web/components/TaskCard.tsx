'use client'

import Link from 'next/link'
import { Fragment, useEffect, useRef, useState } from 'react'
import { CheckCircle2, LoaderCircle, Maximize2, Minimize2, XCircle } from 'lucide-react'
import type { Level, SisterProblem } from '@spcg/shared/types'
import { getDifficultyCoefficient } from '@spcg/shared/difficulty'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'
import { emitBehaviorEvent } from '@/components/behavior-events'
import { StatementMarkdown } from './StatementMarkdown'
import type { SampleRunResultMap, SampleRunStatus } from './sample-run'

type TaskCardProps = {
  level: Level
  sampleResults: SampleRunResultMap
  expanded?: boolean
  className?: string
  onToggleExpanded?: () => void
  onPlayVideo?: () => void
  onRunSample?: (sample: Level['publicCases'][number]) => void
  sampleRunDisabled?: boolean
  canViewHints?: boolean
  hintsUpgradeMessage?: string
  messages?: StudentUiMessages
}

type StatementDetailKind = 'variables' | 'constraints'

type StatementDetailSection = {
  kind: StatementDetailKind
  title: string
  content: string
}

type StatementPresentation = {
  description: string
  detailSections: StatementDetailSection[]
  sampleExplanations: Record<number, string>
}

const fallbackMessages = getStudentUiMessages('zh-CN')

export function TaskCard({
  level,
  sampleResults,
  expanded = false,
  className,
  onToggleExpanded,
  onPlayVideo,
  onRunSample,
  sampleRunDisabled = false,
  canViewHints = true,
  hintsUpgradeMessage = '暂不支持此功能，升级套餐后继续。',
  messages = fallbackMessages,
}: TaskCardProps) {
  const [copyStatusBySample, setCopyStatusBySample] = useState<Record<string, 'copied' | 'failed'>>({})
  const copyStatusTimersRef = useRef<Record<string, number>>({})
  const visibleSamples = level.publicCases.slice(0, 2)
  const statementPresentation = buildStatementPresentation(level.description)
  const visibleDescription = statementPresentation.description
  const difficultyCoefficient = getDifficultyCoefficient(level.difficulty)

  useEffect(() => {
    return () => {
      Object.values(copyStatusTimersRef.current).forEach((timer) => window.clearTimeout(timer))
      copyStatusTimersRef.current = {}
    }
  }, [])

  async function copySampleInput(sampleId: string, input: string) {
    const copied = await writeClipboardText(input)
    setCopyStatusBySample((current) => ({
      ...current,
      [sampleId]: copied ? 'copied' : 'failed',
    }))

    const existingTimer = copyStatusTimersRef.current[sampleId]
    if (existingTimer) window.clearTimeout(existingTimer)

    copyStatusTimersRef.current[sampleId] = window.setTimeout(() => {
      setCopyStatusBySample((current) => {
        const next = { ...current }
        delete next[sampleId]
        return next
      })
      delete copyStatusTimersRef.current[sampleId]
    }, 1400)
  }

  return (
    <aside className={['task', expanded ? 'expanded' : '', className ?? ''].filter(Boolean).join(' ')}>
      <div className="task-scroll">
        <div className="task-top">
          <div className="section-label">
            <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-book.svg" alt="" />
            {messages.task.goal}
          </div>
          <div className="task-title-row">
            <h1>{level.title}</h1>
          </div>
          <button
            className="task-expand-button"
            type="button"
            aria-label={expanded ? messages.task.shrinkTask : messages.task.expandTask}
            aria-pressed={expanded}
            title={expanded ? messages.task.shrinkTask : messages.task.expandTask}
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
          <span>{messages.task.difficulty} {difficultyCoefficient}</span>
        </div>

        {level.sisterProblem ? (
          <section>
            <h2>{messages.task.sisterQuest}</h2>
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

        {statementPresentation.detailSections.map((section) => (
          <StatementCodeNoteSection key={`${section.kind}:${section.title}`} section={section} />
        ))}

        <section>
          <h2>{messages.task.input}</h2>
          <StatementMarkdown markdown={level.inputFormat} assets={[]} hideImages />
        </section>

        <section>
          <h2>{messages.task.output}</h2>
          <StatementMarkdown markdown={level.outputFormat} assets={[]} hideImages />
        </section>

        <section className="sample-run-section">
          <h2>{messages.task.samples}</h2>
          <div className="sample-list">
            {visibleSamples.map((sample, index) => {
              const result = sampleResults[sample.id]
              const status = result?.status ?? 'idle'
              const sampleNumber = index + 1
              const sampleExplanation = getSampleExplanation(sample.note, statementPresentation.sampleExplanations[sampleNumber])

              return (
                <Fragment key={sample.id}>
                  <div className={`sample-row sample-row-${statusClassName(status)}`}>
                    <div className="sample-head">
                      <span className="sample-head-title">{messages.task.samples} {sampleNumber}</span>
                      <div className="sample-head-controls">
                        <div className="sample-actions" aria-label={`${messages.task.samples} ${sampleNumber}`}>
                          <button
                            className="sample-action-button sample-action-run"
                            type="button"
                            disabled={!onRunSample || sampleRunDisabled}
                            onClick={() => onRunSample?.(sample)}
                          >
                            {messages.task.runSample}
                          </button>
                          <button
                            className="sample-action-button"
                            type="button"
                            onClick={() => void copySampleInput(sample.id, sample.input)}
                          >
                            {copyStatusBySample[sample.id] === 'copied'
                              ? messages.task.sampleCopied
                              : copyStatusBySample[sample.id] === 'failed'
                                ? messages.task.sampleCopyFailed
                                : messages.task.copySample}
                          </button>
                        </div>
                        <strong className={`sample-status sample-status-${statusClassName(status)}`}>
                          <SampleStatusIcon status={status} />
                          {formatStatus(status, messages)}
                        </strong>
                      </div>
                    </div>
                    <div className="sample-io-grid">
                      <div className="sample-io-panel">
                        <div className="sample-io-title">{messages.task.input}</div>
                        <pre>{formatCaseText(sample.input, messages)}</pre>
                      </div>
                      <div className="sample-io-panel">
                        <div className="sample-io-title">{messages.task.expected}</div>
                        <pre>{formatCaseText(sample.expectedOutput, messages)}</pre>
                      </div>
                    </div>
                  </div>
                  {sampleExplanation ? (
                    <div className="sample-explanation" aria-label={`${messages.task.samples} ${sampleNumber} 解析`}>
                      <span className="sample-explanation-title">解析：</span>
                      <StatementMarkdown markdown={sampleExplanation} assets={[]} hideImages />
                    </div>
                  ) : null}
                </Fragment>
              )
            })}
          </div>
        </section>

        {onPlayVideo ? (
          <section>
            <h2>{messages.task.algorithmVideo}</h2>
            <button className="video-card" type="button" onClick={onPlayVideo}>
              <span className="video-card-icon">
                <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-play.svg" alt="" />
              </span>
              <strong>{level.title}</strong>
              <span>{messages.task.play}</span>
            </button>
          </section>
        ) : null}

        <section className="task-foldouts">
          <details
            onToggle={(event) => {
              if (event.currentTarget.open) {
                emitBehaviorEvent({
                  type: 'hint',
                  levelId: level.id,
                  metadata: { action: 'open_hint_section' },
                })
              }
            }}
          >
            <summary>{messages.task.hints}</summary>
            {canViewHints ? (
              <div className="hint-list">
                {level.hints.map((hint) => (
                  <details
                    key={hint.step}
                    onToggle={(event) => {
                      if (event.currentTarget.open) {
                        emitBehaviorEvent({
                          type: 'hint',
                          levelId: level.id,
                          metadata: { action: 'open_hint', step: hint.step, title: hint.title },
                        })
                      }
                    }}
                  >
                    <summary>
                      {hint.step}. {hint.title}
                    </summary>
                    <StatementMarkdown markdown={hint.content} assets={[]} hideImages />
                  </details>
                ))}
              </div>
            ) : (
              <p className="solution-locked">{hintsUpgradeMessage}</p>
            )}
          </details>

          <details>
            <summary>{messages.task.solution}</summary>
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
                    {messages.task.time} <StatementMarkdown markdown={level.solution.complexity.time} assets={[]} hideImages />
                  </div>
                  <div className="solution-complexity-item">
                    {messages.task.memory} <StatementMarkdown markdown={level.solution.complexity.memory} assets={[]} hideImages />
                  </div>
                </div>
                {level.officialCode ? <pre>{level.officialCode}</pre> : null}
              </div>
            ) : (
              <p className="solution-locked">{messages.task.solutionLocked}</p>
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

function StatementCodeNoteSection({ section }: { section: StatementDetailSection }) {
  return (
    <section className={`statement-code-note-section statement-code-note-${section.kind}`}>
      <h2>{section.title}</h2>
      <div className="statement-code-frame">
        {section.kind === 'variables' ? <VariableNotesContent markdown={section.content} /> : <StatementMarkdown markdown={section.content} assets={[]} hideImages />}
      </div>
    </section>
  )
}

function VariableNotesContent({ markdown }: { markdown: string }) {
  const table = parseFirstMarkdownTable(markdown)
  if (!table) return <StatementMarkdown markdown={markdown} assets={[]} hideImages />

  return (
    <>
      {table.before ? <StatementMarkdown markdown={table.before} assets={[]} hideImages /> : null}
      <table className="statement-variable-table">
        <thead>
          <tr>
            {table.headers.map((header, index) => (
              <th key={`${header}:${index}`}>
                <StatementMarkdown markdown={header} assets={[]} hideImages />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}:${cellIndex}`}>
                  <StatementMarkdown markdown={cell} assets={[]} hideImages />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.after ? <StatementMarkdown markdown={table.after} assets={[]} hideImages /> : null}
    </>
  )
}

async function writeClipboardText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy textarea copy path.
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'
    document.body.appendChild(textarea)
    try {
      textarea.select()
      return document.execCommand('copy')
    } finally {
      document.body.removeChild(textarea)
    }
  } catch {
    return false
  }
}

function buildStatementPresentation(markdown: string): StatementPresentation {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const output: string[] = []
  const detailSections: StatementDetailSection[] = []
  const sampleExplanations = extractSampleExplanations(markdown)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const heading = parseMarkdownHeading(line)

    if (heading) {
      if (isStandaloneRenderedSectionHeading(heading.text)) {
        index = findSectionEndIndex(lines, index + 1, heading.level) - 1
        continue
      }

      const detailKind = getStatementDetailKind(heading.text)
      if (detailKind) {
        const sectionEndIndex = findSectionEndIndex(lines, index + 1, heading.level)
        const content = lines.slice(index + 1, sectionEndIndex).join('\n').trim()
        if (content) {
          detailSections.push({
            kind: detailKind,
            title: formatStatementDetailTitle(detailKind),
            content,
          })
        }
        index = sectionEndIndex - 1
        continue
      }

      if (isStatementTailSectionHeading(heading.text)) break
    }

    output.push(line)
  }

  return {
    description: output.join('\n').trim(),
    detailSections,
    sampleExplanations,
  }
}

function getSampleExplanation(note: string | undefined, extractedExplanation: string | undefined): string | null {
  const extracted = normalizeOptionalMarkdown(extractedExplanation)
  if (extracted) return extracted

  const structured = normalizeOptionalMarkdown(note)
  if (structured && !isPlaceholderSampleNote(structured)) return structured

  return null
}

function normalizeOptionalMarkdown(value: string | undefined): string | null {
  const normalized = value?.replace(/\r\n/g, '\n').trim()
  return normalized && normalized.length > 0 ? normalized : null
}

function isPlaceholderSampleNote(value: string): boolean {
  const normalized = normalizeStatementHeading(value)
  return /^(?:公开样例|样例|public sample|sample|example)\s*(?:#?\s*)?[0-9０-９一二三四五六七八九十]+$/.test(normalized) ||
    /^case[-_\s#]*[0-9０-９]+$/.test(normalized)
}

function extractSampleExplanations(markdown: string): Record<number, string> {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const explanations: Record<number, string> = {}

  for (let index = 0; index < lines.length; index += 1) {
    const heading = parseMarkdownHeading(lines[index] ?? '')
    if (!heading) continue

    const sampleNumber = parseSampleHeadingNumber(heading.text)
    if (!sampleNumber || sampleNumber > 2) continue

    const sectionEndIndex = findSectionEndIndex(lines, index + 1, heading.level)
    const explanation = extractExplanationFromSampleLines(lines.slice(index + 1, sectionEndIndex))
    if (explanation) explanations[sampleNumber] = explanation
    index = sectionEndIndex - 1
  }

  return explanations
}

function parseSampleHeadingNumber(text: string): number | null {
  const zhMatch = text.match(/^样例\s*(?:#?\s*)?([0-9０-９一二三四五六七八九十]+)$/)
  if (zhMatch?.[1]) return parseSampleNumberToken(zhMatch[1])

  const enMatch = text.match(/^(?:sample|example)\s*(?:#?\s*)?([0-9０-９]+)$/)
  if (enMatch?.[1]) return parseSampleNumberToken(enMatch[1])

  return null
}

function parseSampleNumberToken(token: string): number | null {
  const normalizedDigits = token.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
  if (/^\d+$/.test(normalizedDigits)) return Number.parseInt(normalizedDigits, 10)

  const chineseNumbers: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  }

  return chineseNumbers[token] ?? null
}

function extractExplanationFromSampleLines(lines: string[]): string | null {
  let inFence = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      inFence = !inFence
      continue
    }

    if (inFence) continue

    const heading = parseMarkdownHeading(line)
    if (heading && isSampleExplanationHeading(heading.text)) {
      return cleanSampleExplanationLines(lines.slice(index + 1))
    }

    const inlineLabel = stripSampleExplanationInlineLabel(line)
    if (inlineLabel) {
      const explanationLines = [inlineLabel.rest, ...lines.slice(index + 1)]
      return cleanSampleExplanationLines(explanationLines)
    }
  }

  return null
}

function isSampleExplanationHeading(text: string): boolean {
  return /^(?:样例解析|样例说明|解析|说明|解释|sample explanation|explanation)$/.test(text)
}

function stripSampleExplanationInlineLabel(line: string): { rest: string } | null {
  const normalizedLine = line
    .trim()
    .replace(/^[-*+]\s+/, '')
    .replace(/^>\s*/, '')

  const match = normalizedLine.match(/^(?:\*\*)?\s*(?:样例解析|样例说明|解析|说明|解释|sample explanation|explanation)\s*[：:]\s*(?:\*\*)?\s*(.*)$/i)
  if (!match) return null

  return { rest: match[1] ?? '' }
}

function cleanSampleExplanationLines(lines: string[]): string | null {
  const output: string[] = []
  let inFence = false
  let skippingIoFence = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()

    if (!inFence && isSampleIoTextLabel(line)) {
      skippingIoFence = true
      continue
    }

    if (trimmed.startsWith('```')) {
      if (skippingIoFence) {
        inFence = !inFence
        if (!inFence) skippingIoFence = false
        continue
      }

      inFence = !inFence
      output.push(line)
      continue
    }

    if (skippingIoFence) {
      if (!inFence && trimmed !== '') skippingIoFence = false
      if (skippingIoFence) continue
    }

    output.push(line)
  }

  const cleaned = output.join('\n').trim()
  return cleaned.length > 0 ? cleaned : null
}

function isSampleIoTextLabel(line: string): boolean {
  const normalized = normalizeStatementHeading(line.replace(/^#{1,6}\s+/, ''))
  return /^(?:样例\s*)?(?:输入|输出|input|output)(?:\s*#?\s*[0-9０-９一二三四五六七八九十]+)?$/.test(normalized)
}

function findSectionEndIndex(lines: string[], startIndex: number, headingLevel: number): number {
  let cursor = startIndex

  while (cursor < lines.length) {
    const heading = parseMarkdownHeading(lines[cursor] ?? '')
    if (heading && heading.level <= headingLevel) break
    cursor += 1
  }

  return cursor
}

function getStatementDetailKind(text: string): StatementDetailKind | null {
  if (/^(?:变量说明|变量含义|variables?|variable notes?|variable explanation)$/.test(text)) return 'variables'
  if (/^(?:约束|数据范围|限制|constraints?|limits?)$/.test(text)) return 'constraints'
  return null
}

function formatStatementDetailTitle(kind: StatementDetailKind): string {
  return kind === 'variables' ? '变量说明' : '约束'
}

function parseMarkdownHeading(line: string): { level: number; text: string } | null {
  const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
  if (!match) return null
  const hashes = match[1]
  const rawText = match[2]
  if (!hashes || !rawText) return null

  return {
    level: hashes.length,
    text: normalizeStatementHeading(rawText),
  }
}

function normalizeStatementHeading(text: string): string {
  return text
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[：:]\s*$/, '')
    .trim()
    .toLowerCase()
}

function isStandaloneRenderedSectionHeading(text: string): boolean {
  return /^(?:输入格式|输出格式|input format|output format|input|output)$/.test(text)
}

function isStatementTailSectionHeading(text: string): boolean {
  return /^(?:符号说明|公开样例|样例(?:\s*(?:#?\s*)?[0-9０-９一二三四五六七八九十]+)?|symbol notes?|samples?|examples?|提示|题解|解题|参考代码|官方代码|hints?|solutions?)$/.test(
    text,
  )
}

function parseFirstMarkdownTable(markdown: string): { before: string; headers: string[]; rows: string[][]; after: string } | null {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')

  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index] ?? ''
    const separatorLine = lines[index + 1] ?? ''
    if (!isMarkdownTableRow(headerLine) || !isMarkdownTableSeparator(separatorLine)) continue

    const headers = parseMarkdownTableRow(headerLine)
    const rows: string[][] = []
    let cursor = index + 2

    while (cursor < lines.length && isMarkdownTableRow(lines[cursor] ?? '')) {
      rows.push(normalizeTableRowLength(parseMarkdownTableRow(lines[cursor] ?? ''), headers.length))
      cursor += 1
    }

    if (headers.length === 0 || rows.length === 0) return null

    return {
      before: lines.slice(0, index).join('\n').trim(),
      headers,
      rows,
      after: lines.slice(cursor).join('\n').trim(),
    }
  }

  return null
}

function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|')
}

function isMarkdownTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

function parseMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function normalizeTableRowLength(row: string[], length: number): string[] {
  if (row.length === length) return row
  if (row.length > length) return row.slice(0, length)
  return [...row, ...Array.from({ length: length - row.length }, () => '')]
}

function formatCaseText(value: string, messages: StudentUiMessages): string {
  return value.trim().length > 0 ? value.trimEnd() : messages.task.noInput
}

function formatRelation(relation: SisterProblem['relation']): string {
  const labels: Record<SisterProblem['relation'], string> = {
    'same-pattern': 'Pattern',
    'same-knowledge': 'Knowledge',
    review: 'Review',
  }

  return labels[relation]
}

function formatStatus(status: SampleRunStatus, messages: StudentUiMessages): string {
  const labels: Record<SampleRunStatus, string> = {
    idle: messages.task.ready,
    judging: messages.task.running,
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
