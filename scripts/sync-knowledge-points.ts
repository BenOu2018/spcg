import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'

const { Pool } = pg

type KnowledgePoint = {
  tagId: string
  classification: '编程算法' | '数学'
  zhName: string
  enName: string
  domain: string
  bandOrLevel: string
  commonProblemTypes: string
  recommendation: string
  sourceFile: string
  sourceSection: string
  sortOrder: number
  metadata: Record<string, unknown>
}

type Args = {
  dryRun: boolean
  source: 'all' | 'programming' | 'math'
}

const repoRoot = resolve('.')

const sources = [
  {
    kind: 'programming' as const,
    classification: '编程算法' as const,
    path: 'problem-bank/Knowledge_point.md',
  },
  {
    kind: 'math' as const,
    classification: '数学' as const,
    path: 'problem-bank/Math_Number_Theory_Knowledge_point.md',
  },
]

async function main() {
  const args = readArgs(process.argv.slice(2))
  const selectedSources = sources.filter((source) => args.source === 'all' || source.kind === args.source)
  const points = (await Promise.all(selectedSources.map(readKnowledgePoints))).flat()

  validatePoints(points)

  if (args.dryRun) {
    printSummary(points, 'dry-run')
    return
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')

  const pool = new Pool({ connectionString: databaseUrl })
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    for (const point of points) {
      await client.query(
        `
          INSERT INTO knowledge_points (
            tag_id, classification, zh_name, en_name, domain, band_or_level,
            common_problem_types, recommendation, source_file, source_section, sort_order, metadata
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
          ON CONFLICT (classification, tag_id) DO UPDATE SET
            zh_name = EXCLUDED.zh_name,
            en_name = EXCLUDED.en_name,
            domain = EXCLUDED.domain,
            band_or_level = EXCLUDED.band_or_level,
            common_problem_types = EXCLUDED.common_problem_types,
            recommendation = EXCLUDED.recommendation,
            source_file = EXCLUDED.source_file,
            source_section = EXCLUDED.source_section,
            sort_order = EXCLUDED.sort_order,
            metadata = EXCLUDED.metadata
        `,
        [
          point.tagId,
          point.classification,
          point.zhName,
          point.enName,
          point.domain,
          point.bandOrLevel,
          point.commonProblemTypes,
          point.recommendation,
          point.sourceFile,
          point.sourceSection,
          point.sortOrder,
          JSON.stringify(point.metadata),
        ],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
    await pool.end()
  }

  printSummary(points, 'synced')
}

function readArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, source: 'all' }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') {
      args.dryRun = true
      continue
    }
    if (arg === '--source') {
      const value = argv[index + 1]
      if (value !== 'all' && value !== 'programming' && value !== 'math') {
        throw new Error('--source must be all, programming, or math')
      }
      args.source = value
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return args
}

async function readKnowledgePoints(source: (typeof sources)[number]): Promise<KnowledgePoint[]> {
  const text = await readFile(resolve(repoRoot, source.path), 'utf8')
  const points: KnowledgePoint[] = []
  let section = ''

  for (const line of text.split('\n')) {
    const heading = line.match(/^###\s+(.+)$/)
    if (heading) {
      section = heading[1]?.trim() ?? ''
      continue
    }

    if (!line.startsWith('| ')) continue
    const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cells[0] ?? '')) continue

    if (source.kind === 'programming') {
      points.push(readProgrammingRow(source.path, section, cells, points.length + 1))
    } else {
      points.push(readMathRow(source.path, section, cells, points.length + 1))
    }
  }

  return points
}

function readProgrammingRow(sourceFile: string, section: string, cells: string[], sortOrder: number): KnowledgePoint {
  if (cells.length !== 6) {
    throw new Error(`${sourceFile} ${section}: expected 6 cells, got ${cells.length}`)
  }

  const [tagId, zhName, enName, domain, bandOrLevel, algorithmFamily] = cells
  return {
    tagId: requireCell(tagId, 'tag_id'),
    classification: '编程算法',
    zhName: requireCell(zhName, '中文名'),
    enName: requireCell(enName, '英文名'),
    domain: requireCell(domain, '领域'),
    bandOrLevel: requireCell(bandOrLevel, '学习带/级别'),
    commonProblemTypes: '',
    recommendation: `建议 algorithmFamily: ${requireCell(algorithmFamily, '建议 algorithmFamily')}`,
    sourceFile,
    sourceSection: section,
    sortOrder,
    metadata: {
      algorithmFamily,
      sourceKind: 'programming',
    },
  }
}

function readMathRow(sourceFile: string, section: string, cells: string[], sortOrder: number): KnowledgePoint {
  if (cells.length !== 6) {
    throw new Error(`${sourceFile} ${section}: expected 6 cells, got ${cells.length}`)
  }

  const [tagId, zhName, enName, domain, bandOrLevel, commonProblemTypes] = cells
  return {
    tagId: requireCell(tagId, 'tag_id'),
    classification: '数学',
    zhName: requireCell(zhName, '中文名'),
    enName: requireCell(enName, '英文名'),
    domain: requireCell(domain, '领域'),
    bandOrLevel: requireCell(bandOrLevel, '学习带/级别'),
    commonProblemTypes: requireCell(commonProblemTypes, '常见题型'),
    recommendation: '数学概念标签；作为 primary 或 supporting 取决于题目目标。',
    sourceFile,
    sourceSection: section,
    sortOrder,
    metadata: {
      sourceKind: 'math',
    },
  }
}

function requireCell(value: string | undefined, label: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function validatePoints(points: KnowledgePoint[]) {
  const seen = new Map<string, KnowledgePoint>()
  const errors: string[] = []

  for (const point of points) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(point.tagId)) {
      errors.push(`${point.tagId}: tag_id must be lower kebab-case`)
    }

    const key = `${point.classification}:${point.tagId}`
    const existing = seen.get(key)
    if (existing) {
      errors.push(`${point.tagId}: duplicate tag in ${point.classification}`)
    }
    seen.set(key, point)
  }

  if (errors.length > 0) {
    throw new Error(`Knowledge point validation failed:\n${errors.join('\n')}`)
  }
}

function printSummary(points: KnowledgePoint[], mode: 'dry-run' | 'synced') {
  const byClassification = new Map<string, number>()
  const byBand = new Map<string, number>()

  for (const point of points) {
    byClassification.set(point.classification, (byClassification.get(point.classification) ?? 0) + 1)
    byBand.set(point.bandOrLevel, (byBand.get(point.bandOrLevel) ?? 0) + 1)
  }

  console.log(`knowledge_points ${mode}: ${points.length}`)
  console.log(
    `by classification: ${[...byClassification.entries()].map(([key, value]) => `${key}=${value}`).join(', ')}`,
  )
  console.log(`by band/level: ${[...byBand.entries()].map(([key, value]) => `${key}=${value}`).join(', ')}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
