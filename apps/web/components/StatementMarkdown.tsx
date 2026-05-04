import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import type { StatementAsset } from '@spcg/shared/types'

type StatementMarkdownProps = {
  markdown: string
  assets: StatementAsset[]
  hideImages?: boolean
}

export function StatementMarkdown({ markdown, assets, hideImages = false }: StatementMarkdownProps) {
  const assetByUrl = new Map(assets.map((asset) => [asset.url, asset]))
  const normalizedMarkdown = normalizeStatementSampleBlocks(markdown)

  const components = {
    img({ src, alt }) {
      if (hideImages) return null
      if (typeof src !== 'string' || !assetByUrl.has(src)) return null

      const asset = assetByUrl.get(src)
      if (!asset) return null

      return (
        <span className="statement-image">
          <img src={asset.url} alt={asset.alt || alt || ''} loading="lazy" />
          {asset.caption ? <span>{asset.caption}</span> : null}
        </span>
      )
    },
    a({ href, children }) {
      if (!href || !isSafeLink(href)) return <>{children}</>

      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      )
    },
  } satisfies Components

  return (
    <div className="statement-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} skipHtml components={components}>
        {normalizedMarkdown}
      </ReactMarkdown>
    </div>
  )
}

function normalizeStatementSampleBlocks(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const output: string[] = []
  let inFence = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      inFence = !inFence
      output.push(line)
      continue
    }

    if (!inFence && isSampleIoLabel(line)) {
      output.push(line)
      index = appendFencedFollowingBlock(lines, output, index + 1)
      continue
    }

    if (!inFence && isSampleHeading(line)) {
      output.push(line)
      const nextIndex = appendRawSampleAfterHeading(lines, output, index + 1)
      if (nextIndex !== index) {
        index = nextIndex
        continue
      }
    }

    output.push(line)
  }

  return output.join('\n')
}

function appendFencedFollowingBlock(lines: string[], output: string[], startIndex: number): number {
  let cursor = startIndex

  while (cursor < lines.length && (lines[cursor] ?? '').trim() === '') {
    output.push(lines[cursor] ?? '')
    cursor += 1
  }

  if (cursor >= lines.length || (lines[cursor] ?? '').trim().startsWith('```')) return cursor - 1

  const block: string[] = []
  while (cursor < lines.length) {
    const line = lines[cursor] ?? ''
    const trimmed = line.trim()

    if (trimmed === '' || isMarkdownHeading(line) || isSampleIoLabel(line)) break
    block.push(line)
    cursor += 1
  }

  if (block.length > 0) {
    output.push('```text', ...block, '```')
  }

  return cursor - 1
}

function appendRawSampleAfterHeading(lines: string[], output: string[], startIndex: number): number {
  let cursor = startIndex
  const blanks: string[] = []

  while (cursor < lines.length && (lines[cursor] ?? '').trim() === '') {
    blanks.push(lines[cursor] ?? '')
    cursor += 1
  }

  const first = lines[cursor] ?? ''
  if (
    cursor >= lines.length ||
    first.trim().startsWith('```') ||
    isSampleIoLabel(first) ||
    !looksLikeRawSampleData(first)
  ) {
    output.push(...blanks)
    return cursor - 1
  }

  const block: string[] = []
  while (cursor < lines.length) {
    const line = lines[cursor] ?? ''
    const trimmed = line.trim()

    if (trimmed === '' || isMarkdownHeading(line) || isSampleIoLabel(line)) break
    block.push(line)
    cursor += 1
  }

  output.push(...blanks, '```text', ...block, '```')
  return cursor - 1
}

function isSampleHeading(line: string): boolean {
  const trimmed = line.trim()
  return /^(?:#{1,6}\s*)?样例\s*(?:#?\s*)?[0-9０-９一二三四五六七八九十]+\s*[：:]?$/.test(trimmed)
}

function isSampleIoLabel(line: string): boolean {
  return /^(?:样例\s*)?(?:输入|输出)(?:\s*#?\s*[0-9０-９一二三四五六七八九十]+)?\s*[：:]$/.test(line.trim())
}

function isMarkdownHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line.trim())
}

function looksLikeRawSampleData(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length === 0) return false
  return !/[，。；、？！]/.test(trimmed)
}

function isSafeLink(href: string) {
  return href.startsWith('https://') || href.startsWith('/assets/problems/')
}
