import type {
  AssessmentAttempt,
  AssessmentAttemptItem,
  AssessmentAttemptStatus,
  Difficulty,
  Level,
  RewardGrantResult,
  TestCase,
} from '@spcg/shared/types'
import type { PoolClient } from 'pg'
import { query, queryOne, withTransaction } from '@/lib/db'

export type DailyReviewPaperItemInput = {
  levelId: string
  position: number
  sourceProblemSetId: string
  sourceStageNo: number
  sourceSpcgLevel: number
}

export type DailyReviewAttemptMetadata = {
  dailyReview?: boolean
  dateKey?: string
  currentEntryLevelId?: string | null
  currentMapLevelId?: string | null
}

export type DailyReviewAttemptRecord = {
  attempt: AssessmentAttempt
  metadata: DailyReviewAttemptMetadata
  sessionTitle: string
}

export type DailyReviewCompletionState = {
  completed: boolean
  newlyCompleted: boolean
  acceptedCount: number
  totalCount: number
}

type AssessmentAttemptRow = {
  id: string
  session_id: string
  user_id: string
  status: AssessmentAttemptStatus
  started_at: Date | string
  finished_at: Date | string | null
  duration_seconds?: string | number | null
  score: number
  accepted_count: number
  total_count: number
  reward: RewardGrantResult | null
  metadata: DailyReviewAttemptMetadata | null
  session_title: string
}

type AssessmentAttemptItemRow = {
  attempt_id: string
  level_id: string
  position: number
  display_mode: string
  source: AssessmentAttemptItem['source']
  max_score: number
  latest_realtime_submission_id: string | null
  final_submission_id: string | null
  status: AssessmentAttemptItem['status']
  passed_cases: number
  total_cases: number
  score: number
  verdict: AssessmentAttemptItem['verdict']
}

type DailyReviewItemCompletionRow = AssessmentAttemptItemRow & {
  submission_status: string | null
  submission_verdict: AssessmentAttemptItem['verdict']
}

type PublicLevelRow = {
  id: string
  chapter_id: string
  order: number
  title: string
  knowledge_point: string
  difficulty: Difficulty
  sister_problem: Level['sisterProblem']
  description: string
  statement_assets: Level['statementAssets']
  algorithm_graphs: Level['algorithmGraphs']
  localized_content: Level['localizedContent'] | null
  input_format: string
  output_format: string
  public_cases: TestCase[] | null
  hidden_count: number | null
  hints: Level['hints']
  solution_unlocked: boolean | null
  time_limit_ms: number
  memory_limit_mb: number
  starter_code: string
  source: Level['source']
  guardian_id: string | null
  story: string | null
  pass_out_problem_id: string | null
} & Record<string, unknown>

export async function getOrCreateDailyReviewAttempt(input: {
  userId: string
  dateKey: string
  problemSetId: string
  sessionId: string
  title: string
  currentEntryLevelId: string | null
  currentMapLevelId: string | null
  items: DailyReviewPaperItemInput[]
}): Promise<string | null> {
  if (input.items.length === 0) return null

  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`daily-review:${input.sessionId}:${input.userId}`])

    const existing = await selectDailyReviewAttemptId(client, {
      userId: input.userId,
      sessionId: input.sessionId,
    })
    if (existing) return existing

    const metadata = {
      generatedFor: 'daily-review',
      dailyReview: true,
      dateKey: input.dateKey,
      currentEntryLevelId: input.currentEntryLevelId,
      currentMapLevelId: input.currentMapLevelId,
    }

    await client.query(
      `
      INSERT INTO problem_sets
        (id, title, description, type, status, visibility, metadata)
      VALUES
        ($1, $2, $3, 'review', 'published', 'student', $4)
      ON CONFLICT (id)
      DO NOTHING
      `,
      [
        input.problemSetId,
        input.title,
        `每日复习题单 ${input.dateKey}`,
        JSON.stringify(metadata),
      ],
    )

    const countResult = await client.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM problem_set_items WHERE problem_set_id = $1',
      [input.problemSetId],
    )
    const hasItems = Number(countResult.rows[0]?.count ?? 0) > 0

    if (!hasItems) {
      for (const item of input.items) {
        await client.query(
          `
          INSERT INTO problem_set_items (problem_set_id, level_id, position, label, required, metadata)
          VALUES ($1, $2, $3, $4, TRUE, $5)
          `,
          [
            input.problemSetId,
            item.levelId,
            item.position,
            `今日复习 ${item.sourceSpcgLevel}-${item.sourceStageNo}`,
            JSON.stringify({
              displayMode: 'primary',
              source: 'daily-review',
              sourceProblemSetId: item.sourceProblemSetId,
              sourceStageNo: item.sourceStageNo,
              sourceSpcgLevel: item.sourceSpcgLevel,
            }),
          ],
        )
      }
    }

    await client.query(
      `
      INSERT INTO assessment_sessions
        (id, type, title, problem_set_id, duration_seconds, coin_reward, garlic_reward, status, metadata)
      VALUES
        ($1, 'daily_review', $2, $3, 86400, 2, 0, 'published', $4)
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        problem_set_id = EXCLUDED.problem_set_id,
        status = EXCLUDED.status,
        metadata = assessment_sessions.metadata || EXCLUDED.metadata,
        updated_at = NOW()
      `,
      [input.sessionId, input.title, input.problemSetId, JSON.stringify(metadata)],
    )

    const attemptResult = await client.query<{ id: string }>(
      `
      INSERT INTO assessment_attempts (session_id, user_id, total_count, metadata)
      VALUES ($1, $2, (SELECT COUNT(*) FROM problem_set_items WHERE problem_set_id = $3), $4)
      RETURNING id
      `,
      [
        input.sessionId,
        input.userId,
        input.problemSetId,
        JSON.stringify({
          ...metadata,
          selectedDurationSeconds: 86400,
        }),
      ],
    )
    const attemptId = attemptResult.rows[0]?.id
    if (!attemptId) throw new Error('Daily review attempt was not created')

    await client.query(
      `
      INSERT INTO assessment_attempt_items
        (attempt_id, level_id, position, display_mode, source, max_score, total_cases)
      SELECT
        $1,
        psi.level_id,
        psi.position,
        COALESCE(psi.metadata->>'displayMode', 'daily-review'),
        'daily-review',
        1,
        20
      FROM problem_set_items psi
      WHERE psi.problem_set_id = $2
      ORDER BY psi.position ASC
      `,
      [attemptId, input.problemSetId],
    )

    return attemptId
  })
}

export async function getDailyReviewAttemptRecord(input: {
  userId: string
  attemptId: string
}): Promise<DailyReviewAttemptRecord | null> {
  const row = await queryOne<AssessmentAttemptRow>(
    `
    SELECT
      aa.id,
      aa.session_id,
      aa.user_id,
      aa.status,
      aa.started_at,
      aa.finished_at,
      COALESCE(NULLIF(aa.metadata->>'selectedDurationSeconds', '')::int, s.duration_seconds, 86400) AS duration_seconds,
      aa.score,
      aa.accepted_count,
      aa.total_count,
      aa.reward,
      aa.metadata,
      s.title AS session_title
    FROM assessment_attempts aa
    JOIN assessment_sessions s ON s.id = aa.session_id
    WHERE aa.id = $1 AND aa.user_id = $2 AND s.type = 'daily_review'
    `,
    [input.attemptId, input.userId],
  )

  return row ? mapAttemptRecord(row) : null
}

export async function getDailyReviewAttemptItems(input: {
  userId: string
  attemptId: string
}): Promise<AssessmentAttemptItem[]> {
  const rows = await query<AssessmentAttemptItemRow>(
    `
    SELECT
      aai.attempt_id,
      aai.level_id,
      aai.position,
      aai.display_mode,
      aai.source,
      aai.max_score,
      aai.latest_realtime_submission_id,
      aai.final_submission_id,
      aai.status,
      aai.passed_cases,
      aai.total_cases,
      aai.score,
      aai.verdict
    FROM assessment_attempt_items aai
    JOIN assessment_attempts aa ON aa.id = aai.attempt_id
    JOIN assessment_sessions s ON s.id = aa.session_id
    WHERE aai.attempt_id = $1 AND aa.user_id = $2 AND s.type = 'daily_review'
    ORDER BY aai.position ASC
    `,
    [input.attemptId, input.userId],
  )

  return rows.map(mapAttemptItemRow)
}

export async function listDailyReviewAttemptLevels(input: {
  userId: string
  attemptId: string
}): Promise<Level[]> {
  const rows = await query<PublicLevelRow>(
    `
    SELECT lp.*
    FROM assessment_attempt_items aai
    JOIN assessment_attempts aa ON aa.id = aai.attempt_id
    JOIN assessment_sessions s ON s.id = aa.session_id
    JOIN levels_public lp ON lp.id = aai.level_id
    WHERE aai.attempt_id = $1 AND aa.user_id = $2 AND s.type = 'daily_review'
    ORDER BY aai.position ASC
    `,
    [input.attemptId, input.userId],
  )

  return rows.map(mapPublicLevelRow)
}

export async function refreshDailyReviewAttemptCompletion(input: {
  userId: string
  attemptId: string
}): Promise<DailyReviewCompletionState | null> {
  return withTransaction(async (client) => {
    const attemptResult = await client.query<AssessmentAttemptRow>(
      `
      SELECT
        aa.id,
        aa.session_id,
        aa.user_id,
        aa.status,
        aa.started_at,
        aa.finished_at,
        COALESCE(NULLIF(aa.metadata->>'selectedDurationSeconds', '')::int, s.duration_seconds, 86400) AS duration_seconds,
        aa.score,
        aa.accepted_count,
        aa.total_count,
        aa.reward,
        aa.metadata,
        s.title AS session_title
      FROM assessment_attempts aa
      JOIN assessment_sessions s ON s.id = aa.session_id
      WHERE aa.id = $1 AND aa.user_id = $2 AND s.type = 'daily_review'
      FOR UPDATE OF aa
      `,
      [input.attemptId, input.userId],
    )
    const attempt = attemptResult.rows[0]
    if (!attempt) return null

    const itemRows = await client.query<DailyReviewItemCompletionRow>(
      `
      SELECT
        aai.attempt_id,
        aai.level_id,
        aai.position,
        aai.display_mode,
        aai.source,
        aai.max_score,
        aai.latest_realtime_submission_id,
        aai.final_submission_id,
        aai.status,
        aai.passed_cases,
        aai.total_cases,
        aai.score,
        aai.verdict,
        s.status AS submission_status,
        s.verdict AS submission_verdict
      FROM assessment_attempt_items aai
      LEFT JOIN submissions s ON s.id = aai.latest_realtime_submission_id
      WHERE aai.attempt_id = $1
      ORDER BY aai.position ASC
      `,
      [input.attemptId],
    )

    const totalCount = itemRows.rows.length
    let acceptedCount = 0

    for (const item of itemRows.rows) {
      const verdict = item.submission_status === 'done' ? item.submission_verdict : null
      const accepted = verdict?.result === 'AC'
      if (accepted) acceptedCount += 1

      await client.query(
        `
        UPDATE assessment_attempt_items
        SET
          status = $3,
          passed_cases = $4,
          total_cases = $5,
          score = $6,
          verdict = $7::jsonb,
          updated_at = NOW()
        WHERE attempt_id = $1 AND level_id = $2
        `,
        [
          input.attemptId,
          item.level_id,
          accepted ? 'done' : 'pending',
          verdict?.passedCases ?? 0,
          verdict?.totalCases ?? item.total_cases,
          accepted ? item.max_score : 0,
          verdict ? JSON.stringify(verdict) : null,
        ],
      )
    }

    const completed = totalCount > 0 && acceptedCount === totalCount
    const newlyCompleted = completed && attempt.status !== 'completed'
    if (completed && attempt.status === 'in_progress') {
      await client.query(
        `
        UPDATE assessment_attempts
        SET
          status = 'completed',
          finished_at = COALESCE(finished_at, NOW()),
          score = $3,
          accepted_count = $3,
          total_count = $4,
          updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        `,
        [input.attemptId, input.userId, acceptedCount, totalCount],
      )
    } else if (attempt.status === 'in_progress') {
      await client.query(
        `
        UPDATE assessment_attempts
        SET
          score = $3,
          accepted_count = $3,
          total_count = $4,
          updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        `,
        [input.attemptId, input.userId, acceptedCount, totalCount],
      )
    }

    return {
      completed,
      newlyCompleted,
      acceptedCount,
      totalCount,
    }
  })
}

export async function setDailyReviewAttemptReward(input: {
  userId: string
  attemptId: string
  reward: RewardGrantResult
}): Promise<void> {
  await query(
    `
    UPDATE assessment_attempts aa
    SET reward = $3::jsonb, updated_at = NOW()
    FROM assessment_sessions s
    WHERE
      aa.session_id = s.id
      AND aa.id = $1
      AND aa.user_id = $2
      AND s.type = 'daily_review'
    `,
    [input.attemptId, input.userId, JSON.stringify(input.reward)],
  )
}

async function selectDailyReviewAttemptId(
  client: PoolClient,
  input: {
    userId: string
    sessionId: string
  },
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `
    SELECT aa.id
    FROM assessment_attempts aa
    JOIN assessment_sessions s ON s.id = aa.session_id
    WHERE aa.user_id = $1 AND aa.session_id = $2 AND s.type = 'daily_review' AND aa.status <> 'abandoned'
    ORDER BY aa.created_at DESC
    LIMIT 1
    `,
    [input.userId, input.sessionId],
  )

  return result.rows[0]?.id ?? null
}

function mapAttemptRecord(row: AssessmentAttemptRow): DailyReviewAttemptRecord {
  return {
    attempt: {
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      status: row.status,
      startedAt: toIsoString(row.started_at),
      finishedAt: row.finished_at ? toIsoString(row.finished_at) : null,
      durationSeconds: toNumber(row.duration_seconds) || 86400,
      score: row.score,
      acceptedCount: row.accepted_count,
      totalCount: row.total_count,
      reward: row.reward,
      metadata: row.metadata ?? {},
    },
    metadata: row.metadata ?? {},
    sessionTitle: row.session_title,
  }
}

function mapAttemptItemRow(row: AssessmentAttemptItemRow): AssessmentAttemptItem {
  return {
    attemptId: row.attempt_id,
    levelId: row.level_id,
    position: row.position,
    displayMode: row.display_mode,
    source: row.source,
    maxScore: row.max_score,
    latestRealtimeSubmissionId: row.latest_realtime_submission_id,
    finalSubmissionId: row.final_submission_id,
    status: row.status,
    passedCases: row.passed_cases,
    totalCases: row.total_cases,
    score: row.score,
    verdict: row.verdict,
  }
}

function mapPublicLevelRow(row: PublicLevelRow): Level {
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
    algorithmGraphs: row.algorithm_graphs ?? [],
    localizedContent: row.localized_content ?? {},
    inputFormat: row.input_format,
    outputFormat: row.output_format,
    publicCases: row.public_cases ?? [],
    hiddenCount: row.hidden_count ?? 0,
    hints: row.hints ?? [],
    solutionUnlocked: false,
    solutionVideoUrl: null,
    timeLimitMs: row.time_limit_ms,
    memoryLimitMb: row.memory_limit_mb,
    starterCode: row.starter_code,
    source: row.source,
    guardianId: row.guardian_id,
    story: row.story,
    passOutProblemId: row.pass_out_problem_id,
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
