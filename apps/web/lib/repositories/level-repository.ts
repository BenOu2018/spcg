import type {
  Difficulty,
  Hint,
  Level,
  ProblemSource,
  Progress,
  Solution,
  SisterProblem,
  StatementAsset,
  TestCase,
} from '@spcg/shared/types'
import { query } from '@/lib/db'

export type LevelPublicRow = {
  id: string
  chapter_id: string
  order: number
  title: string
  knowledge_point: string
  difficulty: Difficulty
  sister_problem: SisterProblem | null
  description: string
  statement_assets: StatementAsset[] | null
  input_format: string
  output_format: string
  public_cases: TestCase[] | null
  hidden_count: number | null
  hints: Hint[] | null
  solution_unlocked: boolean | null
  time_limit_ms: number
  memory_limit_mb: number
  starter_code: string
  source: ProblemSource | null
  guardian_id: string | null
  story: string | null
  pass_out_problem_id: string | null
} & Record<string, unknown>

export type UnlockedSolutionRow = {
  id: string
  solution: Solution
  official_code: string
  solution_video_url: string | null
}

export type LevelTestStatus = 'draft' | 'review' | 'published' | 'archived'

export type LevelTestSummary = {
  id: string
  chapterId: string
  order: number
  title: string
  knowledgePoint: string
  difficulty: Difficulty
  status: LevelTestStatus
  publicCases: number
  hiddenCases: number
  hintsCount: number
  timeLimitMs: number
  memoryLimitMb: number
  source: ProblemSource
  sisterProblem: SisterProblem | null
  hasStatementAssets: boolean
  hasSolutionVideo: boolean
  updatedAt: string | null
  publishedAt: string | null
}

type LevelInternalRow = {
  id: string
  chapter_id: string
  order: number
  title: string
  knowledge_point: string
  difficulty: Difficulty
  sister_problem: SisterProblem | null
  description: string
  statement_assets: StatementAsset[] | null
  input_format: string
  output_format: string
  test_cases: TestCase[] | null
  hints: Hint[] | null
  solution: Solution
  official_code: string
  solution_video_url: string | null
  time_limit_ms: number
  memory_limit_mb: number
  starter_code: string
  source: ProblemSource | null
  status: LevelTestStatus
  guardian_id: string | null
  story: string | null
  pass_out_problem_id: string | null
  updated_at: string | null
  published_at: string | null
} & Record<string, unknown>

const FALLBACK_SOURCE: ProblemSource = {
  type: 'original',
  name: 'SPCG 原创',
  url: null,
  author: 'Stephen',
  license: null,
  attribution: null,
  notes: 'frontend fallback',
}

export async function listPublicLevels(): Promise<Level[]> {
  const rows = await query<LevelPublicRow>(
    `
    SELECT *
    FROM levels_public
    ORDER BY chapter_id ASC, "order" ASC
    `,
  )

  return rows.map(mapLevelPublicRow)
}

export async function listInternalLevelTestSummaries(): Promise<LevelTestSummary[]> {
  const rows = await query<LevelInternalRow>(
    `
    SELECT id, chapter_id, "order", title, knowledge_point, difficulty, sister_problem,
           description, statement_assets, input_format, output_format, test_cases, hints,
           solution, official_code, solution_video_url, time_limit_ms, memory_limit_mb,
           starter_code, source, status, guardian_id, story, pass_out_problem_id, updated_at, published_at
    FROM levels
    ORDER BY chapter_id ASC, "order" ASC, id ASC
    `,
  )

  return rows.map(mapLevelTestSummary)
}

export async function getInternalLevelForTesting(id: string): Promise<Level | null> {
  const rows = await query<LevelInternalRow>(
    `
    SELECT id, chapter_id, "order", title, knowledge_point, difficulty, sister_problem,
           description, statement_assets, input_format, output_format, test_cases, hints,
           solution, official_code, solution_video_url, time_limit_ms, memory_limit_mb,
           starter_code, source, status, guardian_id, story, pass_out_problem_id, updated_at, published_at
    FROM levels
    WHERE id = $1
    `,
    [id],
  )

  const row = rows[0]
  return row ? mapInternalLevelRow(row) : null
}

export async function getUnlockedSolutions(progress: Progress[]): Promise<Map<string, UnlockedSolutionRow>> {
  const passedLevelIds = progress.filter((item) => item.passed).map((item) => item.levelId)
  if (passedLevelIds.length === 0) return new Map()

  const rows = await query<UnlockedSolutionRow>(
    `
    SELECT id, solution, official_code, solution_video_url
    FROM levels
    WHERE id = ANY($1::text[])
    `,
    [passedLevelIds],
  )

  return new Map(rows.map((row) => [row.id, row]))
}

export function applySolutionUnlocks(
  levels: Level[],
  progress: Progress[],
  unlockedSolutions = new Map<string, UnlockedSolutionRow>(),
): Level[] {
  const passedIds = new Set(progress.filter((item) => item.passed).map((item) => item.levelId))
  return levels.map((level) => ({
    ...level,
    solutionUnlocked: passedIds.has(level.id),
    ...(unlockedSolutions.has(level.id)
      ? {
          solution: unlockedSolutions.get(level.id)?.solution,
          officialCode: unlockedSolutions.get(level.id)?.official_code,
          solutionVideoUrl: unlockedSolutions.get(level.id)?.solution_video_url ?? level.solutionVideoUrl ?? null,
        }
      : {}),
  }))
}

function mapLevelPublicRow(row: LevelPublicRow): Level {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    order: row.order,
    title: row.title,
    knowledgePoint: row.knowledge_point,
    difficulty: row.difficulty,
    sisterProblem: row.sister_problem ?? null,
    description: row.description,
    statementAssets: row.statement_assets ?? [],
    inputFormat: row.input_format,
    outputFormat: row.output_format,
    publicCases: row.public_cases ?? [],
    hiddenCount: row.hidden_count ?? 0,
    hints: row.hints ?? [],
    solutionUnlocked: Boolean(row.solution_unlocked),
    solutionVideoUrl: null,
    timeLimitMs: row.time_limit_ms,
    memoryLimitMb: row.memory_limit_mb,
    starterCode: row.starter_code,
    source: row.source ?? FALLBACK_SOURCE,
    guardianId: row.guardian_id,
    story: row.story,
    passOutProblemId: row.pass_out_problem_id,
  }
}

function mapInternalLevelRow(row: LevelInternalRow): Level {
  const testCases = row.test_cases ?? []
  return {
    id: row.id,
    chapterId: row.chapter_id,
    order: row.order,
    title: row.title,
    knowledgePoint: row.knowledge_point,
    difficulty: row.difficulty,
    sisterProblem: row.sister_problem ?? null,
    description: row.description,
    statementAssets: row.statement_assets ?? [],
    inputFormat: row.input_format,
    outputFormat: row.output_format,
    publicCases: testCases.filter((test) => test.visibility === 'public'),
    hiddenCount: testCases.filter((test) => test.visibility === 'hidden').length,
    hints: row.hints ?? [],
    solutionUnlocked: true,
    solution: row.solution,
    officialCode: row.official_code,
    solutionVideoUrl: row.solution_video_url,
    timeLimitMs: row.time_limit_ms,
    memoryLimitMb: row.memory_limit_mb,
    starterCode: row.starter_code,
    source: row.source ?? FALLBACK_SOURCE,
    guardianId: row.guardian_id,
    story: row.story,
    passOutProblemId: row.pass_out_problem_id,
  }
}

function mapLevelTestSummary(row: LevelInternalRow): LevelTestSummary {
  const testCases = row.test_cases ?? []
  return {
    id: row.id,
    chapterId: row.chapter_id,
    order: row.order,
    title: row.title,
    knowledgePoint: row.knowledge_point,
    difficulty: row.difficulty,
    status: row.status,
    publicCases: testCases.filter((test) => test.visibility === 'public').length,
    hiddenCases: testCases.filter((test) => test.visibility === 'hidden').length,
    hintsCount: row.hints?.length ?? 0,
    timeLimitMs: row.time_limit_ms,
    memoryLimitMb: row.memory_limit_mb,
    source: row.source ?? FALLBACK_SOURCE,
    sisterProblem: row.sister_problem ?? null,
    hasStatementAssets: Boolean(row.statement_assets?.length),
    hasSolutionVideo: Boolean(row.solution_video_url),
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  }
}
