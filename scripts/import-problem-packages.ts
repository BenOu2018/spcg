import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { getLocalCppCompilerArgs } from '../shared/cpp-config.js'
import { DIFFICULTY_LAYER_LABELS, getLevelLabel, isDifficultyStars, isSpcgLevel } from '../shared/difficulty.js'
import { DEFAULT_CPP_LANGUAGE, isResolvedLanguage, normalizeResolvedLanguage } from '../shared/language-config.js'
import {
  isProblemSetItemDisplayMode,
  isRequiredLessonProblemRole,
  type ProblemSetItemDisplayMode,
} from '../shared/curriculum.js'
import {
  checkOfficialCode,
  importLevelRecords,
  printValidatedLevels,
  printValidationErrors,
  validateLevelRecord,
  writeImportReport,
  type ParsedLevel,
  type ValidationResult,
} from './level-import-core.js'
import type {
  Difficulty,
  Hint,
  LevelRecord,
  ProblemAlgorithm,
  ProblemAlgorithmFamily,
  ProblemAlgorithmRole,
  ProblemImportMeta,
  ProblemSource,
  ResolvedLanguage,
  Solution,
  StatementAsset,
  TestCase,
  TestCaseVisibility,
} from '../shared/types.js'

const ALGORITHM_FAMILIES: ProblemAlgorithmFamily[] = [
  'implementation',
  'math',
  'greedy',
  'search',
  'dp',
  'graph',
  'string',
  'data-structure',
  'divide-conquer',
  'geometry',
  'combinatorics',
  'constructive',
  'simulation',
  'other',
]

const ALGORITHM_ROLES: ProblemAlgorithmRole[] = ['primary', 'secondary', 'supporting']

type Args = {
  packagePath: string | null
  dir: string | null
  recursive: boolean
  match: string | null
  dryRun: boolean
  skipCodeCheck: boolean
  importBatch: string | null
  reportPath: string | null
}

type ParsedPackageLevel = ParsedLevel & {
  assetCopies: AssetCopy[]
  stageAssignment: StageAssignment | null
}

type PackageValidationResult = ValidationResult & {
  parsed?: ParsedPackageLevel
}

type AssetCopy = {
  from: string
  to: string
}

type StageDisplayMode = ProblemSetItemDisplayMode

type StageAssignment = {
  spcgLevel: number
  parentOrder: number
  position: number | null
  track: 'A'
  displayMode: StageDisplayMode
}

type StatementAssetReadResult = {
  assets: StatementAsset[]
  assetCopies: AssetCopy[]
  imageMarkdown: string | null
}

type TestCaseManifestEntry = {
  id: string
  visibility: TestCaseVisibility
  input: string
  answer: string
  group: string | null
  note?: string
}

type TestCaseReadResult = {
  cases: TestCase[]
  entries: TestCaseManifestEntry[]
}

type PackageQualityContext = {
  packageDir: string
  record: LevelRecord
  rawSpcg: Record<string, unknown>
  statement: string
  solutionMarkdown: string
  testEntries: TestCaseManifestEntry[]
  skipCodeCheck: boolean
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const packageDirs = await listPackageDirs(args)

  if (packageDirs.length === 0) {
    throw new Error('No problem package directories found')
  }

  const results = await Promise.all(packageDirs.map((packageDir) => parsePackage(packageDir, args)))
  const invalid = results.filter((result) => result.errors.length > 0)

  if (invalid.length > 0) {
    await writeImportReport(reportOptions(args), results, [])
    printValidationErrors(invalid)
    process.exitCode = 1
    return
  }

  const parsed = results
    .map((result) => result.parsed)
    .filter((value): value is ParsedPackageLevel => value !== undefined)

  await writeImportReport(reportOptions(args), results, parsed)

  if (args.dryRun) {
    printValidatedLevels(parsed)
    return
  }

  await syncStatementAssets(parsed)
  await importLevelRecords(parsed, args.importBatch)
  await syncStageAssignments(parsed)
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    packagePath: null,
    dir: null,
    recursive: false,
    match: null,
    dryRun: false,
    skipCodeCheck: false,
    importBatch: null,
    reportPath: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === undefined) continue

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

    if (token === '--package') {
      const value = argv[i + 1]
      if (!value) throw new Error('--package requires a value')
      args.packagePath = value
      i++
      continue
    }

    if (token === '--dir') {
      const value = argv[i + 1]
      if (!value) throw new Error('--dir requires a value')
      args.dir = value
      i++
      continue
    }

    if (token === '--match') {
      const value = argv[i + 1]
      if (!value) throw new Error('--match requires a value')
      args.match = value
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

    if (!token.startsWith('-') && args.packagePath === null && args.dir === null) {
      args.packagePath = token
      continue
    }

    throw new Error(`Unknown argument: ${token}`)
  }

  if (args.packagePath && args.dir) {
    throw new Error('Use either --package or --dir, not both')
  }

  if (!args.packagePath && !args.dir) {
    throw new Error('Provide --package <packageDir>, positional <packageDir>, or --dir <packagesDir>')
  }

  return args
}

async function listPackageDirs(args: Args): Promise<string[]> {
  const dirs = args.packagePath
    ? [resolve(args.packagePath)]
    : await listPackageDirsInDir(resolve(args.dir ?? ''), args.recursive)

  const uniqueDirs = [...new Set(dirs)].sort()
  if (!args.match) return uniqueDirs

  return uniqueDirs.filter((dir) => matchesPattern(basename(dir), args.match ?? ''))
}

async function listPackageDirsInDir(dir: string, recursive: boolean): Promise<string[]> {
  if (existsSync(join(dir, 'meta.yaml'))) return [dir]

  const entries = await readdir(dir, { withFileTypes: true })
  const dirs: string[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const path = join(dir, entry.name)
    if (existsSync(join(path, 'meta.yaml'))) {
      dirs.push(path)
      continue
    }
    if (recursive) {
      dirs.push(...(await listPackageDirsInDir(path, true)))
    }
  }

  return dirs
}

async function parsePackage(packageDir: string, args: Args): Promise<PackageValidationResult> {
  const errors: string[] = []
  const metaPath = join(packageDir, 'meta.yaml')

  if (!existsSync(metaPath)) {
    return { filePath: packageDir, errors: ['meta.yaml not found'] }
  }

  const metaText = await readFile(metaPath, 'utf8')
  const rawMeta = parseYaml(metaText)
  if (!isRecord(rawMeta)) {
    return { filePath: metaPath, errors: ['meta.yaml must parse to an object'] }
  }

  const schemaVersion = readRequiredString(rawMeta, 'schemaVersion', errors)
  if (schemaVersion && schemaVersion !== 'spcg-problem-package-v1.1') {
    errors.push('schemaVersion must be spcg-problem-package-v1.1')
  }

  const id = readRequiredString(rawMeta, 'id', errors)
  const name = readRequiredRecord(rawMeta, 'name', errors)
  const title = name ? readRequiredString(name, 'zh', errors) : undefined
  const limits = readRequiredRecord(rawMeta, 'limits', errors)
  const spcg = readRequiredRecord(rawMeta, 'spcg', errors)
  const difficultyRaw = spcg ? readRequiredRecord(spcg, 'difficulty', errors) : undefined
  const storyRaw = spcg ? readOptionalRecord(spcg, 'story', errors) : null

  if (!id || !title || !limits || !spcg || !difficultyRaw) {
    return { filePath: metaPath, errors }
  }

  const chapterId = readRequiredString(spcg, 'chapterId', errors)
  const order = readRequiredInteger(spcg, 'order', errors)
  const knowledgePoint = readRequiredString(spcg, 'knowledgePoint', errors)
  const algorithmFamilyRaw = readRequiredString(spcg, 'algorithmFamily', errors)
  const algorithmFamily = readAlgorithmFamily(algorithmFamilyRaw, 'spcg.algorithmFamily', errors)
  const algorithms = readAlgorithms(spcg.algorithms, algorithmFamily, errors)
  const defaultLanguage = readLanguage(spcg.defaultLanguage, 'spcg.defaultLanguage', errors) ?? DEFAULT_CPP_LANGUAGE
  const officialCodeLanguage =
    readLanguage(spcg.officialCodeLanguage, 'spcg.officialCodeLanguage', errors) ?? defaultLanguage
  const timeLimitMs = readTimeLimitMs(limits.time_limit, errors)
  const memoryLimitMb = readPositiveInteger(limits.memory_mib, 'limits.memory_mib', errors)
  const difficulty = readDifficulty(difficultyRaw, errors)
  const starterCode = readRequiredString(spcg, 'starterCode', errors)
  const hints = readHints(spcg.hints, errors)
  const source = readSource(rawMeta, spcg, errors)
  const parentOrder = readOptionalPositiveInteger(spcg, 'parentOrder')
  const defaultDisplayMode = readStageDisplayMode(spcg.defaultDisplayMode, errors)
  const mapVisible = typeof spcg.mapVisible === 'boolean' ? spcg.mapVisible : null
  const stageItemIndex = readStageItemIndex(spcg, id, parentOrder, difficulty?.spcgLevel ?? null, errors)

  const statementPath = join(packageDir, 'statement.md')
  const teacherNotesPath = join(packageDir, 'statement_teacher.md')
  const solutionPath = join(packageDir, 'solution.md')
  const officialCodePath = join(packageDir, 'submissions/accepted/official.cpp')
  const testdataPath = join(packageDir, 'data/testdata.yaml')

  const statement = await readRequiredFile(statementPath, errors)
  const teacherNotes = await readOptionalFile(teacherNotesPath)
  const solutionMarkdown = await readRequiredFile(solutionPath, errors)
  const officialCode = await readRequiredFile(officialCodePath, errors)
  const testCaseResult = await readTestCases(packageDir, testdataPath, errors)
  const testCases = testCaseResult?.cases ?? null
  const solution = solutionMarkdown ? readSolution(solutionMarkdown, errors) : null
  const solutionVideoUrl = readSolutionVideoUrl(packageDir, spcg.solutionVideo, errors)

  if (
    !chapterId ||
    order === null ||
    !knowledgePoint ||
    !algorithmFamily ||
    !algorithms ||
    timeLimitMs === null ||
    memoryLimitMb === null ||
    !difficulty ||
    !starterCode ||
    !hints ||
    !source ||
    !statement ||
    !officialCode ||
    !solution ||
    !testCases ||
    solutionVideoUrl === undefined
  ) {
    return { filePath: metaPath, errors }
  }

  const assetResult = await readStatementAssets(packageDir, chapterId, id, title, spcg.assets, errors)
  const sections = splitSections(statement)
  const inputFormat = sections.get('输入格式')
  const outputFormat = sections.get('输出格式')

  errors.push(...validateStatementMarkdown(id, statement))

  if (!inputFormat) errors.push('statement.md must include ## 输入格式')
  if (!outputFormat) errors.push('statement.md must include ## 输出格式')

  const packageChecksum = await hashPackageImportInputs(packageDir, assetResult.assetCopies)
  const importMeta: ProblemImportMeta = {
    templateVersion: schemaVersion ?? 'spcg-problem-package-v1.1',
    importedAt: null,
    importBatch: args.importBatch,
    checksum: packageChecksum,
    validationStatus: 'passed',
    validationErrors: [],
    sourceFormat: 'problem-package-v1.1',
    packagePath: relative(process.cwd(), packageDir),
    packageChecksum,
    schemaVersion: schemaVersion ?? null,
    algorithmFamily,
    algorithms,
    parentOrder,
    stageItemIndex,
    defaultDisplayMode,
    mapVisible,
    testCasePolicy: isRecord(spcg.testCasePolicy) ? spcg.testCasePolicy : null,
  }

  if (!inputFormat || !outputFormat || errors.length > 0) {
    return { filePath: metaPath, errors }
  }

  const stageAssignment =
    parentOrder && difficulty
      ? {
          spcgLevel: difficulty.spcgLevel,
          parentOrder,
          position: stageItemIndex,
          track: 'A' as const,
          displayMode: defaultDisplayMode ?? 'backup',
        }
      : null

  const record: LevelRecord = {
    id,
    chapterId,
    order,
    title,
    knowledgePoint,
    difficulty,
    defaultLanguage,
    officialCodeLanguage,
    description: buildDescription(statement, assetResult.imageMarkdown),
    statementAssets: assetResult.assets,
    inputFormat,
    outputFormat,
    testCases,
    hints,
    solution,
    officialCode,
    solutionVideoUrl,
    teacherNotes,
    timeLimitMs,
    memoryLimitMb,
    starterCode,
    source,
    sisterProblem: null,
    importMeta,
    guardianId: storyRaw ? readNullableString(storyRaw, 'guardianId', null) : null,
    story: storyRaw ? readNullableString(storyRaw, 'summary', null) : null,
    passOutProblemId: null,
  }

  errors.push(...validateLevelRecord(record))
  errors.push(
    ...(await validatePackageQualityGates({
      packageDir,
      record,
      rawSpcg: spcg,
      statement,
      solutionMarkdown: solutionMarkdown ?? '',
      testEntries: testCaseResult?.entries ?? [],
      skipCodeCheck: args.skipCodeCheck,
    })),
  )

  if (errors.length === 0 && !args.skipCodeCheck) {
    errors.push(...(await checkOfficialCode(record)))
  }

  return {
    filePath: metaPath,
    parsed:
      errors.length > 0
        ? undefined
        : { filePath: packageDir, record, assetCopies: assetResult.assetCopies, stageAssignment },
    errors,
  }
}

async function readStatementAssets(
  packageDir: string,
  chapterId: string,
  levelId: string,
  title: string,
  rawAssets: unknown,
  errors: string[],
): Promise<StatementAssetReadResult> {
  if (!isRecord(rawAssets)) {
    errors.push('spcg.assets must be an object; use statementMain: null for assetless packages')
    return { assets: [], assetCopies: [], imageMarkdown: null }
  }

  if (!('statementMain' in rawAssets)) {
    errors.push('spcg.assets.statementMain must be present; use null for assetless packages')
    return { assets: [], assetCopies: [], imageMarkdown: null }
  }

  if (rawAssets.statementMain === null) {
    return { assets: [], assetCopies: [], imageMarkdown: null }
  }

  if (typeof rawAssets.statementMain !== 'string' || rawAssets.statementMain.trim().length === 0) {
    errors.push('spcg.assets.statementMain must be a non-empty string or null')
    return { assets: [], assetCopies: [], imageMarkdown: null }
  }

  const source = rawAssets.statementMain.trim()
  const alt = typeof rawAssets.alt === 'string' && rawAssets.alt.trim() ? rawAssets.alt.trim() : `${title}题目图片`
  const caption = typeof rawAssets.caption === 'string' ? rawAssets.caption : null
  const assetCopies: AssetCopy[] = []
  let url = source

  if (source.startsWith('https://')) {
    url = source
  } else if (source.startsWith('/assets/problems/')) {
    const assetPath = resolve(source.slice(1))
    if (!existsSync(assetPath)) {
      errors.push(`spcg.assets.statementMain local asset not found: ${assetPath}`)
    }
  } else {
    const sourcePath = resolve(packageDir, source)
    if (!existsSync(sourcePath)) {
      errors.push(`spcg.assets.statementMain file not found: ${sourcePath}`)
    }

    const targetFileName = basename(source)
    const targetPath = resolve('assets/problems', chapterId, levelId, targetFileName)
    url = `/assets/problems/${chapterId}/${levelId}/${targetFileName}`
    assetCopies.push({ from: sourcePath, to: targetPath })
  }

  if (!/\.(png|jpe?g|webp|svg)(\?.*)?(#.*)?$/i.test(url)) {
    errors.push('spcg.assets.statementMain must point to a png, jpg, jpeg, webp, or svg image')
  }

  const assets: StatementAsset[] = [{ id: 'statement-main', type: 'image', url, alt, caption }]
  return {
    assets,
    assetCopies,
    imageMarkdown: `![${alt}](${url})`,
  }
}

async function syncStatementAssets(parsed: ParsedPackageLevel[]) {
  for (const level of parsed) {
    for (const copy of level.assetCopies) {
      await mkdir(dirname(copy.to), { recursive: true })
      await copyFile(copy.from, copy.to)
    }
  }
}

async function syncStageAssignments(parsed: ParsedPackageLevel[]) {
  const assignments = parsed.filter((level) => level.stageAssignment !== null)
  if (assignments.length === 0) return

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to sync stage assignments')
  }

  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString: databaseUrl })
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    for (const level of assignments) {
      const assignment = level.stageAssignment
      if (!assignment) continue

      const problemSetId = buildLessonProblemSetId(assignment.spcgLevel, assignment.parentOrder, assignment.track)
      const target = await client.query<{ knowledge_point: string }>(
        `
        SELECT l.knowledge_point
        FROM problem_sets ps
        JOIN levels l ON l.id = $2
        WHERE ps.id = $1
          AND ps.type = 'lesson'
          AND ps.status <> 'archived'
          AND ps.spcg_level = $3
          AND ps.stage_no = $4
        `,
        [problemSetId, level.record.id, assignment.spcgLevel, assignment.parentOrder],
      )

      if (target.rows.length === 0) {
        throw new Error(
          `Cannot attach ${level.record.id}: lesson problem set ${problemSetId} was not found or level is missing`,
        )
      }

      const position =
        assignment.position ??
        Number(
          (
            await client.query<{ next_position: string | number }>(
              'SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM problem_set_items WHERE problem_set_id = $1',
              [problemSetId],
            )
          ).rows[0]?.next_position ?? 1,
        )

      await client.query(
        `
        INSERT INTO problem_set_items (problem_set_id, level_id, position, label, required, metadata)
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          jsonb_build_object(
            'displayMode', $6::text,
            'attachedBy', 'import-problem-packages',
            'parentOrder', $7::int,
            'stageItemIndex', $3::int
          )
        )
        ON CONFLICT (problem_set_id, level_id)
        DO UPDATE SET
          position = EXCLUDED.position,
          label = EXCLUDED.label,
          required = EXCLUDED.required,
          metadata = COALESCE(problem_set_items.metadata, '{}'::jsonb)
            || jsonb_build_object(
              'displayMode', EXCLUDED.metadata->>'displayMode',
              'stageItemIndex', (EXCLUDED.metadata->>'stageItemIndex')::int,
              'parentOrder', (EXCLUDED.metadata->>'parentOrder')::int,
              'attachedBy', 'import-problem-packages'
            )
        `,
        [
          problemSetId,
          level.record.id,
          position,
          target.rows[0]?.knowledge_point ?? level.record.knowledgePoint,
          isRequiredLessonProblemRole(assignment.displayMode),
          assignment.displayMode,
          assignment.parentOrder,
        ],
      )
    }
    await client.query('COMMIT')
    console.log(`Attached ${assignments.length} level(s) to lesson problem set(s).`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

function buildLessonProblemSetId(spcgLevel: number, stageNo: number, track: 'A'): string {
  return `spcg${spcgLevel}-stage${String(stageNo).padStart(2, '0')}-${track.toLowerCase()}`
}

async function readTestCases(
  packageDir: string,
  testdataPath: string,
  errors: string[],
): Promise<TestCaseReadResult | null> {
  const text = await readRequiredFile(testdataPath, errors)
  if (!text) return null

  const raw = parseYaml(text)
  if (!isRecord(raw)) {
    errors.push('data/testdata.yaml must parse to an object')
    return null
  }

  const entries = normalizeTestCaseEntries(raw, errors)
  if (!entries) return null

  const cases: TestCase[] = []
  for (const [index, entry] of entries.entries()) {
    const input = await readRequiredFile(resolve(packageDir, entry.input), errors)
    const expectedOutput = await readRequiredFile(resolve(packageDir, entry.answer), errors)
    if (input === null || expectedOutput === null) continue

    cases.push({
      id: `case-${String(index + 1).padStart(2, '0')}`,
      visibility: entry.visibility,
      input,
      expectedOutput,
      ...(entry.note ? { note: entry.note } : {}),
    })
  }

  return { cases, entries }
}

function normalizeTestCaseEntries(
  raw: Record<string, unknown>,
  errors: string[],
): TestCaseManifestEntry[] | null {
  if (Array.isArray(raw.cases)) {
    const entries: TestCaseManifestEntry[] = []
    raw.cases.forEach((item, index) => {
      if (!isRecord(item)) {
        errors.push(`data/testdata.yaml cases[${index}] must be an object`)
        return
      }

      const id = readRequiredString(item, 'id', errors)
      const visibility = readVisibility(item.visibility, `cases[${index}].visibility`, errors)
      if (!id || !visibility) return

      const folder = visibility === 'public' ? 'public' : 'hidden'
      entries.push({
        id,
        visibility,
        input: `data/${folder}/${id}.in`,
        answer: `data/${folder}/${id}.ans`,
        group: readOptionalString(item, 'group') ?? null,
        ...(typeof item.purpose === 'string' ? { note: item.purpose } : {}),
      })
    })
    return entries
  }

  const publicEntries = readExplicitTestCaseEntries(raw.public, 'public', 'public', errors)
  const hiddenEntries = readExplicitTestCaseEntries(raw.hidden, 'hidden', 'hidden', errors)
  if (!publicEntries || !hiddenEntries) return null

  return [...publicEntries, ...hiddenEntries]
}

function readExplicitTestCaseEntries(
  value: unknown,
  visibility: TestCaseVisibility,
  key: string,
  errors: string[],
): TestCaseManifestEntry[] | null {
  if (!Array.isArray(value)) {
    errors.push(`data/testdata.yaml ${key} must be an array`)
    return null
  }

  const entries: TestCaseManifestEntry[] = []
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`data/testdata.yaml ${key}[${index}] must be an object`)
      return
    }

    const input = readRequiredString(item, 'input', errors)
    const answer = readRequiredString(item, 'answer', errors)
    if (!input || !answer) return
    const id = readOptionalString(item, 'id') ?? input.match(/\/([0-9]{2})\.in$/)?.[1] ?? String(index + 1).padStart(2, '0')

    entries.push({
      id,
      visibility,
      input,
      answer,
      group: readOptionalString(item, 'group') ?? null,
      note: typeof item.purpose === 'string' ? item.purpose : undefined,
    })
  })

  return entries
}

async function validatePackageQualityGates(context: PackageQualityContext): Promise<string[]> {
  const errors: string[] = []
  const algorithmFamily = readOptionalString(context.rawSpcg, 'algorithmFamily')?.toLowerCase() ?? ''
  const isFoundationConcept =
    context.record.difficulty.spcgLevel === 1 && ['implementation', 'math'].includes(algorithmFamily)

  if (isFoundationConcept) return errors

  const aiLog = await readOptionalTextFile(join(context.packageDir, 'ai_log.md'))
  const generators = await readYamlObjectIfPresent(join(context.packageDir, 'generators/generators.yaml'), errors)
  const submissions = await readYamlObjectIfPresent(join(context.packageDir, 'submissions/submissions.yaml'), errors)
  const bruteCode = await readOptionalTextFile(join(context.packageDir, 'submissions/accepted/brute.cpp'))

  if (!bruteCode) {
    errors.push(`${context.record.id}: submissions/accepted/brute.cpp is required for algorithm packages`)
  } else if (normalizeCodeForComparison(bruteCode) === normalizeCodeForComparison(context.record.officialCode)) {
    errors.push(
      `${context.record.id}: brute.cpp must be independently implemented; it is identical to official.cpp after normalization`,
    )
  }

  validateTestGroups(context, errors)
  validateAlgorithmNecessity(context, generators, errors)
  await validateWrongAnswers(context, submissions, generators, aiLog, errors)
  validateScaleCoverage(context, aiLog, errors)
  validateBoundaryCoverage(context, aiLog, errors)
  validateStateCoverage(context, submissions, generators, aiLog, errors)

  return errors
}

function validateStatementMarkdown(levelId: string, statement: string): string[] {
  const errors: string[] = []
  const statementWithoutFences = stripFencedCodeBlocks(statement)
  const statementWithoutCodeAndMath = stripInlineCodeAndMath(statementWithoutFences)

  if (statement.includes('\t')) {
    errors.push(
      `${levelId}: statement.md must not contain literal tab characters; use spaces and escape LaTeX backslashes, e.g. \\times`,
    )
  }

  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(statement)) {
    errors.push(`${levelId}: statement.md must not contain invisible control characters`)
  }

  if (/(^|[^\w])(imes|leq|geq)(?=$|[^\w])/i.test(statement)) {
    errors.push(
      `${levelId}: statement.md contains a likely broken LaTeX command fragment; check for missing backslashes such as \\times, \\le, or \\ge`,
    )
  }

  const inlineCodeMath = statementWithoutFences.match(/`[^`\n]*(?:\\(?:leq?|geq?|neq?|times|cdot|oplus|sum|in|bmod|pmod)|<=|>=|!=|[A-Za-z]_[A-Za-z0-9]+|\bO\([^`\n]*\))[^`\n]*`/)
  if (inlineCodeMath) {
    errors.push(
      `${levelId}: statement.md contains math inside inline code ${inlineCodeMath[0]}; use Markdown LaTeX like $0 \\le x \\le 1000$ or $b \\ne 0$ instead of backticks`,
    )
  }

  const plainMathCommand = statementWithoutCodeAndMath.match(/\\(?:leq?|geq?|neq?|times|cdot|oplus|sum|in|bmod|pmod|leftarrow|lfloor|rfloor)\b/)
  if (plainMathCommand) {
    errors.push(
      `${levelId}: statement.md contains raw LaTeX command ${plainMathCommand[0]} outside $...$; wrap programming math, comparisons, arrays, subscripts, and formulas in Markdown LaTeX`,
    )
  }

  validateStatementVariablesUseLatex(levelId, statementWithoutFences, statementWithoutCodeAndMath, errors)

  return errors
}

function validateStatementVariablesUseLatex(
  levelId: string,
  statementWithoutFences: string,
  statementWithoutCodeAndMath: string,
  errors: string[],
) {
  const variableRows = extractVariableTableRows(statementWithoutFences)
  if (variableRows.length === 0) return

  const variables = new Set<string>()
  for (const row of variableRows) {
    variables.add(row.symbol)
    if (!row.isLatex) {
      errors.push(
        `${levelId}: statement.md variable table symbol "${row.symbol}" must be written as LaTeX, e.g. $${row.symbol}$ or $\\text{${row.symbol}}$`,
      )
    }
  }

  for (const variable of variables) {
    const bareVariable = findBareVariable(statementWithoutCodeAndMath, variable)
    if (bareVariable) {
      errors.push(
        `${levelId}: statement.md contains bare variable "${variable}" outside Markdown LaTeX near "${bareVariable}"; write variables as $${variable}$ or $\\text{${variable}}$ in prose, input/output formats, samples, and explanations`,
      )
    }
  }

  const bareFormula = statementWithoutCodeAndMath.match(
    /\b[A-Za-z][A-Za-z0-9_]*\s*(?:<=|>=|==|!=|=|[<>]|[+\-*/%])\s*[A-Za-z0-9_]/,
  )
  if (bareFormula) {
    errors.push(
      `${levelId}: statement.md contains bare formula-like text "${bareFormula[0]}"; wrap comparisons, assignments, arithmetic, and modulo expressions in Markdown LaTeX`,
    )
  }
}

function extractVariableTableRows(statementWithoutFences: string): Array<{ symbol: string; isLatex: boolean }> {
  const rows: Array<{ symbol: string; isLatex: boolean }> = []
  let inVariableSection = false

  for (const line of statementWithoutFences.split('\n')) {
    if (/^##\s+变量说明\s*$/.test(line.trim())) {
      inVariableSection = true
      continue
    }
    if (inVariableSection && /^##\s+/.test(line.trim())) break
    if (!inVariableSection) continue

    const cell = line.match(/^\|\s*([^|]+?)\s*\|/)
    if (!cell) continue
    const raw = cell[1]?.trim()
    if (!raw || raw === '符号' || /^-+$/.test(raw)) continue

    const latexText = raw.match(/^\$\\text\{([A-Za-z][A-Za-z0-9_]*)\}\$$/)
    const latexPlain = raw.match(/^\$([A-Za-z][A-Za-z0-9_]*)\$$/)
    const plain = raw.match(/^([A-Za-z][A-Za-z0-9_]*)$/)

    if (latexText?.[1]) rows.push({ symbol: latexText[1], isLatex: true })
    else if (latexPlain?.[1]) rows.push({ symbol: latexPlain[1], isLatex: true })
    else if (plain?.[1]) rows.push({ symbol: plain[1], isLatex: false })
  }

  return rows
}

function findBareVariable(textWithoutCodeAndMath: string, variable: string): string | null {
  const pattern = new RegExp(`(^|[^A-Za-z0-9_$@\\\\])(${escapeRegExp(variable)})(?=$|[^A-Za-z0-9_$@])`)
  const lines = textWithoutCodeAndMath.split('\n')
  for (const line of lines) {
    if (/^\s*\|/.test(line)) continue
    const match = line.match(pattern)
    if (match) return line.trim().slice(0, 80)
  }
  return null
}

function stripFencedCodeBlocks(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .reduce(
      (state, line) => {
        if (line.trim().startsWith('```')) {
          state.inFence = !state.inFence
          state.lines.push('')
          return state
        }
        state.lines.push(state.inFence ? '' : line)
        return state
      },
      { inFence: false, lines: [] as string[] },
    )
    .lines.join('\n')
}

function stripInlineCodeAndMath(markdown: string): string {
  return markdown.replace(/`[^`\n]*`/g, '').replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\$[^$\n]*\$/g, '')
}

function validateTestGroups(context: PackageQualityContext, errors: string[]) {
  const missingGroup = context.testEntries.filter((entry) => !entry.group)
  if (missingGroup.length > 0) {
    errors.push(
      `${context.record.id}: all data/testdata.yaml cases must declare group for algorithm packages; missing ${missingGroup
        .map((entry) => entry.id)
        .join(', ')}`,
    )
  }

  const hiddenGroups = new Set(
    context.testEntries
      .filter((entry) => entry.visibility === 'hidden' && entry.group)
      .map((entry) => entry.group as string),
  )

  for (const group of ['edge', 'random-small', 'random-large', 'stress']) {
    if (!hiddenGroups.has(group)) {
      errors.push(`${context.record.id}: hidden test data must include a ${group} group`)
    }
  }

  if (!hiddenGroups.has('adversarial') && !hiddenGroups.has('pattern')) {
    errors.push(`${context.record.id}: hidden test data must include adversarial or pattern cases`)
  }
}

function validateAlgorithmNecessity(
  context: PackageQualityContext,
  generators: Record<string, unknown> | null,
  errors: string[],
) {
  const rawNecessity = generators?.algorithmNecessity
  const necessity = isRecord(rawNecessity) ? rawNecessity : null
  if (!necessity) {
    errors.push(
      `${context.record.id}: generators/generators.yaml must declare algorithmNecessity for algorithm packages`,
    )
    return
  }

  const target = readOptionalString(necessity, 'target')
  if (!target) {
    errors.push(`${context.record.id}: algorithmNecessity.target must be a non-empty string`)
  }

  const alternatives = readStringArray(necessity.lowerLevelAlternatives)
  if (alternatives.length < 2) {
    errors.push(`${context.record.id}: algorithmNecessity.lowerLevelAlternatives must list at least 2 alternatives`)
  }

  const separatingGroups = readStringArray(necessity.separatingGroups)
  if (separatingGroups.length === 0) {
    errors.push(`${context.record.id}: algorithmNecessity.separatingGroups must list at least 1 test group`)
  }

  const groups = new Set(context.testEntries.map((entry) => entry.group).filter((group): group is string => Boolean(group)))
  for (const group of separatingGroups) {
    if (!groups.has(group)) {
      errors.push(`${context.record.id}: algorithmNecessity.separatingGroups references missing group ${group}`)
    }
  }
}

async function validateWrongAnswers(
  context: PackageQualityContext,
  submissions: Record<string, unknown> | null,
  generators: Record<string, unknown> | null,
  aiLog: string,
  errors: string[],
) {
  const rawWrongAnswer = submissions?.wrong_answer
  const wrongAnswer = isRecord(rawWrongAnswer) ? rawWrongAnswer : null
  const wrongNames = wrongAnswer ? Object.keys(wrongAnswer).filter((name) => isRecord(wrongAnswer[name])) : []
  const stateful = isStatefulProblem(context)
  const minimumWrongAnswers = stateful ? 3 : 2
  const waived = hasQualityWaiver(aiLog, ['wrong_answer', '错解豁免'])

  if (wrongNames.length < minimumWrongAnswers && !waived) {
    errors.push(
      `${context.record.id}: algorithm packages require at least ${minimumWrongAnswers} wrong_answer submissions; got ${wrongNames.length}`,
    )
  }

  for (const name of wrongNames) {
    const path = join(context.packageDir, 'submissions/wrong_answer', name)
    if (!existsSync(path)) {
      errors.push(`${context.record.id}: submissions.yaml references missing wrong_answer file ${name}`)
    }

    const config = wrongAnswer?.[name]
    const targets = isRecord(config) ? readStringArray(config.targets) : []
    if (targets.length === 0) {
      errors.push(`${context.record.id}: wrong_answer ${name} must declare non-empty targets`)
      continue
    }

    const groups = new Set(context.testEntries.map((entry) => entry.group).filter((group): group is string => Boolean(group)))
    for (const target of targets) {
      if (!groups.has(target)) {
        errors.push(`${context.record.id}: wrong_answer ${name} targets missing group ${target}`)
      }
    }
  }

  const rawNecessity = generators?.algorithmNecessity
  const necessity = isRecord(rawNecessity) ? rawNecessity : null
  const separatingGroups = new Set(readStringArray(necessity?.separatingGroups))
  for (const name of wrongNames) {
    const config = wrongAnswer?.[name]
    const targets = isRecord(config) ? readStringArray(config.targets) : []
    if (targets.length > 0 && separatingGroups.size > 0 && !targets.some((target) => separatingGroups.has(target))) {
      errors.push(`${context.record.id}: wrong_answer ${name} should target at least one algorithmNecessity separating group`)
    }
  }

  if (!context.skipCodeCheck && wrongAnswer) {
    errors.push(...(await checkWrongAnswerExecutions(context, wrongAnswer, wrongNames)))
  }
}

async function checkWrongAnswerExecutions(
  context: PackageQualityContext,
  wrongAnswer: Record<string, unknown>,
  wrongNames: string[],
): Promise<string[]> {
  const errors: string[] = []
  const compiler = findExecutable(['g++', 'clang++', 'c++'])
  if (!compiler && wrongNames.length > 0) {
    return [`${context.record.id}: C++ compiler not found; rerun with --skip-code-check only for structural validation`]
  }

  for (const name of wrongNames) {
    const config = wrongAnswer[name]
    if (!isRecord(config)) continue
    const targets = readStringArray(config.targets)
    if (targets.length === 0) continue

    const codePath = join(context.packageDir, 'submissions/wrong_answer', name)
    const code = await readOptionalTextFile(codePath)
    if (!code) continue

    const targetCases = context.testEntries
      .map((entry, index) => ({ entry, testCase: context.record.testCases[index] }))
      .filter(({ entry, testCase }) => Boolean(testCase) && targets.includes(entry.group ?? ''))

    if (targetCases.length === 0) continue

    const tempDir = await mkdtemp(join(tmpdir(), `spcg-wa-${context.record.id}-`))
    const sourcePath = join(tempDir, name.endsWith('.c') ? 'main.c' : 'main.cpp')
    const binaryPath = join(tempDir, 'main')

    try {
      await writeFile(sourcePath, code)
      const compileArgs = name.endsWith('.c')
        ? ['-O2', sourcePath, '-o', binaryPath]
        : [...getLocalCppCompilerArgs(context.record.officialCodeLanguage), sourcePath, '-o', binaryPath]
      const compile = spawnSync(compiler as string, compileArgs, {
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      })

      if (compile.status !== 0) {
        errors.push(
          `${context.record.id}: wrong_answer ${name} compile failed: ${compile.stderr.trim() || compile.stdout.trim()}`,
        )
        continue
      }

      let failedCount = 0
      for (const { testCase } of targetCases) {
        if (!testCase) continue
        const run = spawnSync(binaryPath, [], {
          input: testCase.input,
          encoding: 'utf8',
          timeout: Math.max(context.record.timeLimitMs + 1000, 5000),
          maxBuffer: 1024 * 1024,
        })

        if (run.error || run.status !== 0 || normalizeOutput(run.stdout) !== normalizeOutput(testCase.expectedOutput)) {
          failedCount++
        }
      }

      if (failedCount === 0) {
        errors.push(`${context.record.id}: wrong_answer ${name} did not fail any targeted case (${targets.join(', ')})`)
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  return errors
}

function validateScaleCoverage(context: PackageQualityContext, aiLog: string, errors: string[]) {
  if (hasQualityWaiver(aiLog, ['scale', '规模覆盖豁免'])) return

  const scaleConfig = readQualityGateRecord(context.rawSpcg, 'scale')
  const minimumCases = readOptionalPositiveInteger(scaleConfig, 'minimumCases') ?? 1
  const ratio = readOptionalRatio(scaleConfig, 'minimumRatio') ?? 0.8
  const dimensions = readStringArray(scaleConfig?.dimensions)
  const upperBounds = extractNumericUpperBounds(context.statement)
  const scaleVariables =
    dimensions.length > 0
      ? dimensions
      : ['n', 'm'].filter((name) => upperBounds.has(name)).length > 0
        ? ['n', 'm'].filter((name) => upperBounds.has(name))
        : [...upperBounds.keys()].slice(0, 1)

  if (scaleVariables.length === 0) {
    errors.push(
      `${context.record.id}: cannot infer scale upper bounds from statement.md; add spcg.qualityGates.scale.dimensions/minimumRatio or a scale waiver in ai_log.md`,
    )
    return
  }

  const scaleEntries = context.testEntries
    .map((entry, index) => ({ entry, input: context.record.testCases[index]?.input ?? '' }))
    .filter(({ entry }) => entry.visibility === 'hidden' && ['random-large', 'stress', 'final'].includes(entry.group ?? ''))

  const threshold = Math.pow(ratio, scaleVariables.length)
  const reached = scaleEntries.filter(({ input }) => {
    const firstLine = input.replace(/\r\n/g, '\n').split('\n')[0] ?? ''
    const values = firstLine.match(/-?\d+/g)?.map(Number) ?? []
    if (values.length < scaleVariables.length) return false

    const score = scaleVariables.reduce((product, variable, index) => {
      const upper = upperBounds.get(variable)
      if (!upper || upper <= 0) return product
      return product * Math.max(0, values[index] ?? 0) / upper
    }, 1)
    return score >= threshold
  })

  if (reached.length < minimumCases) {
    errors.push(
      `${context.record.id}: scale coverage requires at least ${minimumCases} hidden random-large/stress/final case(s) reaching ${Math.round(
        ratio * 100,
      )}% of declared scale; got ${reached.length}`,
    )
  }
}

function validateBoundaryCoverage(context: PackageQualityContext, aiLog: string, errors: string[]) {
  if (hasQualityWaiver(aiLog, ['boundaryCoverage', '边界覆盖豁免'])) return

  const config = readQualityGateRecord(context.rawSpcg, 'boundaryCoverage')
  const needsClosedUpper = hasClosedUpperStateRange(context.statement)

  if (!config) {
    if (needsClosedUpper) {
      errors.push(
        `${context.record.id}: statement declares a closed 0..n-style state range; add spcg.qualityGates.boundaryCoverage or a boundaryCoverage waiver in ai_log.md`,
      )
    }
    return
  }

  const upperPosition = readOptionalPositiveInteger(config, 'upperPosition')
  const valuePositions = readPositiveIntegerArray(config.valuePositions)
  const minimumCases = readOptionalPositiveInteger(config, 'minimumCases') ?? 1
  const requiredGroups = readStringArray(config.requiredGroups)

  if (!upperPosition) {
    errors.push(`${context.record.id}: boundaryCoverage.upperPosition must be a positive 1-based first-line token index`)
  }
  if (valuePositions.length === 0) {
    errors.push(`${context.record.id}: boundaryCoverage.valuePositions must list positive 1-based first-line token indexes`)
  }
  if (!upperPosition || valuePositions.length === 0) return

  const endpointEntries = context.testEntries.filter((entry, index) => {
    const input = context.record.testCases[index]?.input ?? ''
    const firstLine = input.replace(/\r\n/g, '\n').split('\n')[0] ?? ''
    const values = firstLine.match(/-?\d+/g)?.map(Number) ?? []
    const upperValue = values[upperPosition - 1]
    if (upperValue === undefined) return false
    return valuePositions.some((position) => values[position - 1] === upperValue)
  })

  if (endpointEntries.length < minimumCases) {
    errors.push(
      `${context.record.id}: boundaryCoverage requires at least ${minimumCases} case(s) where a declared value position equals the closed upper endpoint; got ${endpointEntries.length}`,
    )
  }

  const groups = new Set(endpointEntries.map((entry) => entry.group).filter((group): group is string => Boolean(group)))
  for (const group of requiredGroups) {
    if (!groups.has(group)) {
      errors.push(`${context.record.id}: boundaryCoverage requires an upper-endpoint case in group ${group}`)
    }
  }
}

function hasClosedUpperStateRange(statement: string): boolean {
  const text = statement
    .replace(/\\leq/g, '<=')
    .replace(/\\le/g, '<=')
    .replace(/≤/g, '<=')
    .replace(/\$/g, ' ')
  return /0\s*<=\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*\s*<=\s*n\b/.test(text)
}

function validateStateCoverage(
  context: PackageQualityContext,
  submissions: Record<string, unknown> | null,
  generators: Record<string, unknown> | null,
  aiLog: string,
  errors: string[],
) {
  if (!isStatefulProblem(context) || hasQualityWaiver(aiLog, ['stateCoverage', '状态覆盖豁免'])) return

  const stateCoverage = readQualityGateRecord(context.rawSpcg, 'stateCoverage')
  if (!stateCoverage) {
    errors.push(
      `${context.record.id}: stateful algorithms must declare spcg.qualityGates.stateCoverage with publicCasesAtLeast/hiddenRatioAtLeast/noStateWrongAnswer`,
    )
  }

  const rawWrongAnswer = submissions?.wrong_answer
  const wrongAnswer = isRecord(rawWrongAnswer) ? rawWrongAnswer : null
  const wrongNames = wrongAnswer ? Object.keys(wrongAnswer).filter((name) => isRecord(wrongAnswer[name])) : []
  const configuredNoState = stateCoverage ? readOptionalString(stateCoverage, 'noStateWrongAnswer') : undefined
  const hasNoStateWrongAnswer = wrongNames.some((name) => /no[_-]?(state|used|mask)|without[_-]?(state|used|mask)|missing[_-]?state/i.test(name))

  if (configuredNoState && !wrongNames.includes(configuredNoState)) {
    errors.push(`${context.record.id}: stateCoverage.noStateWrongAnswer references missing ${configuredNoState}`)
  } else if (!configuredNoState && !hasNoStateWrongAnswer) {
    errors.push(`${context.record.id}: stateful algorithms require a wrong_answer for missing/ignoring the extra state`)
  }

  const rawNecessity = generators?.algorithmNecessity
  const necessity = isRecord(rawNecessity) ? rawNecessity : null
  const alternatives = readStringArray(necessity?.lowerLevelAlternatives).join(' ')
  if (!/不带状态|普通|no[_-]?state|without[_-]?state|漏.*状态|忽略.*状态/i.test(alternatives)) {
    errors.push(`${context.record.id}: algorithmNecessity.lowerLevelAlternatives must include a no-state or missing-state alternative`)
  }
}

async function readYamlObjectIfPresent(path: string, errors: string[]): Promise<Record<string, unknown> | null> {
  const text = await readOptionalTextFile(path)
  if (!text) {
    errors.push(`required quality file not found: ${path}`)
    return null
  }

  try {
    const raw = parseYaml(text)
    if (!isRecord(raw)) {
      errors.push(`${path} must parse to an object`)
      return null
    }
    return raw
  } catch (error) {
    errors.push(`${path} failed to parse: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

async function readOptionalTextFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

function readQualityGateRecord(spcg: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const qualityGates = isRecord(spcg.qualityGates) ? spcg.qualityGates : null
  const value = qualityGates?.[key]
  return isRecord(value) ? value : null
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
}

function readPositiveIntegerArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is number => Number.isInteger(item) && item > 0)
}

function readOptionalPositiveInteger(raw: Record<string, unknown> | null, key: string): number | null {
  const value = raw?.[key]
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : null
}

function readStageItemIndex(
  spcg: Record<string, unknown>,
  id: string,
  parentOrder: number | null,
  spcgLevel: number | null,
  errors: string[],
): number | null {
  const explicit = readOptionalPositiveInteger(spcg, 'stageItemIndex')
  const lessonSlot = isRecord(spcg.lessonSlot) ? spcg.lessonSlot : null
  const lessonSlotIndex = readOptionalPositiveInteger(lessonSlot, 'index')
  const canonicalMatch = id.match(/^ch(\d{2})-(\d{2})-(\d{1,3})(?:-|$)/)

  if (canonicalMatch) {
    const canonicalLevel = Number(canonicalMatch[1])
    const canonicalStage = Number(canonicalMatch[2])
    const canonicalIndex = Number(canonicalMatch[3])
    if (spcgLevel !== null && canonicalLevel !== spcgLevel) {
      errors.push('canonical id level must match spcg.difficulty.spcgLevel')
    }
    if (parentOrder !== null && canonicalStage !== parentOrder) {
      errors.push('canonical id stage must match spcg.parentOrder')
    }
    if (explicit !== null && explicit !== canonicalIndex) {
      errors.push('spcg.stageItemIndex must match canonical id item index')
    }
    if (lessonSlotIndex !== null && lessonSlotIndex !== canonicalIndex) {
      errors.push('spcg.lessonSlot.index must match canonical id item index')
    }
    if (canonicalIndex > 0) return explicit ?? lessonSlotIndex ?? canonicalIndex
  }

  if (explicit !== null) return explicit
  if (lessonSlotIndex !== null) return lessonSlotIndex

  if (parentOrder !== null && spcgLevel !== null) {
    const expectedPrefix = `ch${String(spcgLevel).padStart(2, '0')}-${String(parentOrder).padStart(2, '0')}-`
    if (id.startsWith(expectedPrefix)) {
      const suffix = id.slice(expectedPrefix.length)
      const match = suffix.match(/^(\d{1,3})(?:-|$)/)
      if (match?.[1]) {
        const index = Number(match[1])
        if (index > 0) return index
      }
    }
  }

  if (parentOrder !== null && id.match(/^ch\d{2}-\d{2}-/)) {
    errors.push('stage-bound canonical id must match spcg.difficulty.spcgLevel and spcg.parentOrder')
  }

  return null
}

function readOptionalRatio(raw: Record<string, unknown> | null, key: string): number | null {
  const value = raw?.[key]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1 ? value : null
}

function hasQualityWaiver(aiLog: string, tokens: string[]): boolean {
  return tokens.some((token) => aiLog.includes(token))
}

function normalizeCodeForComparison(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, '')
    .trim()
}

function findExecutable(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' })
    if (result.status === 0) return candidate
  }
  return null
}

function normalizeOutput(value: string): string {
  return value.trim()
}

function extractNumericUpperBounds(statement: string): Map<string, number> {
  const text = statement
    .replace(/\\leq/g, '<=')
    .replace(/\\le/g, '<=')
    .replace(/≤/g, '<=')
    .replace(/\$/g, ' ')
  const bounds = new Map<string, number>()
  const pattern = /(?:^|[^\w])\d+\s*<=\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\s*<=\s*(\d+)/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    const variables = (match[1] ?? '').split(',').map((item) => item.trim()).filter(Boolean)
    const upper = Number(match[2])
    if (!Number.isFinite(upper)) continue
    variables.forEach((variable) => bounds.set(variable, upper))
  }

  return bounds
}

function isStatefulProblem(context: PackageQualityContext): boolean {
  const text = `${context.record.knowledgePoint}\n${context.statement}\n${context.solutionMarkdown}`
  return /带状态|状态压缩|状压|破墙|破开|钥匙|资源|机会|used|mask/i.test(text)
}

function readSolution(markdown: string, errors: string[]): Solution | null {
  const sections = splitSections(markdown)
  const model = sections.get('模型转化')
  const steps = sections.get('算法步骤')
  const proof = sections.get('正确性说明')
  const complexity = sections.get('复杂度分析')
  const keyPointText = sections.get('易错点') ?? sections.get('关键点')

  if (!steps) errors.push('solution.md must include ## 算法步骤')
  if (!proof) errors.push('solution.md must include ## 正确性说明')
  if (!complexity) errors.push('solution.md must include ## 复杂度分析')
  if (!keyPointText) errors.push('solution.md must include ## 易错点 or ## 关键点')
  if (!steps || !proof || !complexity || !keyPointText) return null

  const explanation = [
    model ? `## 模型转化\n\n${model}` : null,
    `## 算法步骤\n\n${steps}`,
    `## 正确性说明\n\n${proof}`,
  ]
    .filter((section): section is string => Boolean(section))
    .join('\n\n')

  const keyPoints = keyPointText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())

  if (keyPoints.length < 3) {
    errors.push('solution.md key points must contain at least 3 list items')
  }

  const timeMatch = complexity.match(/时间复杂度[：:]\s*(.+)/)
  const memoryMatch = complexity.match(/空间复杂度[：:]\s*(.+)/)
  if (!timeMatch) errors.push('solution.md complexity must include 时间复杂度')
  if (!memoryMatch) errors.push('solution.md complexity must include 空间复杂度')

  if (keyPoints.length < 3 || !timeMatch || !memoryMatch) return null

  return {
    explanation,
    keyPoints,
    complexity: {
      time: (timeMatch[1] ?? '').trim().replace(/。$/, ''),
      memory: (memoryMatch[1] ?? '').trim().replace(/。$/, ''),
    },
  }
}

function buildDescription(statement: string, imageMarkdown: string | null): string {
  const withoutTitle = statement.replace(/\r\n/g, '\n').trim().replace(/^# .+\n\n?/, '')
  if (!imageMarkdown) return withoutTitle
  if (withoutTitle.includes(imageMarkdown)) return withoutTitle
  if (withoutTitle.includes('## 输入格式')) {
    return withoutTitle.replace('## 输入格式', `${imageMarkdown}\n\n## 输入格式`)
  }
  return `${imageMarkdown}\n\n${withoutTitle}`
}

function readSolutionVideoUrl(packageDir: string, value: unknown, errors: string[]): string | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push('spcg.solutionVideo must be a non-empty string or null')
    return undefined
  }

  const video = value.trim()
  if (video.startsWith('/video/solutions/') || video.startsWith('https://')) return video

  const localPath = resolve(packageDir, video)
  if (existsSync(localPath)) {
    errors.push(
      `spcg.solutionVideo points to package-local file ${video}; sync it to /video/solutions/... or set solutionVideo: null before import`,
    )
  } else {
    errors.push(`spcg.solutionVideo must start with /video/solutions/ or https://; local file not found: ${localPath}`)
  }

  return undefined
}

async function readRequiredFile(path: string, errors: string[]): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    errors.push(`required file not found: ${path}`)
    return null
  }
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

async function hashPackageImportInputs(packageDir: string, assetCopies: AssetCopy[]): Promise<string> {
  const hash = createHash('sha256')
  const paths = [
    'meta.yaml',
    'statement.md',
    'statement_teacher.md',
    'solution.md',
    'story.md',
    'ai_log.md',
    'data/testdata.yaml',
    'generators/generators.yaml',
    'submissions/accepted/official.cpp',
    'submissions/accepted/brute.cpp',
    'submissions/submissions.yaml',
    ...(await listFilesUnder(packageDir, 'submissions/wrong_answer')),
    ...(await listFilesUnder(packageDir, 'input_validators')),
    ...(await listFilesUnder(packageDir, 'answer_validators')),
    ...assetCopies.map((copy) => relative(packageDir, copy.from)),
    ...(await listDataFiles(packageDir)),
  ]

  for (const path of [...new Set(paths)].sort()) {
    const absolutePath = resolve(packageDir, path)
    if (!existsSync(absolutePath)) continue
    hash.update(path)
    hash.update('\0')
    hash.update(await readFile(absolutePath))
    hash.update('\0')
  }

  return hash.digest('hex')
}

async function listDataFiles(packageDir: string): Promise<string[]> {
  const dataDir = join(packageDir, 'data')
  const files: string[] = []
  await listFilesRecursively(dataDir, files, packageDir)
  return files.filter((file) => /\.(in|ans)$/.test(file))
}

async function listFilesUnder(packageDir: string, relativeDir: string): Promise<string[]> {
  const files: string[] = []
  await listFilesRecursively(join(packageDir, relativeDir), files, packageDir)
  return files
}

async function listFilesRecursively(dir: string, out: string[], baseDir: string) {
  if (!existsSync(dir)) return
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      await listFilesRecursively(path, out, baseDir)
    } else if (entry.isFile() && entry.name !== '.DS_Store') {
      out.push(relative(baseDir, path))
    }
  }
}

function splitSections(markdown: string): Map<string, string> {
  const text = markdown.replace(/\r\n/g, '\n')
  const sections = new Map<string, string>()
  const matches = [...text.matchAll(/^## (.+)$/gm)]

  matches.forEach((match, index) => {
    const title = match[1]?.trim()
    if (!title || match.index === undefined) return
    const start = match.index + match[0].length + 1
    const end = matches[index + 1]?.index ?? text.length
    sections.set(title, text.slice(start, end).trim())
  })

  return sections
}

function readDifficulty(raw: Record<string, unknown>, errors: string[]): Difficulty | null {
  const spcgLevel = readRequiredInteger(raw, 'spcgLevel', errors)
  const levelLabel = readRequiredString(raw, 'levelLabel', errors)
  const stars = readRequiredInteger(raw, 'stars', errors)
  const label = readRequiredString(raw, 'label', errors)
  const lglevel = 'lglevel' in raw ? readOptionalNullableString(raw, 'lglevel', errors) : null

  if (spcgLevel !== null && !isSpcgLevel(spcgLevel)) {
    errors.push('difficulty.spcgLevel must be an integer from 1 to 10')
  }
  if (spcgLevel !== null && isSpcgLevel(spcgLevel) && levelLabel !== getLevelLabel(spcgLevel)) {
    errors.push(`difficulty.levelLabel must be ${getLevelLabel(spcgLevel)}`)
  }
  if (stars !== null && !isDifficultyStars(stars)) {
    errors.push('difficulty.stars must be an integer from 1 to 5')
  }
  if (label && !DIFFICULTY_LAYER_LABELS.includes(label as (typeof DIFFICULTY_LAYER_LABELS)[number])) {
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

function readAlgorithmFamily(
  value: string | undefined,
  fieldName: string,
  errors: string[],
): ProblemAlgorithmFamily | null {
  if (!value) return null
  if (!ALGORITHM_FAMILIES.includes(value as ProblemAlgorithmFamily)) {
    errors.push(`${fieldName} must be one of: ${ALGORITHM_FAMILIES.join(', ')}`)
    return null
  }

  return value as ProblemAlgorithmFamily
}

function readAlgorithmRole(value: string | undefined, fieldName: string, errors: string[]): ProblemAlgorithmRole | null {
  if (!value) return null
  if (!ALGORITHM_ROLES.includes(value as ProblemAlgorithmRole)) {
    errors.push(`${fieldName} must be one of: ${ALGORITHM_ROLES.join(', ')}`)
    return null
  }

  return value as ProblemAlgorithmRole
}

function readAlgorithms(
  value: unknown,
  defaultFamily: ProblemAlgorithmFamily | null,
  errors: string[],
): ProblemAlgorithm[] | null {
  if (!Array.isArray(value)) {
    errors.push('spcg.algorithms must be a non-empty array')
    return null
  }
  if (value.length === 0) {
    errors.push('spcg.algorithms must contain at least 1 item')
    return null
  }

  const algorithms: ProblemAlgorithm[] = []
  const seenIds = new Set<string>()

  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`spcg.algorithms[${index}] must be an object`)
      return
    }

    const id = readRequiredString(item, 'id', errors)
    const name = readRequiredString(item, 'name', errors)
    const rawFamily = readRequiredString(item, 'family', errors)
    const family = readAlgorithmFamily(rawFamily, `spcg.algorithms[${index}].family`, errors)
    const rawRole = readRequiredString(item, 'role', errors)
    const role = readAlgorithmRole(rawRole, `spcg.algorithms[${index}].role`, errors)
    const note = 'note' in item ? readOptionalNullableString(item, 'note', errors) : null

    if (id && !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      errors.push(`spcg.algorithms[${index}].id must use lowercase kebab-case`)
    }
    if (id && seenIds.has(id)) {
      errors.push(`spcg.algorithms id must be unique; duplicate ${id}`)
    }
    if (id) seenIds.add(id)

    if (!id || !name || !family || !role || note === undefined) return
    algorithms.push({ id, name, family, role, note })
  })

  if (algorithms.length === 0) return null

  if (!algorithms.some((algorithm) => algorithm.role === 'primary')) {
    errors.push('spcg.algorithms must contain at least one primary algorithm')
  }

  if (defaultFamily && !algorithms.some((algorithm) => algorithm.family === defaultFamily)) {
    errors.push('spcg.algorithms must include at least one item whose family matches spcg.algorithmFamily')
  }

  return errors.some((error) => error.startsWith('spcg.algorithms')) ? null : algorithms
}

function readHints(value: unknown, errors: string[]): Hint[] | null {
  if (!Array.isArray(value)) {
    errors.push('spcg.hints must be an array')
    return null
  }
  if (value.length < 3) {
    errors.push(`spcg.hints must contain at least 3 items, got ${value.length}`)
    return null
  }

  const hints: Hint[] = []
  value.slice(0, 3).forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`spcg.hints[${index}] must be an object`)
      return
    }

    const title = readRequiredString(item, 'title', errors)
    const content = readRequiredString(item, 'content', errors)
    if (!title || !content) return
    hints.push({ step: (index + 1) as Hint['step'], title, content })
  })

  return hints.length === 3 ? hints : null
}

function readSource(rawMeta: Record<string, unknown>, spcg: Record<string, unknown>, errors: string[]): ProblemSource | null {
  const sourcePolicy = readRequiredRecord(spcg, 'sourcePolicy', errors)
  if (!sourcePolicy) return null

  const type = readRequiredString(sourcePolicy, 'type', errors)
  if (type && !['original', 'authorized', 'adapted'].includes(type)) {
    errors.push('spcg.sourcePolicy.type must be original, authorized, or adapted')
  }

  const references = Array.isArray(sourcePolicy.references)
    ? sourcePolicy.references.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const authors = isRecord(rawMeta.credits) && Array.isArray(rawMeta.credits.authors)
    ? rawMeta.credits.authors.filter((item): item is string => typeof item === 'string')
    : []

  if (!type || !['original', 'authorized', 'adapted'].includes(type)) return null

  return {
    type: type as ProblemSource['type'],
    name: references[0] ?? 'SPCG 题目包',
    url: null,
    author: authors.length > 0 ? authors.join(', ') : null,
    license: typeof rawMeta.license === 'string' ? rawMeta.license : null,
    attribution: null,
    notes: typeof sourcePolicy.notes === 'string' ? sourcePolicy.notes : null,
    originalPublicSamples: null,
  }
}

function readLanguage(value: unknown, key: string, errors: string[]): ResolvedLanguage | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || !isResolvedLanguage(value)) {
    errors.push(`${key} must be one of c, cpp11, cpp14, cpp17, cpp20, cpp23, python3`)
    return undefined
  }
  return normalizeResolvedLanguage(value)
}

function readTimeLimitMs(value: unknown, errors: string[]): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    errors.push('limits.time_limit must be a positive number in seconds')
    return null
  }
  return Math.ceil(value * 1000)
}

function readPositiveInteger(value: unknown, key: string, errors: string[]): number | null {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    errors.push(`${key} must be a positive integer`)
    return null
  }
  return value as number
}

function readRequiredInteger(raw: Record<string, unknown>, key: string, errors: string[]): number | null {
  const value = raw[key]
  if (!Number.isInteger(value)) {
    errors.push(`${key} must be an integer`)
    return null
  }
  return value as number
}

function readRequiredString(raw: Record<string, unknown>, key: string, errors: string[]): string | undefined {
  const value = raw[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${key} must be a non-empty string`)
    return undefined
  }
  return value.trim()
}

function readOptionalString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readStageDisplayMode(value: unknown, errors: string[]): StageDisplayMode | null {
  if (value === undefined || value === null) return null
  if (isProblemSetItemDisplayMode(value)) return value
  errors.push('spcg.defaultDisplayMode must be template, basic, variant, advanced, challenge, exam-only, primary, backup, or null')
  return null
}

function readRequiredRecord(raw: Record<string, unknown>, key: string, errors: string[]): Record<string, unknown> | null {
  const value = raw[key]
  if (!isRecord(value)) {
    errors.push(`${key} must be an object`)
    return null
  }
  return value
}

function readOptionalRecord(
  raw: Record<string, unknown>,
  key: string,
  errors: string[],
): Record<string, unknown> | null {
  const value = raw[key]
  if (value === undefined || value === null) return null
  if (!isRecord(value)) {
    errors.push(`${key} must be an object or null`)
    return null
  }
  return value
}

function readNullableString(
  raw: Record<string, unknown>,
  key: string,
  defaultValue: string | null,
): string | null {
  const value = raw[key]
  if (value === undefined || value === null) return defaultValue
  return typeof value === 'string' ? value : defaultValue
}

function readOptionalNullableString(raw: Record<string, unknown>, key: string, errors: string[]): string | null | undefined {
  const value = raw[key]
  if (value === null) return null
  if (typeof value !== 'string') {
    errors.push(`${key} must be a string or null`)
    return undefined
  }
  return value
}

function readVisibility(value: unknown, key: string, errors: string[]): TestCaseVisibility | null {
  if (value !== 'public' && value !== 'hidden') {
    errors.push(`${key} must be public or hidden`)
    return null
  }
  return value
}

function matchesPattern(value: string, pattern: string): boolean {
  const escaped = pattern.split('*').map(escapeRegExp).join('.*')
  return new RegExp(`^${escaped}$`).test(value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function reportOptions(args: Args) {
  return {
    dir: args.packagePath ?? args.dir ?? '',
    recursive: args.recursive,
    dryRun: args.dryRun,
    reportPath: args.reportPath,
    extra: {
      sourceFormat: 'problem-package-v1.1',
      match: args.match,
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
