import type {
  CodeErrorAnalysis,
  Language,
  ResolvedLanguage,
  SubmissionErrorAnalysis,
  TestCase,
  Verdict,
} from '@spcg/shared/types'
import { query, queryOne } from '@/lib/db'

export type SubmissionErrorAnalysisContext = {
  submissionId: string
  userId: string
  levelId: string
  code: string
  language: Language
  resolvedLanguage: ResolvedLanguage | null
  status: 'pending' | 'judging' | 'done' | 'error'
  verdict: Verdict | null
  level: {
    title: string
    knowledgePoint: string
    description: string
    inputFormat: string
    outputFormat: string
    publicCases: TestCase[]
    timeLimitMs: number
    memoryLimitMb: number
  }
}

type AnalysisRow = {
  id: string
  submission_id: string
  provider: 'minimax'
  model: string
  verdict_result: Exclude<Verdict['result'], 'AC'>
  analysis: CodeErrorAnalysis
  raw_error: string | null
  prompt_hash: string
  created_at: Date | string
}

type ContextRow = {
  submission_id: string
  user_id: string
  level_id: string
  code: string
  language: Language
  resolved_language: ResolvedLanguage | null
  status: 'pending' | 'judging' | 'done' | 'error'
  verdict: Verdict | null
  title: string
  knowledge_point: string
  description: string
  input_format: string
  output_format: string
  test_cases: TestCase[] | null
  time_limit_ms: number
  memory_limit_mb: number
}

export async function getSubmissionErrorAnalysisContextForUser(input: {
  submissionId: string
  userId: string
}): Promise<SubmissionErrorAnalysisContext | null> {
  return getSubmissionErrorAnalysisContext({
    submissionId: input.submissionId,
    userId: input.userId,
  })
}

export async function getSubmissionErrorAnalysisContextForAdmin(input: {
  submissionId: string
}): Promise<SubmissionErrorAnalysisContext | null> {
  return getSubmissionErrorAnalysisContext({
    submissionId: input.submissionId,
  })
}

async function getSubmissionErrorAnalysisContext(input: {
  submissionId: string
  userId?: string
}): Promise<SubmissionErrorAnalysisContext | null> {
  const values = input.userId ? [input.submissionId, input.userId] : [input.submissionId]
  const row = await queryOne<ContextRow>(
    `
    SELECT
      s.id AS submission_id,
      s.user_id,
      s.level_id,
      s.code,
      s.language,
      s.resolved_language,
      s.status,
      s.verdict,
      l.title,
      l.knowledge_point,
      l.description,
      l.input_format,
      l.output_format,
      l.test_cases,
      l.time_limit_ms,
      l.memory_limit_mb
    FROM submissions s
    JOIN levels l ON l.id = s.level_id
    WHERE s.id = $1
      ${input.userId ? 'AND s.user_id = $2' : ''}
    `,
    values,
  )

  if (!row) return null

  return {
    submissionId: row.submission_id,
    userId: row.user_id,
    levelId: row.level_id,
    code: row.code,
    language: row.language,
    resolvedLanguage: row.resolved_language,
    status: row.status,
    verdict: row.verdict,
    level: {
      title: row.title,
      knowledgePoint: row.knowledge_point,
      description: row.description,
      inputFormat: row.input_format,
      outputFormat: row.output_format,
      publicCases: (row.test_cases ?? []).filter((testCase) => testCase.visibility === 'public'),
      timeLimitMs: row.time_limit_ms,
      memoryLimitMb: row.memory_limit_mb,
    },
  }
}

export async function findSubmissionErrorAnalysis(input: {
  submissionId: string
  provider: 'minimax'
  model: string
  promptHash: string
}): Promise<SubmissionErrorAnalysis | null> {
  const row = await queryOne<AnalysisRow>(
    `
    SELECT id, submission_id, provider, model, verdict_result, analysis, raw_error, prompt_hash, created_at
    FROM submission_error_analyses
    WHERE submission_id = $1 AND provider = $2 AND model = $3 AND prompt_hash = $4
    LIMIT 1
    `,
    [input.submissionId, input.provider, input.model, input.promptHash],
  )

  return row ? mapAnalysisRow(row) : null
}

export async function findLatestSubmissionErrorAnalysis(input: {
  submissionId: string
  provider: 'minimax'
}): Promise<SubmissionErrorAnalysis | null> {
  const row = await queryOne<AnalysisRow>(
    `
    SELECT id, submission_id, provider, model, verdict_result, analysis, raw_error, prompt_hash, created_at
    FROM submission_error_analyses
    WHERE submission_id = $1 AND provider = $2
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [input.submissionId, input.provider],
  )

  return row ? mapAnalysisRow(row) : null
}

export async function insertSubmissionErrorAnalysis(input: {
  submissionId: string
  provider: 'minimax'
  model: string
  verdictResult: Exclude<Verdict['result'], 'AC'>
  analysis: CodeErrorAnalysis
  rawError: string | null
  promptHash: string
}): Promise<SubmissionErrorAnalysis> {
  const rows = await query<AnalysisRow>(
    `
    INSERT INTO submission_error_analyses (
      submission_id, provider, model, verdict_result, analysis, raw_error, prompt_hash
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (submission_id, provider) DO UPDATE
      SET submission_id = EXCLUDED.submission_id
    RETURNING id, submission_id, provider, model, verdict_result, analysis, raw_error, prompt_hash, created_at
    `,
    [
      input.submissionId,
      input.provider,
      input.model,
      input.verdictResult,
      input.analysis,
      input.rawError,
      input.promptHash,
    ],
  )

  const row = rows[0]
  if (!row) throw new Error('Submission error analysis was not saved')
  return mapAnalysisRow(row)
}

function mapAnalysisRow(row: AnalysisRow): SubmissionErrorAnalysis {
  return {
    id: row.id,
    submissionId: row.submission_id,
    provider: row.provider,
    model: row.model,
    verdictResult: row.verdict_result,
    analysis: row.analysis,
    rawError: row.raw_error,
    promptHash: row.prompt_hash,
    createdAt: toIsoString(row.created_at),
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
