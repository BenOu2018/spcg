import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { DIFFICULTY_LAYER_LABELS, getLevelLabel, isDifficultyStars, isSpcgLevel } from '../shared/difficulty.js'
import { DEFAULT_CPP_LANGUAGE, isResolvedLanguage, normalizeResolvedLanguage } from '../shared/language-config.js'
import {
  checkOfficialCode,
  importLevelRecords,
  printValidatedLevels,
  printValidationErrors,
  writeImportReport,
  type ParsedLevel,
  type ValidationResult,
} from './level-import-core.js'
import type {
  Difficulty,
  Hint,
  LevelRecord,
  ProblemImportMeta,
  ProblemSource,
  ResolvedLanguage,
  SisterProblem,
  Solution,
  StatementAsset,
  TestCase,
  TestCaseVisibility,
} from '../shared/types.js'

type Args = {
  dir: string
  dryRun: boolean
  recursive: boolean
  skipCodeCheck: boolean
  importBatch: string | null
  reportPath: string | null
}

const DEFAULT_LEVEL_DIR = 'content/chapters/ch1-mist-town/levels'

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const files = await listMarkdownFiles(args.dir, args.recursive)

  if (files.length === 0) {
    throw new Error(`No markdown level files found in ${args.dir}`)
  }

  const results = await Promise.all(files.map((file) => parseLevel(file, args)))
  const invalid = results.filter((result) => result.errors.length > 0)

  if (invalid.length > 0) {
    await writeImportReport(args, results, [])
    printValidationErrors(invalid)
    process.exitCode = 1
    return
  }

  const parsed = results
    .map((result) => result.parsed)
    .filter((value): value is ParsedLevel => value !== undefined)

  await writeImportReport(args, results, parsed)

  if (args.dryRun) {
    printValidatedLevels(parsed)
    return
  }

  await importLevelRecords(parsed, args.importBatch)
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dir: DEFAULT_LEVEL_DIR,
    dryRun: false,
    recursive: false,
    skipCodeCheck: false,
    importBatch: null,
    reportPath: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]

    if (token === '--dry-run') {
      args.dryRun = true
      continue
    }

    if (token === '--recursive') {
      args.recursive = true
      continue
    }

    if (token === '--skip-code-check') {
      args.skipCodeCheck = true
      continue
    }

    if (token === '--dir') {
      const value = argv[i + 1]
      if (!value) throw new Error('--dir requires a value')
      args.dir = value
      i++
      continue
    }

    if (token === '--import-batch') {
      const value = argv[i + 1]
      if (!value) throw new Error('--import-batch requires a value')
      args.importBatch = value
      i++
      continue
    }

    if (token === '--report') {
      const value = argv[i + 1]
      if (!value) throw new Error('--report requires a value')
      args.reportPath = value
      i++
      continue
    }

    throw new Error(`Unknown argument: ${token}`)
  }

  return args
}

async function listMarkdownFiles(dir: string, recursive: boolean): Promise<string[]> {
  const absoluteDir = resolve(dir)
  return listMarkdownFilesInDir(absoluteDir, recursive)
}

async function listMarkdownFilesInDir(dir: string, recursive = false): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isFile() && entry.name.endsWith('.md')) {
      if (isLevelMarkdownFile(path)) files.push(path)
      continue
    }

    if (recursive && entry.isDirectory()) {
      files.push(...(await listMarkdownFilesInDir(path, true)))
    }
  }

  return files.sort()
}

function isLevelMarkdownFile(filePath: string): boolean {
  return filePath.split(/[\\/]/).includes('levels')
}

async function parseLevel(filePath: string, args: Args): Promise<ValidationResult> {
  const errors: string[] = []
  const text = await readFile(filePath, 'utf8')
  const parts = splitFrontmatter(text)

  if (!parts) {
    return { filePath, errors: ['Missing YAML frontmatter delimited by ---'] }
  }

  const raw = parseYaml(parts.frontmatter)
  if (!isRecord(raw)) {
    return { filePath, errors: ['YAML frontmatter must be an object'] }
  }

  const checksum = createHash('sha256').update(text).digest('hex')
  const record = buildLevelRecord(raw, parts.body, checksum, args.importBatch, errors)

  if (record && !args.skipCodeCheck) {
    errors.push(...(await checkOfficialCode(record)))
  }

  return {
    filePath,
    parsed: record ? { filePath, record } : undefined,
    errors,
  }
}

function splitFrontmatter(text: string): { frontmatter: string; body: string } | null {
  const normalized = text.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return null

  const frontmatter = match[1]
  const body = match[2]
  if (frontmatter === undefined || body === undefined) return null

  return { frontmatter, body }
}

function readDefaultLanguage(raw: Record<string, unknown>, errors: string[]): ResolvedLanguage | undefined {
  if (raw.defaultLanguage === undefined && raw.language === 'cpp') return DEFAULT_CPP_LANGUAGE
  if (raw.defaultLanguage === undefined) {
    errors.push('defaultLanguage must be set; use cpp14 for mainline C++ official code')
    return undefined
  }
  if (typeof raw.defaultLanguage !== 'string' || !isResolvedLanguage(raw.defaultLanguage)) {
    errors.push('defaultLanguage must be one of c, cpp11, cpp14, cpp17, cpp20, cpp23, python3')
    return undefined
  }
  return raw.defaultLanguage
}

function readOfficialCodeLanguage(
  raw: Record<string, unknown>,
  defaultLanguage: ResolvedLanguage | undefined,
  errors: string[],
): ResolvedLanguage | undefined {
  if (raw.officialCodeLanguage === undefined) return defaultLanguage
  if (typeof raw.officialCodeLanguage !== 'string' || !isResolvedLanguage(raw.officialCodeLanguage)) {
    errors.push('officialCodeLanguage must be one of c, cpp11, cpp14, cpp17, cpp20, cpp23, python3')
    return undefined
  }
  return normalizeResolvedLanguage(raw.officialCodeLanguage)
}

function buildLevelRecord(
  raw: Record<string, unknown>,
  body: string,
  checksum: string,
  importBatch: string | null,
  errors: string[],
): LevelRecord | null {
  const id = readRequiredString(raw, 'levelId', errors)
  const chapterId = readRequiredString(raw, 'chapterId', errors)
  const order = readRequiredInteger(raw, 'order', errors)
  const title = readRequiredString(raw, 'title', errors)
  const knowledgePoint = readRequiredString(raw, 'knowledgePoint', errors)
  const difficulty = readDifficulty(raw.difficulty, errors)
  const defaultLanguage = readDefaultLanguage(raw, errors)
  const officialCodeLanguage = readOfficialCodeLanguage(raw, defaultLanguage, errors)
  const inputFormat = readRequiredString(raw, 'inputFormat', errors)
  const outputFormat = readRequiredString(raw, 'outputFormat', errors)
  const starterCode = readRequiredString(raw, 'starterCode', errors)
  const officialCode = readRequiredString(raw, 'officialCode', errors)
  const solutionVideoUrl = readSolutionVideoUrl(raw.solutionVideoUrl, errors)
  const statementAssets = readStatementAssets(raw.assets, body, errors)
  const templateVersion = readRequiredString(raw, 'templateVersion', errors)
  const testCases = readTestCases(raw.testCases, errors)
  const hints = readHints(raw.hints, errors)
  const solution = readSolution(raw.solution, errors)
  const source = readSource(raw.source, errors)
  const sisterProblem = readSisterProblem(raw.sisterProblem, errors)
  const timeLimitMs = readOptionalInteger(raw, 'timeLimitMs', 1000, errors)
  const memoryLimitMb = readOptionalInteger(raw, 'memoryLimitMb', 64, errors)

  if (body.trim().length === 0) {
    errors.push('markdown body must contain the problem statement')
  }
  validateStatementBody(body, errors)
  validateProtagonistNaming(raw, body, errors)
  if (source && testCases) {
    validateAdaptedPublicSamples(source, testCases, errors)
  }
  if (hints && solution) {
    validateLatexMathConventions({ body, inputFormat, outputFormat, hints, solution }, errors)
  }

  if (
    !id ||
    !chapterId ||
    order === null ||
    !title ||
    !knowledgePoint ||
    !difficulty ||
    !defaultLanguage ||
    !officialCodeLanguage ||
    !inputFormat ||
    !outputFormat ||
    !starterCode ||
    !officialCode ||
    solutionVideoUrl === undefined ||
    !statementAssets ||
    !templateVersion ||
    !testCases ||
    !hints ||
    !solution ||
    !source ||
    timeLimitMs === null ||
    memoryLimitMb === null ||
    errors.length > 0
  ) {
    return null
  }

  const importMeta: ProblemImportMeta = {
    templateVersion,
    importedAt: null,
    importBatch,
    checksum,
    validationStatus: 'passed',
    validationErrors: [],
    sourceFormat: 'spcg-level-v0.1',
  }

  return {
    id,
    chapterId,
    order,
    title,
    knowledgePoint,
    difficulty,
    defaultLanguage,
    officialCodeLanguage,
    description: body.trim(),
    statementAssets,
    inputFormat,
    outputFormat,
    testCases,
    hints,
    solution,
    officialCode,
    solutionVideoUrl,
    timeLimitMs,
    memoryLimitMb,
    starterCode,
    source,
    sisterProblem,
    importMeta,
    teacherNotes: readNullableString(raw, 'teacherNotes', null),
    guardianId: readNullableString(raw, 'guardianId', null),
    story: readNullableString(raw, 'story', null),
    passOutProblemId: readNullableString(raw, 'passOutProblemId', null),
  }
}

function readTestCases(value: unknown, errors: string[]): TestCase[] | null {
  if (!Array.isArray(value)) {
    errors.push('testCases must be an array')
    return null
  }

  if (value.length !== 20) {
    errors.push(`testCases must contain exactly 20 cases, got ${value.length}`)
  }

  const cases: TestCase[] = []
  const ids = new Set<string>()

  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`testCases[${index}] must be an object`)
      return
    }

    const id = readCaseString(item, 'id', `testCases[${index}]`, errors)
    const input = readCaseString(item, 'input', `testCases[${index}]`, errors)
    const expectedOutput = readCaseString(item, 'expectedOutput', `testCases[${index}]`, errors)
    const visibility = readVisibility(item.visibility, `testCases[${index}]`, errors)
    const note = typeof item.note === 'string' ? item.note : undefined

    if (id && ids.has(id)) {
      errors.push(`testCases[${index}].id duplicates ${id}`)
    }
    if (id) ids.add(id)

    if (id && input !== null && expectedOutput !== null && visibility) {
      cases.push({ id, input, expectedOutput, visibility, ...(note ? { note } : {}) })
    }
  })

  const publicCount = cases.filter((test) => test.visibility === 'public').length
  const hiddenCount = cases.filter((test) => test.visibility === 'hidden').length

  if (publicCount < 2 || publicCount > 3) {
    errors.push(`testCases must contain 2-3 public cases, got ${publicCount}`)
  }

  if (publicCount + hiddenCount !== cases.length) {
    errors.push('all testCases must have visibility public or hidden')
  }

  return cases
}

function validateStatementBody(body: string, errors: string[]) {
  const forbiddenHeading = /^#{1,6}\s*(提示|题解|解题|参考代码|官方代码|Hints?|Solutions?)(?:\s|$)/im
  const forbiddenInlineHint = /(^|\n)\s*(?:[-*]\s*)?(?:提示\s*[123１２３一二三]|Hint\s*[123])\s*[：:.)、]/i

  if (forbiddenHeading.test(body)) {
    errors.push('markdown body must not contain hints, solution, or official-code sections; use frontmatter hints, solution, and officialCode instead')
  }

  if (forbiddenInlineHint.test(body)) {
    errors.push('markdown body must not contain generated step hints such as 提示1/提示2/提示3; put them in frontmatter hints')
  }

  validateStatementSampleCodeFences(body, errors)
}

function validateStatementSampleCodeFences(body: string, errors: string[]) {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  let inFence = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      inFence = !inFence
      continue
    }

    if (!inFence && isSampleIoLabelLine(line)) {
      let cursor = index + 1
      while (cursor < lines.length && (lines[cursor] ?? '').trim() === '') cursor += 1

      if (cursor < lines.length && !(lines[cursor] ?? '').trim().startsWith('```')) {
        errors.push(`markdown sample block after "${trimmed}" must use fenced code block, for example \`\`\`text`)
      }
    }

    if (!inFence && isSampleHeadingLine(line)) {
      let cursor = index + 1
      while (cursor < lines.length && (lines[cursor] ?? '').trim() === '') cursor += 1

      const nextLine = lines[cursor] ?? ''
      if (
        cursor < lines.length &&
        !nextLine.trim().startsWith('```') &&
        !isSampleIoLabelLine(nextLine) &&
        looksLikeRawSampleDataLine(nextLine)
      ) {
        errors.push(`markdown sample data after "${trimmed}" must be wrapped in a fenced code block`)
      }
    }
  }
}

function validateLatexMathConventions(
  input: {
    body: string
    inputFormat: string | undefined
    outputFormat: string | undefined
    hints: Hint[]
    solution: Solution
  },
  errors: string[],
) {
  const targets: Array<[string, string | undefined]> = [
    ['body', input.body],
    ['inputFormat', input.inputFormat],
    ['outputFormat', input.outputFormat],
    ...input.hints.map((hint): [string, string] => [`hints[${hint.step}].content`, hint.content]),
    ['solution.explanation', input.solution.explanation],
    ...input.solution.keyPoints.map((point, index): [string, string] => [`solution.keyPoints[${index}]`, point]),
    ['solution.complexity.time', input.solution.complexity.time],
    ['solution.complexity.memory', input.solution.complexity.memory],
  ]

  for (const [label, text] of targets) {
    if (!text) continue
    const violations = findLatexConventionViolations(text)
    for (const violation of violations) {
      errors.push(`${label} has math-like text that must use LaTeX: ${violation}`)
    }
  }
}

function findLatexConventionViolations(text: string): string[] {
  const normalized = stripFencedCodeBlocks(text.replace(/\r\n/g, '\n'))
  const violations = new Set<string>()

  for (const match of normalized.matchAll(/`([^`]+)`/g)) {
    const value = match[1] ?? ''
    if (isMathLikeText(value)) violations.add(`\`${value}\``)
  }

  const plain = normalized
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]+\$/g, ' ')
    .replace(/`[^`]+`/g, ' ')

  collectPatternViolations(plain, /\b[A-Za-z]_[A-Za-z0-9]+\b/g, violations)
  collectPatternViolations(plain, /\b[0-9]+\.\.[A-Za-z0-9]+\b/g, violations)
  collectPatternViolations(plain, /<=|>=|!=/g, violations)
  collectPatternViolations(plain, /\bO\([^)]*\)/g, violations)
  collectPatternViolations(plain, /\b(?:xor|XOR)\b/g, violations)

  return [...violations].slice(0, 8)
}

function stripFencedCodeBlocks(text: string): string {
  const lines = text.split('\n')
  let inFence = false
  return lines
    .map((line) => {
      if (line.trim().startsWith('```')) {
        inFence = !inFence
        return ''
      }
      return inFence ? '' : line
    })
    .join('\n')
}

function collectPatternViolations(text: string, pattern: RegExp, violations: Set<string>) {
  for (const match of text.matchAll(pattern)) {
    if (match[0]) violations.add(match[0])
  }
}

function isMathLikeText(value: string): boolean {
  return /_[A-Za-z0-9]+|\.\.|<=|>=|!=|\bO\(|\bxor\b|\bXOR\b|\*/.test(value)
}

function isSampleIoLabelLine(line: string): boolean {
  return /^(?:样例\s*)?(?:输入|输出)(?:\s*#?\s*[0-9０-９一二三四五六七八九十]+)?\s*[：:]$/.test(line.trim())
}

function isSampleHeadingLine(line: string): boolean {
  return /^(?:#{1,6}\s*)?样例\s*(?:#?\s*)?[0-9０-９一二三四五六七八九十]+\s*[：:]?$/.test(line.trim())
}

function looksLikeRawSampleDataLine(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length === 0) return false
  return !/[，。；、？！]/.test(trimmed)
}

function readHints(value: unknown, errors: string[]): Hint[] | null {
  if (!Array.isArray(value)) {
    errors.push('hints must be an array')
    return null
  }

  if (value.length !== 3) {
    errors.push(`hints must contain exactly 3 items, got ${value.length}`)
  }

  const hints: Hint[] = []

  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`hints[${index}] must be an object`)
      return
    }

    const step = readRequiredInteger(item, 'step', errors)
    const title = readRequiredString(item, 'title', errors)
    const content = readRequiredString(item, 'content', errors)

    if (step !== null && ![1, 2, 3].includes(step)) {
      errors.push(`hints[${index}].step must be 1, 2, or 3`)
    }

    if ((step === 1 || step === 2 || step === 3) && title && content) {
      hints.push({ step, title, content })
    }
  })

  const steps = hints.map((hint) => hint.step).sort()
  if (steps.join(',') !== '1,2,3') {
    errors.push('hints must include steps 1, 2, and 3 exactly once')
  }

  return hints.sort((a, b) => a.step - b.step)
}

function readSolution(value: unknown, errors: string[]): Solution | null {
  if (!isRecord(value)) {
    errors.push('solution must be an object')
    return null
  }

  const explanation = readRequiredString(value, 'explanation', errors)
  const keyPoints = readStringArray(value.keyPoints, 'solution.keyPoints', errors)
  const complexityValue = value.complexity

  if (!isRecord(complexityValue)) {
    errors.push('solution.complexity must be an object')
    return null
  }

  const time = readRequiredString(complexityValue, 'time', errors)
  const memory = readRequiredString(complexityValue, 'memory', errors)

  if (!explanation || !keyPoints || !time || !memory) {
    return null
  }

  return {
    explanation,
    keyPoints,
    complexity: { time, memory },
  }
}

function readDifficulty(value: unknown, errors: string[]): Difficulty | null {
  if (!isRecord(value)) {
    errors.push('difficulty must be an object')
    return null
  }

  const spcgLevel = readRequiredInteger(value, 'spcgLevel', errors)
  const levelLabel = readRequiredString(value, 'levelLabel', errors)
  const stars = readRequiredInteger(value, 'stars', errors)
  const label = readRequiredString(value, 'label', errors)
  const lglevel = readOptionalNullableString(value, 'lglevel', errors)

  if (spcgLevel !== null && !isSpcgLevel(spcgLevel)) {
    errors.push('difficulty.spcgLevel must be an integer from 1 to 10')
  }

  if (spcgLevel !== null && isSpcgLevel(spcgLevel) && levelLabel !== undefined && levelLabel !== getLevelLabel(spcgLevel)) {
    errors.push(`difficulty.levelLabel must be ${getLevelLabel(spcgLevel)} when spcgLevel is ${spcgLevel}`)
  }

  if (stars !== null && !isDifficultyStars(stars)) {
    errors.push('difficulty.stars must be an integer from 1 to 5')
  }

  if (label !== undefined && !DIFFICULTY_LAYER_LABELS.includes(label as (typeof DIFFICULTY_LAYER_LABELS)[number])) {
    errors.push('difficulty.label must be 入门, 基础, 提高, 挑战, or 综合')
  }

  if (
    spcgLevel === null ||
    !isSpcgLevel(spcgLevel) ||
    !levelLabel ||
    levelLabel !== getLevelLabel(spcgLevel) ||
    stars === null ||
    !isDifficultyStars(stars) ||
    !label ||
    !DIFFICULTY_LAYER_LABELS.includes(label as (typeof DIFFICULTY_LAYER_LABELS)[number]) ||
    lglevel === undefined
  ) {
    return null
  }

  return {
    spcgLevel: spcgLevel as Difficulty['spcgLevel'],
    levelLabel: levelLabel as Difficulty['levelLabel'],
    stars: stars as Difficulty['stars'],
    label: label as Difficulty['label'],
    lglevel,
  }
}

function readSource(value: unknown, errors: string[]): ProblemSource | null {
  if (!isRecord(value)) {
    errors.push('source must be an object')
    return null
  }

  const type = readRequiredString(value, 'type', errors)
  const name = readRequiredString(value, 'name', errors)

  if (type !== undefined && !['original', 'authorized', 'adapted'].includes(type)) {
    errors.push('source.type must be original, authorized, or adapted')
  }

  if (!type || !name || !['original', 'authorized', 'adapted'].includes(type)) {
    return null
  }

  return {
    type: type as ProblemSource['type'],
    name,
    url: readNullableString(value, 'url', null),
    author: readNullableString(value, 'author', null),
    license: readNullableString(value, 'license', null),
    attribution: readNullableString(value, 'attribution', null),
    notes: readNullableString(value, 'notes', null),
    originalPublicSamples: readOriginalPublicSamples(value.originalPublicSamples, errors),
  }
}

function readOriginalPublicSamples(value: unknown, errors: string[]): ProblemSource['originalPublicSamples'] {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) {
    errors.push('source.originalPublicSamples must be an array or null')
    return null
  }

  const samples: NonNullable<ProblemSource['originalPublicSamples']> = []
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`source.originalPublicSamples[${index}] must be an object`)
      return
    }

    const input = readCaseString(item, 'input', `source.originalPublicSamples[${index}]`, errors)
    const expectedOutput = readCaseString(item, 'expectedOutput', `source.originalPublicSamples[${index}]`, errors)
    if (input !== null && expectedOutput !== null) {
      samples.push({ input, expectedOutput })
    }
  })

  return samples
}

function validateAdaptedPublicSamples(source: ProblemSource, testCases: TestCase[], errors: string[]) {
  if (source.type !== 'adapted' || !isExternalOjSource(source)) return

  const originalPublicSamples = source.originalPublicSamples ?? []
  if (originalPublicSamples.length === 0) {
    errors.push('adapted Luogu/Codeforces source must declare source.originalPublicSamples for sample rewrite checks')
    return
  }

  const originalKeys = new Set(
    originalPublicSamples.map((sample) => sampleKey(sample.input, sample.expectedOutput)),
  )
  const duplicated = testCases
    .filter((testCase) => testCase.visibility === 'public')
    .filter((testCase) => originalKeys.has(sampleKey(testCase.input, testCase.expectedOutput)))

  if (duplicated.length > 0) {
    errors.push(
      `public samples for adapted Luogu/Codeforces source must not match original samples; duplicated ${duplicated
        .map((testCase) => testCase.id)
        .join(', ')}`,
    )
  }
}

function isExternalOjSource(source: ProblemSource): boolean {
  const value = `${source.name} ${source.url ?? ''}`.toLowerCase()
  return value.includes('luogu.com.cn') || value.includes('洛谷') || value.includes('codeforces.com') || value.includes('codeforces')
}

function sampleKey(input: string, expectedOutput: string): string {
  return `${normalizeSampleText(input)}\u0000${normalizeSampleText(expectedOutput)}`
}

function normalizeSampleText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
}

function validateProtagonistNaming(raw: Record<string, unknown>, body: string, errors: string[]) {
  const text = `${JSON.stringify(raw)}\n${body}`
  if (text.includes('犬虎小狗')) {
    errors.push('protagonist must be named 犬虎, not 犬虎小狗')
  }
  if (text.includes('小狗')) {
    errors.push('protagonist references must use 犬虎, not 小狗')
  }
}

function readSisterProblem(value: unknown, errors: string[]): SisterProblem | null {
  if (value === undefined || value === null) return null

  if (!isRecord(value)) {
    errors.push('sisterProblem must be an object or null')
    return null
  }

  const levelId = readRequiredString(value, 'levelId', errors)
  const title = readRequiredString(value, 'title', errors)
  const relation = readRequiredString(value, 'relation', errors)
  const validRelations = ['same-pattern', 'same-knowledge', 'review'] as const

  if (relation !== undefined && !validRelations.includes(relation as (typeof validRelations)[number])) {
    errors.push('sisterProblem.relation must be same-pattern, same-knowledge, or review')
  }

  let note: string | null = null
  if ('note' in value) {
    if (value.note === null) {
      note = null
    } else if (typeof value.note === 'string') {
      note = value.note
    } else {
      errors.push('sisterProblem.note must be a string or null')
    }
  }

  if (!levelId || !title || !relation || !validRelations.includes(relation as (typeof validRelations)[number])) {
    return null
  }

  return {
    levelId,
    title,
    relation: relation as SisterProblem['relation'],
    note,
  }
}

function readStatementAssets(value: unknown, body: string, errors: string[]): StatementAsset[] | null {
  if (value === undefined) {
    errors.push('assets is required; include at least one problem statement image asset')
    return null
  }

  if (!Array.isArray(value)) {
    errors.push('assets must be an array')
    return null
  }

  if (value.length === 0) {
    errors.push('assets must include at least one problem statement image')
  }

  const assets: StatementAsset[] = []
  const ids = new Set<string>()
  const urls = new Set<string>()

  value.forEach((item, index) => {
    const prefix = `assets[${index}]`
    if (!isRecord(item)) {
      errors.push(`${prefix} must be an object`)
      return
    }

    const id = readAssetString(item.id, `${prefix}.id`, errors)
    const type = readAssetString(item.type, `${prefix}.type`, errors)
    const url = readAssetString(item.url, `${prefix}.url`, errors)
    const alt = readAssetString(item.alt, `${prefix}.alt`, errors)
    const caption = readAssetCaption(item.caption, `${prefix}.caption`, errors)

    if (id && !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      errors.push(`${prefix}.id must use lowercase letters, numbers, and hyphens`)
    }

    if (type && type !== 'image') {
      errors.push(`${prefix}.type must be image`)
    }

    if (id && ids.has(id)) {
      errors.push(`${prefix}.id duplicates ${id}`)
    }
    if (id) ids.add(id)

    if (url && urls.has(url)) {
      errors.push(`${prefix}.url duplicates ${url}`)
    }
    if (url) urls.add(url)

    if (url) validateStatementAssetUrl(url, prefix, errors)

    if (id && type === 'image' && url && alt && caption !== undefined) {
      assets.push({ id, type, url, alt, caption })
    }
  })

  validateMarkdownImageReferences(body, assets, errors)

  return assets
}

function readAssetString(value: unknown, key: string, errors: string[]): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${key} must be a non-empty string`)
    return undefined
  }
  return value.trim()
}

function readAssetCaption(value: unknown, key: string, errors: string[]): string | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    errors.push(`${key} must be a string or null`)
    return undefined
  }
  return value
}

function validateStatementAssetUrl(url: string, prefix: string, errors: string[]) {
  const isLocalProblemAsset = url.startsWith('/assets/problems/')
  const isHttpsUrl = url.startsWith('https://')

  if (!isLocalProblemAsset && !isHttpsUrl) {
    errors.push(`${prefix}.url must start with /assets/problems/ or https://`)
    return
  }

  const cleanUrl = url.split(/[?#]/, 1)[0] ?? url
  if (!/\.(png|jpe?g|webp|svg)$/i.test(cleanUrl)) {
    errors.push(`${prefix}.url must point to a png, jpg, jpeg, webp, or svg image`)
  }

  if (isLocalProblemAsset) {
    const assetPath = resolve(cleanUrl.slice(1))
    if (!existsSync(assetPath)) {
      errors.push(`${prefix}.url local file not found: ${assetPath}`)
    }
  }
}

function validateMarkdownImageReferences(body: string, assets: StatementAsset[], errors: string[]) {
  const images = extractMarkdownImages(body)
  const assetUrls = new Set(assets.map((asset) => asset.url))
  const markdownUrls = new Set(images.map((image) => image.url))

  for (const image of images) {
    if (image.alt.trim().length === 0) {
      errors.push(`markdown image ${image.url} must include non-empty alt text`)
    }

    if (!assetUrls.has(image.url)) {
      errors.push(`markdown image ${image.url} must be declared in frontmatter assets`)
    }
  }

  for (const asset of assets) {
    if (!markdownUrls.has(asset.url)) {
      errors.push(`assets entry ${asset.id} must be referenced in the markdown body`)
    }
  }
}

function extractMarkdownImages(body: string): Array<{ alt: string; url: string }> {
  const images: Array<{ alt: string; url: string }> = []
  const imagePattern = /!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g
  let match: RegExpExecArray | null

  while ((match = imagePattern.exec(body)) !== null) {
    const alt = match[1]
    const url = match[2]
    if (alt !== undefined && url !== undefined) {
      images.push({ alt, url })
    }
  }

  return images
}

function readSolutionVideoUrl(value: unknown, errors: string[]): string | null | undefined {
  if (value === undefined) {
    errors.push('solutionVideoUrl is required; use null if the video is not ready')
    return undefined
  }
  if (value === null) return null
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push('solutionVideoUrl must be a non-empty string or null')
    return undefined
  }

  const isRelativeAsset = value.startsWith('/video/solutions/')
  const isHttpUrl = value.startsWith('https://')
  if (!isRelativeAsset && !isHttpUrl) {
    errors.push('solutionVideoUrl must start with /video/solutions/ or https://')
    return undefined
  }

  return value
}

function readRequiredString(
  raw: Record<string, unknown>,
  key: string,
  errors: string[],
): string | undefined {
  const value = raw[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${key} must be a non-empty string`)
    return undefined
  }
  return value
}

function readCaseString(
  raw: Record<string, unknown>,
  key: string,
  prefix: string,
  errors: string[],
): string | null {
  const value = raw[key]
  if (typeof value !== 'string') {
    errors.push(`${prefix}.${key} must be a string`)
    return null
  }
  return value
}

function readRequiredInteger(
  raw: Record<string, unknown>,
  key: string,
  errors: string[],
): number | null {
  const value = raw[key]
  if (!Number.isInteger(value)) {
    errors.push(`${key} must be an integer`)
    return null
  }
  return value as number
}

function readOptionalInteger(
  raw: Record<string, unknown>,
  key: string,
  defaultValue: number,
  errors: string[],
): number | null {
  const value = raw[key]
  if (value === undefined || value === null) return defaultValue
  if (!Number.isInteger(value) || (value as number) <= 0) {
    errors.push(`${key} must be a positive integer`)
    return null
  }
  return value as number
}

function readNullableString(
  raw: Record<string, unknown>,
  key: string,
  defaultValue: string | null,
): string | null {
  const value = raw[key]
  if (value === undefined || value === null) return defaultValue
  if (typeof value !== 'string') return defaultValue
  return value
}

function readOptionalNullableString(
  raw: Record<string, unknown>,
  key: string,
  errors: string[],
): string | null | undefined {
  if (!(key in raw)) {
    errors.push(`${key} must be present; use null if empty`)
    return undefined
  }

  const value = raw[key]
  if (value === null) return null
  if (typeof value !== 'string') {
    errors.push(`${key} must be a string or null`)
    return undefined
  }
  return value
}

function readVisibility(
  value: unknown,
  prefix: string,
  errors: string[],
): TestCaseVisibility | null {
  if (value !== 'public' && value !== 'hidden') {
    errors.push(`${prefix}.visibility must be public or hidden`)
    return null
  }
  return value
}

function readStringArray(value: unknown, key: string, errors: string[]): string[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${key} must be an array`)
    return null
  }

  const strings = value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  if (strings.length !== value.length) {
    errors.push(`${key} must contain only non-empty strings`)
    return null
  }

  return strings
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
