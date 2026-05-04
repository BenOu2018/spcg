import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type Args = {
  reportPath: string
  batchKey: string
  source: string
}

type ValidationReport = {
  checkedAt: string
  dir: string
  valid: boolean
  totalFiles: number
  validFiles: number
  invalidFiles: number
  levels: Array<{
    filePath: string
    levelId: string
    title: string
    order: number
    chapterId: string
    difficulty: unknown
    publicCases: number
    hiddenCases: number
    sisterProblem?: unknown
    solutionVideoUrl?: string | null
    statementAssets?: unknown
  }>
  errors: Array<{
    filePath: string
    errors: string[]
  }>
}

const DEFAULT_REPORT_PATH = 'problem-bank/reports/incoming-validation.json'

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const report = await readReport(args.reportPath)
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }

  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString: databaseUrl })

  const summary = {
    checkedAt: report.checkedAt,
    dir: report.dir,
    valid: report.valid,
    totalFiles: report.totalFiles,
    validFiles: report.validFiles,
    invalidFiles: report.invalidFiles,
  }

  const client = await pool.connect()
  let batchId = ''

  const passedItems = report.levels.map((level) => ({
    batch_id: batchId,
    level_id: level.levelId,
    title: level.title,
    file_path: level.filePath,
    validation_status: 'passed',
    validation_errors: [],
    payload: {
      order: level.order,
      chapterId: level.chapterId,
      difficulty: level.difficulty,
      publicCases: level.publicCases,
      hiddenCases: level.hiddenCases,
      sisterProblem: level.sisterProblem ?? null,
      solutionVideoUrl: level.solutionVideoUrl ?? null,
      statementAssets: level.statementAssets ?? [],
    },
    status: 'pending',
  }))

  const failedItems = report.errors.map((item, index) => ({
    batch_id: batchId,
    level_id: `invalid-${String(index + 1).padStart(3, '0')}`,
    title: 'Invalid level file',
    file_path: item.filePath,
    validation_status: 'failed',
    validation_errors: item.errors,
    payload: {},
    status: 'pending',
  }))

  const rows = [...passedItems, ...failedItems]
  try {
    await client.query('BEGIN')
    const batch = await client.query<{ id: string }>(
      `
      INSERT INTO level_import_batches (batch_key, source, status, summary)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (batch_key)
      DO UPDATE SET source = EXCLUDED.source, status = EXCLUDED.status, summary = EXCLUDED.summary
      RETURNING id
      `,
      [args.batchKey, args.source, report.valid ? 'validated' : 'draft', JSON.stringify(summary)],
    )
    batchId = batch.rows[0]?.id ?? ''
    if (!batchId) throw new Error('Failed to upsert import batch')

    await client.query('DELETE FROM level_import_items WHERE batch_id = $1', [batchId])

    for (const row of rows) {
      await client.query(
        `
        INSERT INTO level_import_items
          (batch_id, level_id, title, file_path, validation_status, validation_errors, payload, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          batchId,
          row.level_id,
          row.title,
          row.file_path,
          row.validation_status,
          JSON.stringify(row.validation_errors),
          JSON.stringify(row.payload),
          row.status,
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

  console.log(`Synced import batch ${args.batchKey} (${rows.length} item(s)).`)
}

function toJsonb(value: unknown): string {
  return JSON.stringify(value)
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    reportPath: DEFAULT_REPORT_PATH,
    batchKey: `incoming-${new Date().toISOString().slice(0, 10)}`,
    source: 'problem-bank',
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    const value = argv[i + 1]

    if (token === '--report') {
      if (!value) throw new Error('--report requires a value')
      args.reportPath = value
      i++
      continue
    }

    if (token === '--batch-key') {
      if (!value) throw new Error('--batch-key requires a value')
      args.batchKey = value
      i++
      continue
    }

    if (token === '--source') {
      if (!value) throw new Error('--source requires a value')
      args.source = value
      i++
      continue
    }

    throw new Error(`Unknown argument: ${token}`)
  }

  return args
}

async function readReport(reportPath: string): Promise<ValidationReport> {
  const text = await readFile(resolve(reportPath), 'utf8')
  const report = JSON.parse(text) as ValidationReport

  if (!Array.isArray(report.levels) || !Array.isArray(report.errors)) {
    throw new Error('Invalid validation report format')
  }

  return report
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
