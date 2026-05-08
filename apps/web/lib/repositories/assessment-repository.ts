import type {
  AssessmentAttempt,
  AssessmentAttemptItem,
  AssessmentAttemptStatus,
  AssessmentSession,
  Difficulty,
  Level,
  RewardGrantResult,
  TestCase,
} from '@spcg/shared/types'
import { RANKED_ASSESSMENT_TOTAL_SCORE } from '@spcg/shared/ranked-assessment'
import type { PoolClient } from 'pg'
import { query, queryOne, withTransaction } from '@/lib/db'
import { applySolutionUnlocks } from '@/lib/repositories/level-repository'

type AssessmentSessionRow = {
  id: string
  type: AssessmentSession['type']
  title: string
  problem_set_id: string | null
  duration_seconds: number
  coin_reward: number
  garlic_reward: number
  status: AssessmentSession['status']
  metadata?: Record<string, unknown>
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
}

export type RankedAssessmentHistoryItem = AssessmentAttempt & {
  sessionTitle: string
  spcgLevel: number | null
  dateKey: string | null
}

type RankedAssessmentHistoryRow = AssessmentAttemptRow & {
  session_title: string
  spcg_level: string | number | null
  date_key: string | null
}

type AssessmentAttemptItemRow = {
  attempt_id: string
  level_id: string
  position: number
  display_mode: string
  source: 'lesson' | 'exam-only'
  max_score: number
  latest_realtime_submission_id: string | null
  final_submission_id: string | null
  status: AssessmentAttemptItem['status']
  passed_cases: number
  total_cases: number
  score: number
  verdict: AssessmentAttemptItem['verdict']
}

type RankedCandidateRow = {
  level_id: string
  display_mode: string
  source: 'lesson' | 'exam-only'
  stage_no: number | null
}

type RankedPaperItemInput = {
  levelId: string
  displayMode: string
  source: 'lesson' | 'exam-only'
  maxScore: number
}

type PublicExamLevelRow = {
  id: string
  chapter_id: string
  order: number
  title: string
  knowledge_point: string
  difficulty: Difficulty
  sister_problem: Level['sisterProblem']
  description: string
  statement_assets: Level['statementAssets']
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

const FALLBACK_SOURCE = {
  type: 'original' as const,
  name: 'SPCG 原创',
  url: null,
  author: 'Stephen',
  license: null,
  attribution: null,
  notes: 'ranked assessment',
}

export async function getAssessmentSession(sessionId: string): Promise<AssessmentSession | null> {
  const row = await queryOne<AssessmentSessionRow>(
    `
    SELECT id, type, title, problem_set_id, duration_seconds, coin_reward, garlic_reward, status
    FROM assessment_sessions
    WHERE id = $1
    `,
    [sessionId],
  )

  return row ? mapSessionRow(row) : null
}

export async function getAssessmentSessionByProblemSet(problemSetId: string): Promise<AssessmentSession | null> {
  const row = await queryOne<AssessmentSessionRow>(
    `
    SELECT id, type, title, problem_set_id, duration_seconds, coin_reward, garlic_reward, status
    FROM assessment_sessions
    WHERE problem_set_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [problemSetId],
  )

  return row ? mapSessionRow(row) : null
}

export async function listRankedAssessmentCandidates(input: { spcgLevel: number }): Promise<RankedCandidateRow[]> {
  return query<RankedCandidateRow>(
    `
    WITH lesson_candidates AS (
      SELECT DISTINCT ON (l.id)
        l.id AS level_id,
        COALESCE(psi.metadata->>'displayMode', 'primary') AS display_mode,
        'lesson'::text AS source,
        ps.stage_no
      FROM problem_sets ps
      JOIN problem_set_items psi ON psi.problem_set_id = ps.id
      JOIN levels l ON l.id = psi.level_id
      WHERE
        ps.type = 'lesson'
        AND ps.status = 'published'
        AND ps.visibility = 'student'
        AND ps.spcg_level = $1
        AND ps.stage_no BETWEEN 1 AND 12
        AND l.status = 'published'
        AND COALESCE(psi.metadata->>'displayMode', 'primary') IN ('basic', 'variant')
      ORDER BY l.id, ps.stage_no ASC, psi.position ASC
    ),
    exam_candidates AS (
      SELECT DISTINCT ON (l.id)
        l.id AS level_id,
        COALESCE(psi.metadata->>'examRole', 'advanced') AS display_mode,
        'exam-only'::text AS source,
        ps.stage_no
      FROM problem_set_items psi
      JOIN problem_sets ps ON ps.id = psi.problem_set_id
      JOIN levels l ON l.id = psi.level_id
      WHERE
        ps.status = 'published'
        AND l.status = 'published'
        AND COALESCE(psi.metadata->>'displayMode', 'primary') = 'exam-only'
        AND CASE
          WHEN l.difficulty->>'spcgLevel' ~ '^[0-9]+$' THEN (l.difficulty->>'spcgLevel')::int = $1
          ELSE FALSE
        END
      ORDER BY l.id, ps.updated_at DESC, psi.position ASC
    )
    SELECT level_id, display_mode, source::text AS source, stage_no FROM lesson_candidates
    UNION ALL
    SELECT level_id, display_mode, source::text AS source, stage_no FROM exam_candidates
    `,
    [input.spcgLevel],
  )
}

export async function getOrCreateRankedAssessmentPaper(input: {
  spcgLevel: number
  dateKey: string
  title: string
  items: RankedPaperItemInput[]
}): Promise<{ session: AssessmentSession; items: AssessmentAttemptItem[]; levels: Level[] }> {
  const problemSetId = buildRankedProblemSetId(input.spcgLevel, input.dateKey)
  const sessionId = buildRankedSessionId(input.spcgLevel, input.dateKey)

  return withTransaction(async (client) => {
    await client.query(
      `
      INSERT INTO problem_sets
        (id, title, description, type, status, visibility, metadata, spcg_level)
      VALUES
        ($1, $2, $3, 'assessment', 'published', 'student', $4, $5)
      ON CONFLICT (id)
      DO NOTHING
      `,
      [
        problemSetId,
        input.title,
        `SPCG ${input.spcgLevel}级 ${input.dateKey} 每日段位赛试卷`,
        JSON.stringify({ generatedFor: 'ranked-assessment', dateKey: input.dateKey, spcgLevel: input.spcgLevel }),
        input.spcgLevel,
      ],
    )

    const countResult = await client.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM problem_set_items WHERE problem_set_id = $1',
      [problemSetId],
    )
    const hasItems = Number(countResult.rows[0]?.count ?? 0) > 0

    if (!hasItems) {
      for (const [index, item] of input.items.entries()) {
        await client.query(
          `
          INSERT INTO problem_set_items (problem_set_id, level_id, position, label, required, metadata)
          VALUES ($1, $2, $3, $4, TRUE, $5)
          `,
          [
            problemSetId,
            item.levelId,
            index + 1,
            `${item.displayMode} · ${item.maxScore}分`,
            JSON.stringify({
              displayMode: item.source === 'exam-only' ? 'exam-only' : item.displayMode,
              examRole: item.displayMode,
              source: item.source,
              maxScore: item.maxScore,
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
        ($1, 'exam', $2, $3, 3600, 0, 0, 'published', $4)
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        problem_set_id = EXCLUDED.problem_set_id,
        status = EXCLUDED.status,
        metadata = assessment_sessions.metadata || EXCLUDED.metadata,
        updated_at = NOW()
      `,
      [
        sessionId,
        input.title,
        problemSetId,
        JSON.stringify({
          rankedAssessment: true,
          dateKey: input.dateKey,
          spcgLevel: input.spcgLevel,
          totalScore: RANKED_ASSESSMENT_TOTAL_SCORE,
          futureGarlicCost: 0,
        }),
      ],
    )

    const sessionRow = await client.query<AssessmentSessionRow>(
      `
      SELECT id, type, title, problem_set_id, duration_seconds, coin_reward, garlic_reward, status
      FROM assessment_sessions
      WHERE id = $1
      `,
      [sessionId],
    )
    const session = sessionRow.rows[0]
    if (!session) throw new Error('Ranked assessment session was not created')

    const itemRows = await client.query<AssessmentAttemptItemRow>(
      `
      SELECT
        $1::uuid AS attempt_id,
        psi.level_id,
        psi.position,
        COALESCE(psi.metadata->>'examRole', psi.metadata->>'displayMode', 'basic') AS display_mode,
        COALESCE(psi.metadata->>'source', CASE WHEN psi.metadata->>'displayMode' = 'exam-only' THEN 'exam-only' ELSE 'lesson' END)::text AS source,
        COALESCE((psi.metadata->>'maxScore')::int, 40) AS max_score,
        NULL::uuid AS latest_realtime_submission_id,
        NULL::uuid AS final_submission_id,
        'pending'::text AS status,
        0 AS passed_cases,
        20 AS total_cases,
        0 AS score,
        NULL::jsonb AS verdict
      FROM problem_set_items psi
      WHERE psi.problem_set_id = $2
      ORDER BY psi.position ASC
      `,
      ['00000000-0000-0000-0000-000000000000', problemSetId],
    )

    const levels = await listExamLevelsByProblemSet(client, problemSetId)
    return {
      session: mapSessionRow(session),
      items: itemRows.rows.map(mapAttemptItemRow),
      levels,
    }
  })
}

export async function createAssessmentAttempt(input: {
  userId: string
  sessionId: string
  totalCount: number
  durationSeconds?: number
  items?: AssessmentAttemptItem[]
}): Promise<AssessmentAttempt> {
  return withTransaction(async (client) => {
    const result = await client.query<AssessmentAttemptRow>(
      `
      INSERT INTO assessment_attempts (session_id, user_id, total_count, metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        session_id,
        user_id,
        status,
        started_at,
        finished_at,
        COALESCE(NULLIF(metadata->>'selectedDurationSeconds', '')::int, 3600) AS duration_seconds,
        score,
        accepted_count,
        total_count,
        reward
      `,
      [
        input.sessionId,
        input.userId,
        input.totalCount,
        JSON.stringify({
          selectedDurationSeconds: input.durationSeconds ?? null,
          judgeMode: 'realtime',
          futureGarlicCost: 0,
        }),
      ],
    )
    const row = result.rows[0]
    if (!row) throw new Error('Assessment attempt was not created')

    for (const item of input.items ?? []) {
      await client.query(
        `
        INSERT INTO assessment_attempt_items
          (attempt_id, level_id, position, display_mode, source, max_score, total_cases)
        VALUES ($1, $2, $3, $4, $5, $6, 20)
        ON CONFLICT (attempt_id, level_id) DO NOTHING
        `,
        [row.id, item.levelId, item.position, item.displayMode, item.source, item.maxScore],
      )
    }

    return mapAttemptRow(row)
  })
}

export async function getAssessmentAttemptForUser(input: {
  userId: string
  attemptId: string
}): Promise<AssessmentAttempt | null> {
  const row = await queryOne<AssessmentAttemptRow>(
    `
    SELECT
      aa.id,
      aa.session_id,
      aa.user_id,
      aa.status,
      aa.started_at,
      aa.finished_at,
      COALESCE(NULLIF(aa.metadata->>'selectedDurationSeconds', '')::int, s.duration_seconds, 3600) AS duration_seconds,
      aa.score,
      aa.accepted_count,
      aa.total_count,
      aa.reward
    FROM assessment_attempts aa
    JOIN assessment_sessions s ON s.id = aa.session_id
    WHERE aa.id = $1 AND aa.user_id = $2
    `,
    [input.attemptId, input.userId],
  )

  return row ? mapAttemptRow(row) : null
}

export async function getLatestAssessmentAttemptForUserSession(input: {
  userId: string
  sessionId: string
}): Promise<AssessmentAttempt | null> {
  const row = await queryOne<AssessmentAttemptRow>(
    `
    SELECT
      aa.id,
      aa.session_id,
      aa.user_id,
      aa.status,
      aa.started_at,
      aa.finished_at,
      COALESCE(NULLIF(aa.metadata->>'selectedDurationSeconds', '')::int, s.duration_seconds, 3600) AS duration_seconds,
      aa.score,
      aa.accepted_count,
      aa.total_count,
      aa.reward
    FROM assessment_attempts aa
    JOIN assessment_sessions s ON s.id = aa.session_id
    WHERE aa.user_id = $1 AND aa.session_id = $2 AND aa.status <> 'abandoned'
    ORDER BY aa.created_at DESC
    LIMIT 1
    `,
    [input.userId, input.sessionId],
  )

  return row ? mapAttemptRow(row) : null
}

export async function getLatestActiveAssessmentAttemptForUserSession(input: {
  userId: string
  sessionId: string
}): Promise<AssessmentAttempt | null> {
  const row = await queryOne<AssessmentAttemptRow>(
    `
    SELECT
      aa.id,
      aa.session_id,
      aa.user_id,
      aa.status,
      aa.started_at,
      aa.finished_at,
      COALESCE(NULLIF(aa.metadata->>'selectedDurationSeconds', '')::int, s.duration_seconds, 3600) AS duration_seconds,
      aa.score,
      aa.accepted_count,
      aa.total_count,
      aa.reward
    FROM assessment_attempts aa
    JOIN assessment_sessions s ON s.id = aa.session_id
    WHERE aa.user_id = $1 AND aa.session_id = $2 AND aa.status IN ('in_progress', 'scoring')
    ORDER BY aa.created_at DESC
    LIMIT 1
    `,
    [input.userId, input.sessionId],
  )

  return row ? mapAttemptRow(row) : null
}

export async function listRankedAssessmentAttemptsForUser(input: {
  userId: string
  limit?: number
  spcgLevel?: number | null
}): Promise<RankedAssessmentHistoryItem[]> {
  const values: unknown[] = [input.userId]
  const filters = [
    'aa.user_id = $1',
    "s.type = 'exam'",
    "s.metadata->>'rankedAssessment' = 'true'",
    "aa.status <> 'abandoned'",
  ]

  if (input.spcgLevel) {
    values.push(input.spcgLevel)
    filters.push(`s.metadata->>'spcgLevel' = $${values.length}::text`)
  }

  values.push(input.limit ?? 20)

  const rows = await query<RankedAssessmentHistoryRow>(
    `
    SELECT
      aa.id,
      aa.session_id,
      aa.user_id,
      aa.status,
      aa.started_at,
      aa.finished_at,
      COALESCE(NULLIF(aa.metadata->>'selectedDurationSeconds', '')::int, s.duration_seconds, 3600) AS duration_seconds,
      aa.score,
      aa.accepted_count,
      aa.total_count,
      aa.reward,
      s.title AS session_title,
      CASE
        WHEN s.metadata->>'spcgLevel' ~ '^[0-9]+$' THEN (s.metadata->>'spcgLevel')::int
        ELSE NULL
      END AS spcg_level,
      NULLIF(s.metadata->>'dateKey', '') AS date_key
    FROM assessment_attempts aa
    JOIN assessment_sessions s ON s.id = aa.session_id
    WHERE ${filters.join(' AND ')}
    ORDER BY aa.created_at DESC
    LIMIT $${values.length}
    `,
    values,
  )

  return rows.map(mapRankedHistoryRow)
}

export async function getAssessmentAttemptItems(input: {
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
    WHERE aai.attempt_id = $1 AND aa.user_id = $2
    ORDER BY aai.position ASC
    `,
    [input.attemptId, input.userId],
  )

  return rows.map(mapAttemptItemRow)
}

export async function isAssessmentAttemptLevelForUser(input: {
  userId: string
  attemptId: string
  levelId: string
}): Promise<boolean> {
  const row = await queryOne<{ ok: number }>(
    `
    SELECT 1 AS ok
    FROM assessment_attempts aa
    JOIN assessment_attempt_items aai ON aai.attempt_id = aa.id
    WHERE aa.id = $1 AND aa.user_id = $2 AND aai.level_id = $3 AND aa.status = 'in_progress'
    LIMIT 1
    `,
    [input.attemptId, input.userId, input.levelId],
  )

  return Boolean(row)
}

export async function recordAssessmentRealtimeSubmission(input: {
  userId: string
  attemptId: string
  levelId: string
  submissionId: string
}): Promise<void> {
  await query(
    `
    UPDATE assessment_attempt_items aai
    SET
      latest_realtime_submission_id = $4,
      updated_at = NOW()
    FROM assessment_attempts aa
    WHERE
      aai.attempt_id = aa.id
      AND aai.attempt_id = $1
      AND aa.user_id = $2
      AND aai.level_id = $3
      AND aa.status = 'in_progress'
    `,
    [input.attemptId, input.userId, input.levelId, input.submissionId],
  )
}

export async function listAssessmentAttemptLevels(input: {
  userId: string
  attemptId: string
}): Promise<Level[]> {
  const rows = await query<PublicExamLevelRow>(
    `
    SELECT lp.*
    FROM assessment_attempt_items aai
    JOIN assessment_attempts aa ON aa.id = aai.attempt_id
    JOIN levels_public lp ON lp.id = aai.level_id
    WHERE aai.attempt_id = $1 AND aa.user_id = $2
    ORDER BY aai.position ASC
    `,
    [input.attemptId, input.userId],
  )

  return applySolutionUnlocks(rows.map(mapPublicExamLevelRow), [])
}

export async function finishAssessmentAttempt(input: {
  userId: string
  attemptId: string
  status: Extract<AssessmentAttemptStatus, 'completed' | 'expired'>
  score: number
  acceptedCount: number
  totalCount: number
  reward: RewardGrantResult
}): Promise<AssessmentAttempt> {
  const row = await queryOne<AssessmentAttemptRow>(
    `
    UPDATE assessment_attempts
    SET
      status = CASE WHEN status = 'in_progress' THEN $3 ELSE status END,
      finished_at = CASE WHEN status = 'in_progress' THEN NOW() ELSE finished_at END,
      score = CASE WHEN status = 'in_progress' THEN $4 ELSE score END,
      accepted_count = CASE WHEN status = 'in_progress' THEN $5 ELSE accepted_count END,
      total_count = CASE WHEN status = 'in_progress' THEN $6 ELSE total_count END,
      reward = CASE WHEN status = 'in_progress' THEN $7 ELSE reward END
    WHERE id = $1 AND user_id = $2
    RETURNING id, session_id, user_id, status, started_at, finished_at, score, accepted_count, total_count, reward
    `,
    [input.attemptId, input.userId, input.status, input.score, input.acceptedCount, input.totalCount, input.reward],
  )

  if (!row) throw new Error('Assessment attempt not found')
  return mapAttemptRow(row)
}

export async function queueFinalAssessmentSubmissions(input: {
  userId: string
  attemptId: string
  expired?: boolean
}): Promise<AssessmentAttempt> {
  return withTransaction(async (client) => {
    const attemptResult = await client.query<AssessmentAttemptRow>(
      `
      SELECT id, session_id, user_id, status, started_at, finished_at, score, accepted_count, total_count, reward
      FROM assessment_attempts
      WHERE id = $1 AND user_id = $2
      FOR UPDATE
      `,
      [input.attemptId, input.userId],
    )
    const attempt = attemptResult.rows[0]
    if (!attempt) throw new Error('Assessment attempt not found')
    if (attempt.status !== 'in_progress') return mapAttemptRow(attempt)

    const itemResult = await client.query<AssessmentAttemptItemRow>(
      `
      SELECT
        attempt_id,
        level_id,
        position,
        display_mode,
        source,
        max_score,
        latest_realtime_submission_id,
        final_submission_id,
        status,
        passed_cases,
        total_cases,
        score,
        verdict
      FROM assessment_attempt_items
      WHERE attempt_id = $1
      ORDER BY position ASC
      `,
      [input.attemptId],
    )

    let queuedCount = 0
    for (const item of itemResult.rows) {
      const latest = await client.query<{
        id: string
        code: string
        language: string
        resolved_language: string | null
      }>(
        `
        SELECT id, code, language, resolved_language
        FROM submissions
        WHERE
          assessment_attempt_id = $1
          AND level_id = $2
          AND assessment_phase = 'realtime'
          AND user_id = $3
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [input.attemptId, item.level_id, input.userId],
      )
      const realtime = latest.rows[0]
      if (!realtime) {
        await client.query(
          `
          UPDATE assessment_attempt_items
          SET status = 'done', score = 0, passed_cases = 0, total_cases = 20
          WHERE attempt_id = $1 AND level_id = $2
          `,
          [input.attemptId, item.level_id],
        )
        continue
      }

      const finalSubmission = await client.query<{ id: string }>(
        `
        INSERT INTO submissions
          (user_id, level_id, code, language, resolved_language, status, assessment_attempt_id, assessment_phase, judge_mode, max_score)
        VALUES ($1, $2, $3, $4, $5, 'pending', $6, 'final', 'full', $7)
        RETURNING id
        `,
        [
          input.userId,
          item.level_id,
          realtime.code,
          realtime.language,
          realtime.resolved_language,
          input.attemptId,
          item.max_score,
        ],
      )
      const finalSubmissionId = finalSubmission.rows[0]?.id
      if (!finalSubmissionId) throw new Error('Final assessment submission was not created')
      queuedCount += 1

      await client.query(
        `
        UPDATE assessment_attempt_items
        SET
          status = 'scoring',
          latest_realtime_submission_id = $3,
          final_submission_id = $4
        WHERE attempt_id = $1 AND level_id = $2
        `,
        [input.attemptId, item.level_id, realtime.id, finalSubmissionId],
      )
    }

    const nextStatus = queuedCount > 0 ? 'scoring' : input.expired ? 'expired' : 'completed'
    const scoreResult = await client.query<{ score: string | number; accepted_count: string | number }>(
      `
      SELECT
        COALESCE(SUM(score), 0) AS score,
        COUNT(*) FILTER (WHERE score = max_score AND max_score > 0) AS accepted_count
      FROM assessment_attempt_items
      WHERE attempt_id = $1
      `,
      [input.attemptId],
    )
    const score = toNumber(scoreResult.rows[0]?.score)
    const acceptedCount = toNumber(scoreResult.rows[0]?.accepted_count)

    const updated = await client.query<AssessmentAttemptRow>(
      `
      UPDATE assessment_attempts
      SET
        status = $3,
        finished_at = CASE WHEN $3 IN ('completed', 'expired') THEN NOW() ELSE finished_at END,
        score = $4,
        accepted_count = $5,
        reward = CASE WHEN $3 IN ('completed', 'expired') THEN COALESCE(reward, $6::jsonb) ELSE reward END,
        updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, session_id, user_id, status, started_at, finished_at, score, accepted_count, total_count, reward
      `,
      [
        input.attemptId,
        input.userId,
        nextStatus,
        score,
        acceptedCount,
        JSON.stringify(buildEmptyReward()),
      ],
    )

    const row = updated.rows[0]
    if (!row) throw new Error('Assessment attempt not found')
    return mapAttemptRow(row)
  })
}

export async function refreshAssessmentAttemptScore(input: {
  attemptId: string
  expired?: boolean
}): Promise<void> {
  await withTransaction(async (client) => {
    await syncCompletedFinalSubmissionsToAttemptItems(client, input.attemptId)

    const pending = await client.query<{ count: string }>(
      `
      SELECT COUNT(*) AS count
      FROM assessment_attempt_items
      WHERE attempt_id = $1 AND status <> 'done'
      `,
      [input.attemptId],
    )
    if (Number(pending.rows[0]?.count ?? 0) > 0) return

    const totals = await client.query<{ score: string | number; accepted_count: string | number; total_count: string | number }>(
      `
      SELECT
        COALESCE(SUM(score), 0) AS score,
        COUNT(*) FILTER (WHERE score = max_score AND max_score > 0) AS accepted_count,
        COUNT(*) AS total_count
      FROM assessment_attempt_items
      WHERE attempt_id = $1
      `,
      [input.attemptId],
    )
    const row = totals.rows[0]
    await client.query(
      `
      UPDATE assessment_attempts
      SET
        status = CASE WHEN status = 'scoring' THEN $2 ELSE status END,
        finished_at = CASE WHEN status = 'scoring' THEN NOW() ELSE finished_at END,
        score = $3,
        accepted_count = $4,
        total_count = $5,
        reward = COALESCE(reward, $6::jsonb),
        updated_at = NOW()
      WHERE id = $1 AND status = 'scoring'
      `,
      [
        input.attemptId,
        input.expired ? 'expired' : 'completed',
        toNumber(row?.score),
        toNumber(row?.accepted_count),
        toNumber(row?.total_count),
        JSON.stringify(buildEmptyReward()),
      ],
    )
  })
}

async function syncCompletedFinalSubmissionsToAttemptItems(client: PoolClient, attemptId: string): Promise<void> {
  await client.query(
    `
    UPDATE assessment_attempt_items aai
    SET
      status = 'done',
      passed_cases = GREATEST(0, COALESCE(NULLIF(s.verdict->>'passedCases', '')::int, 0)),
      total_cases = GREATEST(1, COALESCE(NULLIF(s.verdict->>'totalCases', '')::int, aai.total_cases, 20)),
      score = GREATEST(
        0,
        ROUND(
          aai.max_score
          * GREATEST(0, COALESCE(NULLIF(s.verdict->>'passedCases', '')::numeric, 0))
          / GREATEST(1, COALESCE(NULLIF(s.verdict->>'totalCases', '')::numeric, aai.total_cases, 20))
        )::int
      ),
      verdict = s.verdict,
      updated_at = NOW()
    FROM submissions s
    WHERE
      aai.attempt_id = $1
      AND aai.final_submission_id = s.id
      AND aai.status <> 'done'
      AND s.assessment_phase = 'final'
      AND s.status IN ('done', 'error')
      AND s.verdict IS NOT NULL
    `,
    [attemptId],
  )
}

export async function countAcceptedLevelsSince(input: { userId: string; since: string }): Promise<number> {
  const row = await queryOne<{ accepted_count: string | number }>(
    `
    SELECT COUNT(DISTINCT level_id) AS accepted_count
    FROM submissions
    WHERE user_id = $1
      AND created_at >= $2
      AND status = 'done'
      AND verdict->>'result' = 'AC'
    `,
    [input.userId, input.since],
  )

  return toNumber(row?.accepted_count)
}

function mapSessionRow(row: AssessmentSessionRow): AssessmentSession {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    problemSetId: row.problem_set_id,
    durationSeconds: row.duration_seconds,
    coinReward: row.coin_reward,
    garlicReward: row.garlic_reward,
    status: row.status,
  }
}

function mapAttemptRow(row: AssessmentAttemptRow): AssessmentAttempt {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    status: row.status,
    startedAt: toIsoString(row.started_at),
    finishedAt: row.finished_at ? toIsoString(row.finished_at) : null,
    durationSeconds: toNumber(row.duration_seconds) || 3600,
    score: row.score,
    acceptedCount: row.accepted_count,
    totalCount: row.total_count,
    reward: row.reward,
  }
}

function mapRankedHistoryRow(row: RankedAssessmentHistoryRow): RankedAssessmentHistoryItem {
  return {
    ...mapAttemptRow(row),
    sessionTitle: row.session_title,
    spcgLevel: toNullableNumber(row.spcg_level),
    dateKey: row.date_key,
  }
}

function mapAttemptItemRow(row: AssessmentAttemptItemRow): AssessmentAttemptItem {
  return {
    attemptId: row.attempt_id,
    levelId: row.level_id,
    position: row.position,
    displayMode: row.display_mode,
    source: row.source ?? FALLBACK_SOURCE,
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

function mapPublicExamLevelRow(row: PublicExamLevelRow): Level {
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

async function listExamLevelsByProblemSet(client: PoolClient, problemSetId: string): Promise<Level[]> {
  const rows = await client.query<PublicExamLevelRow>(
    `
    SELECT lp.*
    FROM problem_set_items psi
    JOIN levels_public lp ON lp.id = psi.level_id
    WHERE psi.problem_set_id = $1
    ORDER BY psi.position ASC
    `,
    [problemSetId],
  )

  return rows.rows.map(mapPublicExamLevelRow)
}

function buildRankedProblemSetId(spcgLevel: number, dateKey: string): string {
  return `ranked-spcg${spcgLevel}-${dateKey}`
}

function buildRankedSessionId(spcgLevel: number, dateKey: string): string {
  return `ranked-spcg${spcgLevel}-${dateKey}`
}

function buildEmptyReward(): RewardGrantResult {
  return {
    coinDelta: 0,
    garlicDelta: 0,
    items: [],
    rankBefore: 'scrap_iron',
    rankAfter: 'scrap_iron',
    title: '',
    ledgerIds: [],
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

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = toNumber(value)
  return Number.isFinite(number) ? number : null
}
