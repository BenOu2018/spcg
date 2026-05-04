import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const roots = process.argv.slice(2)
const targetRoots = roots.length > 0 ? roots : ['problem-bank/incoming', 'content/chapters']

async function main() {
  const files = (await Promise.all(targetRoots.map((root) => listMarkdownFiles(resolve(root))))).flat()
  let changed = 0

  for (const file of files) {
    const original = await readFile(file, 'utf8')
    const next = normalizeLevelMarkdown(original)
    if (next !== original) {
      await writeFile(file, next)
      changed += 1
      console.log(`updated ${file}`)
    }
  }

  console.log(`LaTeX normalization complete: ${changed}/${files.length} file(s) updated.`)
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) return listMarkdownFiles(fullPath)
      return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : []
    }),
  )
  return files.flat()
}

function normalizeLevelMarkdown(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n')
  const match = normalized.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/)
  if (!match) return markdown

  const frontmatter = normalizeFrontmatter(match[1] ?? '')
  const body = normalizeBody(match[2] ?? '')
  return `${frontmatter}${body}`
}

function normalizeFrontmatter(frontmatter: string): string {
  const lines = frontmatter.split('\n')
  const output: string[] = []
  let mode: 'math' | 'skip' | null = null
  let topSection: string | null = null
  let inDisplayMath = false
  let baseIndent = 0

  for (const line of lines) {
    const topLevel = line.match(/^([A-Za-z][A-Za-z0-9]*):/)
    const indentedKey = line.match(/^(\s+)([A-Za-z][A-Za-z0-9]*):/)

    if (topLevel) {
      const key = topLevel[1] ?? ''
      topSection = key
      mode = ['inputFormat', 'outputFormat'].includes(key) ? 'math' : null
      if (['testCases', 'starterCode', 'officialCode', 'source'].includes(key)) mode = 'skip'
      baseIndent = 0
      output.push(line)
      continue
    }

    if (indentedKey) {
      const indent = indentedKey[1]?.length ?? 0
      const key = indentedKey[2] ?? ''
      if (indent <= baseIndent && mode) mode = null
      if (topSection !== 'testCases' && topSection !== 'source' && ['content', 'explanation', 'time', 'memory'].includes(key)) {
        mode = 'math'
        baseIndent = indent
        output.push(normalizeYamlInlineValue(line))
        continue
      }
      output.push(line)
      continue
    }

    if (mode === 'math') {
      const textMatch = line.match(/^(\s*)(.*)$/)
      const indent = textMatch?.[1] ?? ''
      const text = textMatch?.[2] ?? ''
      if (text.trim() === '$$') {
        inDisplayMath = !inDisplayMath
        output.push(line)
      } else {
        output.push(`${indent}${inDisplayMath ? normalizeFormulaLine(text) : normalizeMathText(text)}`)
      }
      continue
    }

    if (topSection !== 'testCases' && topSection !== 'source' && topSection !== 'starterCode' && topSection !== 'officialCode') {
      const listItem = line.match(/^(\s*-\s+)(.*)$/)
      if (listItem) {
        output.push(`${listItem[1]}${normalizeMathText(listItem[2] ?? '')}`)
        continue
      }
    }

    output.push(line)
  }

  return output.join('\n')
}

function normalizeBody(body: string): string {
  const sampleIndex = body.search(/^##\s*公开样例/im)
  const statementPart = sampleIndex >= 0 ? body.slice(0, sampleIndex) : body
  const samplePart = sampleIndex >= 0 ? body.slice(sampleIndex) : ''
  const withoutSymbolNotes = statementPart.replace(/\n##\s*符号说明\n[\s\S]*?(?=\n##\s|\n?$)/m, '\n')
  const normalized = normalizeOutsideFences(withoutSymbolNotes)
  const notes = buildSymbolNotes(normalized)
  const withNotes = notes ? `${normalized.trimEnd()}\n\n## 符号说明\n\n${notes}\n\n` : normalized
  return `${withNotes}${samplePart}`
}

function normalizeOutsideFences(text: string): string {
  const lines = text.split('\n')
  let inFence = false
  let inDisplayMath = false
  return lines
    .map((line) => {
      if (line.trim().startsWith('```')) {
        inFence = !inFence
        return line
      }
      if (inFence) return line
      if (line.trim() === '$$') {
        inDisplayMath = !inDisplayMath
        return line
      }
      return inDisplayMath ? normalizeFormulaLine(line) : normalizeMathText(line)
    })
    .join('\n')
}

function normalizeMathText(text: string): string {
  return mapPlainSegments(text.replace(/`([^`]+)`/g, (_match, inner: string) => {
    return isMathLike(inner) ? `$${normalizeMathExpression(inner)}$` : `\`${inner}\``
  }))
}

function mapPlainSegments(text: string): string {
  const parts = text.split(/(\$[^$]+\$)/g)
  return parts
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) return part
      return normalizePlainSegment(part)
    })
    .join('')
}

function normalizePlainSegment(text: string): string {
  let value = text
  value = value.replace(/\b([a-zA-Z])_([a-zA-Z0-9]+)(?:,\s*([a-zA-Z])_([a-zA-Z0-9]+),\s*\.{3},\s*([a-zA-Z])_([a-zA-Z0-9]+))?/g, (match) => {
    return `$${normalizeMathExpression(match)}$`
  })
  value = value.replace(/\b([0-9]+)\.\.([a-zA-Z][a-zA-Z0-9]*)\b/g, (_match, left, right) => `$${left} \\ldots ${right}$`)
  value = value.replace(/\b([0-9]+)\s*(<=|>=|!=)\s*([a-zA-Z][a-zA-Z0-9]*)(?:\s*(<=|>=|!=)\s*([0-9]+))?/g, (match) => `$${normalizeMathExpression(match)}$`)
  value = value.replace(/\b([a-zA-Z][a-zA-Z0-9]*)\s*(<=|>=|!=)\s*([a-zA-Z0-9]+)\b/g, (match) => `$${normalizeMathExpression(match)}$`)
  value = value.replace(/\bO\(([^)]+)\)/g, (_match, inner) => `$O(${normalizeMathExpression(inner)})$`)
  return value
}

function normalizeYamlInlineValue(line: string): string {
  const match = line.match(/^(\s*(?:content|time|memory):\s*)(.*)$/)
  if (!match) return line
  const prefix = match[1] ?? ''
  const rawValue = match[2] ?? ''
  const quote = rawValue.startsWith('"') && rawValue.endsWith('"') ? '"' : rawValue.startsWith("'") && rawValue.endsWith("'") ? "'" : ''
  const value = quote ? rawValue.slice(1, -1) : rawValue
  const normalized = normalizeMathText(value)
  return `${prefix}${quote}${normalized}${quote}`
}

function normalizeFormulaLine(line: string): string {
  return line.replace(/\$([a-zA-Z]+_[a-zA-Z0-9]+)\$/g, '$1')
}

function normalizeMathExpression(expression: string): string {
  return expression
    .trim()
    .replace(/\.\.\./g, '\\ldots')
    .replace(/\.\./g, ' \\ldots ')
    .replace(/<=/g, '\\le')
    .replace(/>=/g, '\\ge')
    .replace(/!=/g, '\\ne')
    .replace(/\s*\*\s*/g, '\\cdot ')
    .replace(/\s+/g, ' ')
}

function isMathLike(value: string): boolean {
  return /_[a-zA-Z0-9]+|\.\.|<=|>=|!=|\bO\(|\bxor\b|\bXOR\b|\*/.test(value)
}

function buildSymbolNotes(text: string): string {
  const notes: string[] = []
  const add = (pattern: RegExp, note: string) => {
    if (pattern.test(text) && !notes.includes(note)) notes.push(note)
  }

  add(/\\(?:big)?oplus|⊕|\bXOR\b|\bxor\b/i, '- $x \\oplus y$ 表示按位异或，也常写作 `xor`；相同二进制位异或为 $0$，不同二进制位异或为 $1$。')
  add(/\\leq?|≤/, '- $a \\le b$ 表示 $a$ 小于或等于 $b$。')
  add(/\\geq?|≥/, '- $a \\ge b$ 表示 $a$ 大于或等于 $b$。')
  add(/\\neq?|≠/, '- $a \\ne b$ 表示 $a$ 不等于 $b$。')
  add(/\\(?:ldots|cdots)|…/, '- $a_1, a_2, \\ldots, a_n$ 中的 $\\ldots$ 表示省略中间连续项。')
  add(/\\bmod\b|\\pmod|\bmod\b/i, '- $x \\bmod p$ 表示 $x$ 除以 $p$ 后的余数。')
  add(/\\in\b|∈/, '- $x \\in S$ 表示 $x$ 属于集合 $S$。')
  add(/\\sum\b|∑/, '- $\\sum$ 表示求和，把一组数加起来。')
  add(/\$O\(/, '- $O(\\cdot)$ 是复杂度记号，用来描述算法随输入规模增长的时间或空间量级。')

  return notes.join('\n')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
