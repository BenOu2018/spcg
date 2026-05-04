import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { getLocalCppCompilerArgs } from '../shared/cpp-config.js'
import type { LevelRecord } from '../shared/types.js'

export type ParsedLevel = {
  filePath: string
  record: LevelRecord
}

export type ValidationResult = {
  filePath: string
  parsed?: ParsedLevel
  errors: string[]
}

export type ImportReportOptions = {
  dir: string
  dryRun: boolean
  recursive: boolean
  reportPath: string | null
  extra?: Record<string, unknown>
}

export function printValidationErrors(results: ValidationResult[]) {
  for (const result of results) {
    if (result.errors.length === 0) continue
    console.error(`\n${result.filePath}`)
    for (const error of result.errors) {
      console.error(`  - ${error}`)
    }
  }
}

export function printValidatedLevels(parsed: ParsedLevel[]) {
  console.log(`Validated ${parsed.length} level file(s).`)
  for (const level of parsed) {
    const publicCount = level.record.testCases.filter((test) => test.visibility === 'public').length
    const hiddenCount = level.record.testCases.filter((test) => test.visibility === 'hidden').length
    console.log(`- ${level.record.id}: ${level.record.title} (${publicCount} public, ${hiddenCount} hidden)`)
  }
}

export async function writeImportReport(
  options: ImportReportOptions,
  results: ValidationResult[],
  parsed: ParsedLevel[],
) {
  if (!options.reportPath) return

  const reportPath = resolve(options.reportPath)
  await mkdir(dirname(reportPath), { recursive: true })

  const invalid = results.filter((result) => result.errors.length > 0)
  const report = {
    checkedAt: new Date().toISOString(),
    dir: resolve(options.dir),
    recursive: options.recursive,
    dryRun: options.dryRun,
    valid: invalid.length === 0,
    totalFiles: results.length,
    validFiles: parsed.length,
    invalidFiles: invalid.length,
    ...(options.extra ?? {}),
    levels: parsed.map((level) => ({
      filePath: level.filePath,
      levelId: level.record.id,
      title: level.record.title,
      order: level.record.order,
      chapterId: level.record.chapterId,
      difficulty: level.record.difficulty,
      defaultLanguage: level.record.defaultLanguage,
      officialCodeLanguage: level.record.officialCodeLanguage,
      publicCases: level.record.testCases.filter((test) => test.visibility === 'public').length,
      hiddenCases: level.record.testCases.filter((test) => test.visibility === 'hidden').length,
      sisterProblem: level.record.sisterProblem,
      solutionVideoUrl: level.record.solutionVideoUrl,
      statementAssets: level.record.statementAssets,
      importMeta: level.record.importMeta,
    })),
    errors: invalid.map((result) => ({
      filePath: result.filePath,
      errors: result.errors,
    })),
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
}

export async function importLevelRecords(parsed: ParsedLevel[], importBatch: string | null) {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required outside --dry-run mode')
  }

  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString: databaseUrl })
  const rows = parsed.map((level) => toDbRow(level.record, importBatch))
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    for (const row of rows) {
      await client.query(
        `
        INSERT INTO levels (
          id, chapter_id, "order", title, knowledge_point, difficulty, description, statement_assets,
          input_format, output_format, test_cases, hints, solution, official_code, solution_video_url,
          time_limit_ms, memory_limit_mb, starter_code, source, sister_problem, import_meta,
          teacher_notes, guardian_id, story, pass_out_problem_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21,
          $22, $23, $24, $25
        )
        ON CONFLICT (id)
        DO UPDATE SET
          chapter_id = EXCLUDED.chapter_id,
          "order" = EXCLUDED."order",
          title = EXCLUDED.title,
          knowledge_point = EXCLUDED.knowledge_point,
          difficulty = EXCLUDED.difficulty,
          description = EXCLUDED.description,
          statement_assets = EXCLUDED.statement_assets,
          input_format = EXCLUDED.input_format,
          output_format = EXCLUDED.output_format,
          test_cases = EXCLUDED.test_cases,
          hints = EXCLUDED.hints,
          solution = EXCLUDED.solution,
          official_code = EXCLUDED.official_code,
          solution_video_url = EXCLUDED.solution_video_url,
          time_limit_ms = EXCLUDED.time_limit_ms,
          memory_limit_mb = EXCLUDED.memory_limit_mb,
          starter_code = EXCLUDED.starter_code,
          source = EXCLUDED.source,
          sister_problem = EXCLUDED.sister_problem,
          import_meta = EXCLUDED.import_meta,
          teacher_notes = EXCLUDED.teacher_notes,
          guardian_id = EXCLUDED.guardian_id,
          story = EXCLUDED.story,
          pass_out_problem_id = EXCLUDED.pass_out_problem_id
        `,
        [
          row.id,
          row.chapter_id,
          row.order,
          row.title,
          row.knowledge_point,
          toJsonb(row.difficulty),
          row.description,
          toJsonb(row.statement_assets),
          row.input_format,
          row.output_format,
          toJsonb(row.test_cases),
          toJsonb(row.hints),
          toJsonb(row.solution),
          row.official_code,
          row.solution_video_url,
          row.time_limit_ms,
          row.memory_limit_mb,
          row.starter_code,
          toJsonb(row.source),
          toJsonb(row.sister_problem),
          toJsonb(row.import_meta),
          row.teacher_notes,
          row.guardian_id,
          row.story,
          row.pass_out_problem_id,
        ],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }

  console.log(`Imported ${rows.length} level(s) into PostgreSQL.`)
}

export function validateLevelRecord(record: LevelRecord): string[] {
  const errors: string[] = []

  if (record.testCases.length !== 20) {
    errors.push(`${record.id}: testCases must contain exactly 20 cases, got ${record.testCases.length}`)
  }

  const publicCount = record.testCases.filter((test) => test.visibility === 'public').length
  const hiddenCount = record.testCases.filter((test) => test.visibility === 'hidden').length
  if (publicCount < 2 || publicCount > 3) {
    errors.push(`${record.id}: testCases must contain 2-3 public cases, got ${publicCount}`)
  }
  if (publicCount + hiddenCount !== record.testCases.length) {
    errors.push(`${record.id}: all testCases must have visibility public or hidden`)
  }

  const caseIds = new Set<string>()
  record.testCases.forEach((test, index) => {
    if (!/^case-[0-9]{2}$/.test(test.id)) {
      errors.push(`${record.id}: testCases[${index}].id must match case-XX`)
    }
    if (caseIds.has(test.id)) {
      errors.push(`${record.id}: testCases[${index}].id duplicates ${test.id}`)
    }
    caseIds.add(test.id)
  })

  if (record.hints.length !== 3) {
    errors.push(`${record.id}: hints must contain exactly 3 items, got ${record.hints.length}`)
  }

  const hintSteps = record.hints.map((hint) => hint.step).sort()
  if (hintSteps.join(',') !== '1,2,3') {
    errors.push(`${record.id}: hints must include steps 1, 2, and 3 exactly once`)
  }

  if (record.solutionVideoUrl !== null) {
    const isRelativeAsset = record.solutionVideoUrl.startsWith('/video/solutions/')
    const isHttpUrl = record.solutionVideoUrl.startsWith('https://')
    if (!isRelativeAsset && !isHttpUrl) {
      errors.push(`${record.id}: solutionVideoUrl must start with /video/solutions/ or https://`)
    }
  }

  if (!record.officialCode.trim()) {
    errors.push(`${record.id}: officialCode must be present`)
  }

  if (!record.description.trim()) {
    errors.push(`${record.id}: description must be present`)
  }

  return errors
}

export async function checkOfficialCode(record: LevelRecord): Promise<string[]> {
  if (record.officialCodeLanguage === 'python3') {
    const python = findExecutable(['python3', 'python'])
    if (!python) return ['Python3 executable not found; rerun with --skip-code-check only for structural validation']
    return runPythonOfficialCodeCheck(record, python)
  }

  if (record.officialCodeLanguage === 'c') {
    const compiler = findExecutable(['gcc', 'clang', 'cc'])
    if (!compiler) return ['C compiler not found; rerun with --skip-code-check only for structural validation']
    return runNativeOfficialCodeCheck(record, compiler, ['-O2'], 'main.c')
  }

  const compiler = findExecutable(['g++', 'clang++', 'c++'])
  if (!compiler) return ['C++ compiler not found; rerun with --skip-code-check only for structural validation']
  return runNativeOfficialCodeCheck(
    record,
    compiler,
    getLocalCppCompilerArgs(record.officialCodeLanguage),
    'main.cpp',
  )
}

async function runNativeOfficialCodeCheck(
  record: LevelRecord,
  compiler: string,
  compilerArgs: string[],
  sourceFileName: string,
): Promise<string[]> {
  const errors: string[] = []
  const tempDir = await mkdtemp(join(tmpdir(), `spcg-${record.id}-`))
  const sourcePath = join(tempDir, sourceFileName)
  const binaryPath = join(tempDir, 'main')

  try {
    await writeFile(sourcePath, record.officialCode)

    const compile = spawnSync(compiler, [...compilerArgs, sourcePath, '-o', binaryPath], {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    })

    if (compile.status !== 0) {
      return [`${record.id}: officialCode compile failed: ${compile.stderr.trim() || compile.stdout.trim()}`]
    }

    record.testCases.forEach((testCase, index) => {
      const run = spawnSync(binaryPath, [], {
        input: testCase.input,
        encoding: 'utf8',
        timeout: Math.max(record.timeLimitMs + 1000, 5000),
        maxBuffer: 1024 * 1024,
      })

      if (run.error) {
        errors.push(`${record.id}: officialCode case ${index + 1} failed to run: ${run.error.message}`)
        return
      }

      if (run.status !== 0) {
        errors.push(`${record.id}: officialCode case ${index + 1} exited with status ${run.status}`)
        return
      }

      if (normalizeOutput(run.stdout) !== normalizeOutput(testCase.expectedOutput)) {
        errors.push(
          `${record.id}: officialCode case ${index + 1} output mismatch; expected ${JSON.stringify(
            testCase.expectedOutput,
          )}, got ${JSON.stringify(run.stdout)}`,
        )
      }
    })
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }

  return errors
}

async function runPythonOfficialCodeCheck(record: LevelRecord, python: string): Promise<string[]> {
  const errors: string[] = []
  const tempDir = await mkdtemp(join(tmpdir(), `spcg-${record.id}-`))
  const sourcePath = join(tempDir, 'main.py')

  try {
    await writeFile(sourcePath, record.officialCode)

    record.testCases.forEach((testCase, index) => {
      const run = spawnSync(python, [sourcePath], {
        input: testCase.input,
        encoding: 'utf8',
        timeout: Math.max(record.timeLimitMs + 1000, 5000),
        maxBuffer: 1024 * 1024,
      })

      if (run.error) {
        errors.push(`${record.id}: officialCode case ${index + 1} failed to run: ${run.error.message}`)
        return
      }

      if (run.status !== 0) {
        errors.push(`${record.id}: officialCode case ${index + 1} exited with status ${run.status}`)
        return
      }

      if (normalizeOutput(run.stdout) !== normalizeOutput(testCase.expectedOutput)) {
        errors.push(
          `${record.id}: officialCode case ${index + 1} output mismatch; expected ${JSON.stringify(
            testCase.expectedOutput,
          )}, got ${JSON.stringify(run.stdout)}`,
        )
      }
    })
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }

  return errors
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

function toDbRow(record: LevelRecord, importBatch: string | null) {
  return {
    id: record.id,
    chapter_id: record.chapterId,
    order: record.order,
    title: record.title,
    knowledge_point: record.knowledgePoint,
    difficulty: record.difficulty,
    description: record.description,
    statement_assets: record.statementAssets,
    input_format: record.inputFormat,
    output_format: record.outputFormat,
    test_cases: record.testCases,
    hints: record.hints,
    solution: record.solution,
    official_code: record.officialCode,
    solution_video_url: record.solutionVideoUrl,
    time_limit_ms: record.timeLimitMs,
    memory_limit_mb: record.memoryLimitMb,
    starter_code: record.starterCode,
    source: record.source,
    sister_problem: record.sisterProblem,
    teacher_notes: record.teacherNotes ?? null,
    import_meta: {
      ...record.importMeta,
      defaultLanguage: record.defaultLanguage,
      officialCodeLanguage: record.officialCodeLanguage,
      importBatch,
      importedAt: new Date().toISOString(),
    },
    guardian_id: record.guardianId,
    story: record.story,
    pass_out_problem_id: record.passOutProblemId,
  }
}

function toJsonb(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value)
}
