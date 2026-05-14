import { setTimeout as sleep } from 'node:timers/promises'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import pg from 'pg'
import type { JudgeProgress, Language, ResolvedLanguage, RewardRank, TestCase, TestCaseDataRef, Verdict } from '../shared/types.js'
import { runJudge0 } from '../shared/judge0-client.js'
import { getDifficultyCoefficient, getLevelCoinReward } from '../shared/difficulty.js'
import { normalizeLanguageMode, resolveLanguageMode } from '../shared/language-config.js'
import { getEarnedTitlePoolKeyForRank, pickEarnedTitleFromPool } from '../shared/earned-titles.js'
import { getEligibleLeaderboardRankAwards } from '../shared/leaderboard-rank-awards.js'
import { generateTitle, getRankForCoins } from '../shared/reward-ranks.js'

type Args = {
  once: boolean
  drain: boolean
  pollMs: number
  concurrency: number
}

type ClaimedSubmission = {
  id: string
  user_id: string
  level_id: string
  code: string
  language: Language
  resolved_language: ResolvedLanguage | null
  knowledge_point: string
  difficulty: { spcgLevel?: number; stars?: number } | null
  import_meta: Record<string, unknown> | null
  test_cases: TestCase[]
  time_limit_ms: number
  memory_limit_mb: number
  assessment_attempt_id: string | null
  assessment_phase: 'realtime' | 'final' | null
  judge_mode: 'fast' | 'full' | null
  max_score: number | null
}

type KnowledgeUsageItem = {
  tagId: string
  classification: '编程算法'
  zhName: string
  enName: string
  domain: string
  bandOrLevel: string
}

type LeaderboardRankAwardRow = {
  rank: string | number
  user_id: string
  coin_total: string | number
  rank_score: string | number
  total_participants: string | number
}

const rankedLeaderboardCte = `
WITH source_entries AS (
  SELECT
    rl.user_id,
    rl.source,
    rl.source_ref,
    rl.coin_delta,
    rl.created_at,
    CASE
      WHEN rl.metadata->>'leaderboardQuestionCount' ~ '^[0-9]+$' THEN (rl.metadata->>'leaderboardQuestionCount')::int
      WHEN rl.source = 'assessment_rank_bonus' THEN 0
      WHEN rl.source = 'daily_review_complete' AND rl.metadata->>'acceptedCount' ~ '^[0-9]+$' THEN (rl.metadata->>'acceptedCount')::int
      ELSE 1
    END AS question_count
  FROM reward_ledger rl
  JOIN users u ON u.id = rl.user_id
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN user_admin_states uas ON uas.user_id = u.id
  WHERE rl.source IN ('level_first_ac', 'daily_review_complete', 'assessment_complete', 'assessment_rank_bonus')
    AND rl.coin_delta > 0
    AND rl.metadata->>'spcgLevel' = $1::text
    AND COALESCE(ur.role, 'student') = 'student'
    AND COALESCE(uas.account_status, 'active') = 'active'
),
scored AS (
  SELECT
    user_id,
    COALESCE(SUM(coin_delta), 0)::int AS coin_total,
    COALESCE(SUM(question_count), 0)::int AS passed_count,
    MIN(rl.created_at) AS first_scored_at,
    MAX(rl.created_at) AS last_scored_at
  FROM source_entries rl
  GROUP BY user_id
),
activity AS (
  SELECT
    scored.*,
    GREATEST(0, EXTRACT(EPOCH FROM (NOW() - last_scored_at)) / 86400.0) AS inactive_days
  FROM scored
),
decayed_base AS (
  SELECT
    activity.*,
    CASE
      WHEN inactive_days <= 15 THEN 1.0
      ELSE GREATEST(0.2, 1.0 - CEIL((inactive_days - 15) / 7.0) * 0.1)
    END AS decay_multiplier
  FROM activity
),
decayed AS (
  SELECT
    decayed_base.*,
    ROUND((coin_total * decay_multiplier)::numeric, 1) AS rank_score
  FROM decayed_base
),
ranked AS (
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY rank_score DESC, coin_total DESC, passed_count DESC, first_scored_at ASC, user_id ASC
    ) AS rank,
    user_id,
    coin_total,
    rank_score
  FROM decayed
)
`

const { Pool } = pg

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    await Promise.all(Array.from({ length: args.concurrency }, (_, index) => runWorkerLoop(pool, args, index + 1)))
  } finally {
    await pool.end()
  }
}

async function runWorkerLoop(pool: pg.Pool, args: Args, workerIndex: number) {
  while (true) {
    const claimed = await claimSubmission(pool)
    if (!claimed) {
      if (args.once || args.drain) break
      await sleep(args.pollMs)
      continue
    }

    await judgeSubmission(pool, claimed, workerIndex)
    if (args.once) break
  }
}

async function claimSubmission(pool: pg.Pool): Promise<ClaimedSubmission | null> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const result = await client.query<ClaimedSubmission>(
      `
      SELECT
        s.id,
        s.user_id,
        s.level_id,
        s.code,
        s.language,
        s.resolved_language,
        l.knowledge_point,
        l.difficulty,
        l.import_meta,
        l.test_cases,
        l.time_limit_ms,
        l.memory_limit_mb,
        s.assessment_attempt_id,
        s.assessment_phase,
        s.judge_mode,
        s.max_score
      FROM submissions s
      JOIN levels l ON l.id = s.level_id
      WHERE s.status = 'pending'
      ORDER BY s.created_at ASC
      FOR UPDATE OF s SKIP LOCKED
      LIMIT 1
      `,
    )

    const row = result.rows[0]
    if (!row) {
      await client.query('COMMIT')
      return null
    }

    await client.query(
      `
      UPDATE submissions
      SET status = 'judging', claimed_at = NOW(), judge_progress = $2, updated_at = NOW()
      WHERE id = $1
      `,
      [
        row.id,
        toJsonb(
          buildJudgeProgress({
            phase: 'queued',
            currentCaseIndex: null,
            runningCaseRange: null,
            completedCases: 0,
            totalCases: row.test_cases.length,
          }),
        ),
      ],
    )

    await client.query('COMMIT')
    return row
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function judgeSubmission(pool: pg.Pool, submission: ClaimedSubmission, workerIndex: number) {
  const language = submission.resolved_language ?? resolveLanguageMode(normalizeLanguageMode(submission.language), submission.code)
  const testCases = await resolveFileBackedTestCases(submission.test_cases)

  try {
    console.log(`worker-${workerIndex} judging ${submission.id} (${language})`)
    const verdict = await runJudge0({
      code: submission.code,
      language,
      cases: testCases,
      timeLimitMs: submission.time_limit_ms,
      memoryLimitMb: submission.memory_limit_mb,
      childMessage: pickMessage,
      runAllCases: submission.judge_mode === 'full',
      onProgress: (progress) => updateSubmissionJudgeProgress(pool, submission.id, progress),
    })

    await finishSubmission(pool, submission, verdict, 'done', language, testCases.length)
  } catch (error) {
    const verdict: Verdict = {
      result: 'Judge Error',
      passedCases: 0,
      totalCases: testCases.length,
      maxRuntimeMs: 0,
      failedCaseIndex: null,
      childFriendlyMessage: '判题服务暂时没有跑完，请稍后再试一次。',
      errorDetail: error instanceof Error ? error.message : String(error),
    }

    await finishSubmission(pool, submission, verdict, 'error', language, testCases.length)
  }
}

async function resolveFileBackedTestCases(testCases: TestCase[]): Promise<TestCase[]> {
  const hasFileBackedCase = testCases.some((testCase) => testCase.inputRef || testCase.expectedOutputRef)
  if (!hasFileBackedCase) return testCases

  return Promise.all(
    testCases.map(async (testCase) => {
      if (!testCase.inputRef && !testCase.expectedOutputRef) return testCase
      if (!testCase.inputRef || !testCase.expectedOutputRef) {
        throw new Error(`test case ${testCase.id} must provide both inputRef and expectedOutputRef`)
      }

      const [input, expectedOutput] = await Promise.all([
        readProblemCaseFile(testCase.inputRef),
        readProblemCaseFile(testCase.expectedOutputRef),
      ])
      const { inputRef, expectedOutputRef, inputPreview, ...resolvedTestCase } = testCase
      return {
        ...resolvedTestCase,
        input,
        expectedOutput,
      }
    }),
  )
}

async function readProblemCaseFile(ref: TestCaseDataRef): Promise<string> {
  if (ref.type !== 'file') {
    throw new Error(`unsupported problem case ref type: ${ref.type}`)
  }

  const path = resolveProblemCasePath(ref.path)
  const content = await readFile(path)
  if (process.env.PROBLEM_CASES_VERIFY_HASH === 'true') {
    const sha256 = createHash('sha256').update(content).digest('hex')
    if (sha256 !== ref.sha256) {
      throw new Error(`problem case checksum mismatch: ${ref.path}`)
    }
  }
  return content.toString('utf8')
}

function resolveProblemCasePath(relativePath: string): string {
  if (relativePath.includes('\0') || isAbsolute(relativePath)) {
    throw new Error(`invalid problem case path: ${relativePath}`)
  }

  const baseDir = resolve(process.env.PROBLEM_CASES_DIR ?? 'problem-cases')
  const target = resolve(baseDir, relativePath)
  const rel = relative(baseDir, target)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`problem case path escapes base directory: ${relativePath}`)
  }
  return target
}

async function finishSubmission(
  pool: pg.Pool,
  submission: ClaimedSubmission,
  verdict: Verdict,
  status: 'done' | 'error',
  resolvedLanguage: ResolvedLanguage,
  totalCases: number,
) {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query(
      `
      UPDATE submissions
      SET status = $2, verdict = $3, resolved_language = $4, judge_progress = $5, updated_at = NOW()
      WHERE id = $1
      `,
      [
        submission.id,
        status,
        toJsonb(verdict),
        resolvedLanguage,
        toJsonb(
          buildJudgeProgress({
            phase: 'completed',
            currentCaseIndex: null,
            runningCaseRange: null,
            completedCases: verdict.caseResults?.length ?? countCompletedCases(verdict, totalCases),
            totalCases,
          }),
        ),
      ],
    )

    const score = calculateSubmissionScore(submission, verdict)
    await client.query(
      `
      UPDATE submissions
      SET score = $2, case_results = $3
      WHERE id = $1
      `,
      [submission.id, score, verdict.caseResults ? toJsonb(verdict.caseResults) : null],
    )

    if (submission.assessment_attempt_id) {
      await updateAssessmentAttemptItem(client, submission, verdict, score)
      if (submission.assessment_phase === 'final') {
        const previousProgress = await updateProgress(client, submission, verdict)
        if (verdict.result === 'AC') {
          await grantAcceptedSubmissionReward(client, submission)
          await grantRepairSuccessReward(client, submission, previousProgress)
        }
      }
      await refreshAssessmentAttemptIfReady(client, submission.assessment_attempt_id)
      await client.query('COMMIT')
      console.log(`${submission.id} ${verdict.result} ${verdict.passedCases}/${verdict.totalCases} score=${score}`)
      return
    }

    const previousProgress = await updateProgress(client, submission, verdict)
    if (verdict.result === 'AC') {
      await grantAcceptedSubmissionReward(client, submission)
      await grantRepairSuccessReward(client, submission, previousProgress)
    }
    await client.query('COMMIT')
    console.log(`${submission.id} ${verdict.result} ${verdict.passedCases}/${verdict.totalCases}`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function updateSubmissionJudgeProgress(
  pool: pg.Pool,
  submissionId: string,
  progress: Omit<JudgeProgress, 'updatedAt'>,
) {
  await pool.query(
    `
    UPDATE submissions
    SET judge_progress = $2, updated_at = NOW()
    WHERE id = $1 AND status IN ('pending','judging')
    `,
    [submissionId, toJsonb(buildJudgeProgress(progress))],
  )
}

function toJsonb(value: unknown): string {
  return JSON.stringify(value)
}

function buildJudgeProgress(progress: Omit<JudgeProgress, 'updatedAt'>): JudgeProgress {
  return {
    ...progress,
    currentCaseIndex: progress.currentCaseIndex ?? null,
    runningCaseRange: progress.runningCaseRange ?? null,
    completedCases: Math.max(0, progress.completedCases),
    totalCases: Math.max(0, progress.totalCases),
    updatedAt: new Date().toISOString(),
  }
}

function countCompletedCases(verdict: Verdict, totalCases: number): number {
  if (verdict.result === 'AC') return totalCases
  return Math.max(0, Math.min(totalCases, (verdict.failedCaseIndex ?? -1) + 1))
}

function calculateSubmissionScore(submission: ClaimedSubmission, verdict: Verdict): number {
  if (!submission.max_score || submission.assessment_phase !== 'final') return 0
  const maxScore = Number(submission.max_score)
  const passedCases = Number(verdict.passedCases)
  const totalCases = Number(verdict.totalCases)
  if (!Number.isFinite(maxScore) || maxScore <= 0) return 0
  if (!Number.isFinite(passedCases) || passedCases <= 0) return 0
  return Math.max(0, Math.round((maxScore * passedCases) / Math.max(1, Number.isFinite(totalCases) ? totalCases : 1)))
}

async function updateAssessmentAttemptItem(
  client: pg.PoolClient,
  submission: ClaimedSubmission,
  verdict: Verdict,
  score: number,
) {
  if (!submission.assessment_attempt_id) return

  if (submission.assessment_phase === 'realtime') {
    await client.query(
      `
      UPDATE assessment_attempt_items
      SET
        latest_realtime_submission_id = $3,
        updated_at = NOW()
      WHERE
        attempt_id = $1
        AND level_id = $2
        AND (
          latest_realtime_submission_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM submissions next_submission
            JOIN submissions current_submission ON current_submission.id = assessment_attempt_items.latest_realtime_submission_id
            WHERE
              next_submission.id = $3
              AND next_submission.created_at >= current_submission.created_at
          )
        )
      `,
      [submission.assessment_attempt_id, submission.level_id, submission.id],
    )
    return
  }

  if (submission.assessment_phase === 'final') {
    await client.query(
      `
      UPDATE assessment_attempt_items
      SET
        final_submission_id = $3,
        status = 'done',
        passed_cases = $4,
        total_cases = $5,
        score = $6,
        verdict = $7
      WHERE attempt_id = $1 AND level_id = $2
      `,
      [
        submission.assessment_attempt_id,
        submission.level_id,
        submission.id,
        verdict.passedCases,
        verdict.totalCases,
        score,
        verdict,
      ],
    )
  }
}

async function refreshAssessmentAttemptIfReady(client: pg.PoolClient, attemptId: string) {
  const pending = await client.query<{ count: string }>(
    `
    SELECT COUNT(*) AS count
    FROM assessment_attempt_items
    WHERE attempt_id = $1 AND status <> 'done'
    `,
    [attemptId],
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
    [attemptId],
  )
  const row = totals.rows[0]

  await client.query(
    `
    UPDATE assessment_attempts
    SET
      status = CASE WHEN status = 'scoring' THEN 'completed' ELSE status END,
      finished_at = CASE WHEN status = 'scoring' THEN NOW() ELSE finished_at END,
      score = $2,
      accepted_count = $3,
      total_count = $4,
      reward = COALESCE(reward, $5::jsonb),
      updated_at = NOW()
    WHERE id = $1 AND status = 'scoring'
    `,
    [
      attemptId,
      Number(row?.score ?? 0),
      Number(row?.accepted_count ?? 0),
      Number(row?.total_count ?? 0),
      JSON.stringify({
        coinDelta: 0,
        garlicDelta: 0,
        items: [],
        rankBefore: 'scrap_iron',
        rankAfter: 'scrap_iron',
        title: '',
        ledgerIds: [],
      }),
    ],
  )
}

type PreviousProgress = {
  attempt_count: number
  best_runtime_ms: number | null
  passed: boolean
} | null

async function updateProgress(
  client: pg.PoolClient,
  submission: ClaimedSubmission,
  verdict: Verdict,
): Promise<PreviousProgress> {
  const current = await client.query<{
    attempt_count: number
    best_runtime_ms: number | null
    passed: boolean
  }>(
    `
    SELECT attempt_count, best_runtime_ms, passed
    FROM progress
    WHERE user_id = $1 AND level_id = $2
    `,
    [submission.user_id, submission.level_id],
  )
  const previous = current.rows[0]
  const passed = verdict.result === 'AC' || Boolean(previous?.passed)
  const bestRuntimeMs =
    verdict.result === 'AC'
      ? Math.min(previous?.best_runtime_ms ?? verdict.maxRuntimeMs, verdict.maxRuntimeMs)
      : previous?.best_runtime_ms ?? null

  await client.query(
    `
    INSERT INTO progress
      (user_id, level_id, passed, attempt_count, best_runtime_ms, last_submitted_at, passed_out)
    VALUES ($1, $2, $3, $4, $5, NOW(), FALSE)
    ON CONFLICT (user_id, level_id)
    DO UPDATE SET
      passed = EXCLUDED.passed,
      attempt_count = EXCLUDED.attempt_count,
      best_runtime_ms = EXCLUDED.best_runtime_ms,
      last_submitted_at = EXCLUDED.last_submitted_at,
      passed_out = EXCLUDED.passed_out
    `,
    [submission.user_id, submission.level_id, passed, (previous?.attempt_count ?? 0) + 1, bestRuntimeMs],
  )

  return previous ?? null
}

async function grantAcceptedSubmissionReward(client: pg.PoolClient, submission: ClaimedSubmission) {
  const difficulty = {
    spcgLevel: submission.difficulty?.spcgLevel ?? 1,
    stars: submission.difficulty?.stars ?? 1,
  }
  const difficultyCoefficient = getDifficultyCoefficient(difficulty)
  const coinDelta = getLevelCoinReward(difficulty)
  const firstAcLedgerId = await insertRewardLedger(client, {
    userId: submission.user_id,
    source: 'level_first_ac',
    sourceRef: submission.level_id,
    coinDelta,
    garlicDelta: 0,
    itemId: null,
    itemQuantity: 0,
    metadata: {
      levelId: submission.level_id,
      submissionId: submission.id,
      knowledgePoint: submission.knowledge_point,
      spcgLevel: difficulty.spcgLevel,
      stars: difficulty.stars,
      difficultyCoefficient,
    },
  })

  if (!firstAcLedgerId) return

  const knowledgeItems = await recordKnowledgeUsageForFirstAc(client, submission)
  if (knowledgeItems.length > 0) {
    await client.query(
      `
      UPDATE reward_ledger
      SET metadata = metadata || $2::jsonb
      WHERE id = $1
      `,
      [
        firstAcLedgerId,
        JSON.stringify({
          knowledgeItems: knowledgeItems.map((item) => ({
            itemId: item.tagId,
            tagId: item.tagId,
            name: item.zhName,
            zhName: item.zhName,
            domain: item.domain,
            quantity: 1,
          })),
        }),
      ],
    )
  }
  const ledgerIds = [firstAcLedgerId]

  const drop = deterministicGarlicDrop({
    userId: submission.user_id,
    levelId: submission.level_id,
    submissionId: submission.id,
  })
  if (drop.dropped) {
    const hiddenLedgerId = await insertRewardLedger(client, {
      userId: submission.user_id,
      source: 'hidden_garlic_drop',
      sourceRef: submission.level_id,
      coinDelta: 0,
      garlicDelta: drop.garlic,
      itemId: null,
      itemQuantity: 0,
      metadata: {
        levelId: submission.level_id,
        submissionId: submission.id,
        roll: drop.roll,
      },
    })
    if (hiddenLedgerId) ledgerIds.push(hiddenLedgerId)
  }

  ledgerIds.push(
    ...(await awardLeaderboardRankItems(client, {
      userId: submission.user_id,
      spcgLevel: difficulty.spcgLevel,
      levelId: submission.level_id,
      submissionId: submission.id,
    })),
  )

  await refreshWallet(client, submission.user_id, {
    firstAcLevelId: submission.level_id,
    firstAcSubmissionId: submission.id,
    ledgerIds,
  })
}

async function awardLeaderboardRankItems(
  client: pg.PoolClient,
  input: {
    userId: string
    spcgLevel: number
    levelId: string
    submissionId: string
  },
): Promise<string[]> {
  const result = await client.query<LeaderboardRankAwardRow>(
    `
    ${rankedLeaderboardCte},
    participant_stats AS (
      SELECT COUNT(*)::int AS total_participants FROM ranked
    )
    SELECT
      ranked.rank,
      ranked.user_id,
      ranked.coin_total,
      ranked.rank_score,
      participant_stats.total_participants
    FROM ranked
    CROSS JOIN participant_stats
    WHERE ranked.rank <= 6
    ORDER BY ranked.rank ASC
    `,
    [input.spcgLevel],
  )

  const ledgerIds: string[] = []
  for (const row of result.rows) {
    const rank = toNumber(row.rank)
    const totalParticipants = toNumber(row.total_participants)
    for (const award of getEligibleLeaderboardRankAwards(rank, totalParticipants)) {
      const ledgerId = await insertRewardLedger(client, {
        userId: row.user_id,
        source: 'leaderboard_rank_award',
        sourceRef: `leaderboard:${input.spcgLevel}:${award.itemId}`,
        coinDelta: 0,
        garlicDelta: 0,
        itemId: award.itemId,
        itemQuantity: 1,
        metadata: {
          spcgLevel: input.spcgLevel,
          rank,
          rankScore: toNumber(row.rank_score),
          coinTotal: toNumber(row.coin_total),
          totalParticipants,
          threshold: award.threshold,
          triggerSource: 'level_first_ac',
          triggerSourceRef: input.levelId,
          levelId: input.levelId,
          submissionId: input.submissionId,
          reason: 'leaderboard_rank_entered',
        },
      })
      if (!ledgerId) continue
      await addInventoryItem(client, row.user_id, award.itemId, 1)
      if (row.user_id === input.userId) ledgerIds.push(ledgerId)
    }
  }

  return ledgerIds
}

async function recordKnowledgeUsageForFirstAc(
  client: pg.PoolClient,
  submission: ClaimedSubmission,
): Promise<KnowledgeUsageItem[]> {
  const knowledgeItems = await resolveKnowledgeUsageItems(client, submission)
  const insertedItems: KnowledgeUsageItem[] = []

  for (const item of knowledgeItems) {
    const inserted = await client.query<{ tag_id: string }>(
      `
      INSERT INTO user_knowledge_usage_events (
        user_id,
        level_id,
        submission_id,
        assessment_attempt_id,
        classification,
        tag_id,
        zh_name,
        en_name,
        domain,
        band_or_level,
        source,
        metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'first_ac',$11::jsonb)
      ON CONFLICT (user_id, level_id, classification, tag_id) DO NOTHING
      RETURNING tag_id
      `,
      [
        submission.user_id,
        submission.level_id,
        submission.id,
        submission.assessment_attempt_id,
        item.classification,
        item.tagId,
        item.zhName,
        item.enName,
        item.domain,
        item.bandOrLevel,
        JSON.stringify({
          submissionId: submission.id,
          assessmentAttemptId: submission.assessment_attempt_id,
          assessmentPhase: submission.assessment_phase,
        }),
      ],
    )

    if (!inserted.rows[0]) continue
    insertedItems.push(item)

    await client.query(
      `
      INSERT INTO user_knowledge_usage (
        user_id,
        classification,
        tag_id,
        zh_name,
        en_name,
        domain,
        band_or_level,
        usage_count,
        passed_level_count,
        first_used_at,
        last_used_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,1,1,NOW(),NOW())
      ON CONFLICT (user_id, classification, tag_id)
      DO UPDATE SET
        zh_name = EXCLUDED.zh_name,
        en_name = EXCLUDED.en_name,
        domain = EXCLUDED.domain,
        band_or_level = EXCLUDED.band_or_level,
        usage_count = user_knowledge_usage.usage_count + 1,
        passed_level_count = user_knowledge_usage.passed_level_count + 1,
        last_used_at = NOW(),
        updated_at = NOW()
      `,
      [submission.user_id, item.classification, item.tagId, item.zhName, item.enName, item.domain, item.bandOrLevel],
    )
  }

  return insertedItems
}

async function resolveKnowledgeUsageItems(
  client: pg.PoolClient,
  submission: ClaimedSubmission,
): Promise<KnowledgeUsageItem[]> {
  const snapshotItems = readKnowledgeSnapshotItems(submission.import_meta)
  if (snapshotItems.length > 0) return uniqueKnowledgeItems(snapshotItems)

  const tagIds = readKnowledgeTagIds(submission.import_meta)
  if (tagIds.length > 0) {
    const registryItems = await loadKnowledgeItemsByTagIds(client, tagIds)
    if (registryItems.length > 0) return uniqueKnowledgeItems(registryItems)
  }

  const matched = await findKnowledgeItemByName(client, submission.knowledge_point)
  if (matched) return [matched]

  return [
    {
      tagId: `legacy-${createHash('sha256').update(submission.knowledge_point).digest('hex').slice(0, 12)}`,
      classification: '编程算法',
      zhName: submission.knowledge_point || '算法知识点',
      enName: '',
      domain: 'algorithm',
      bandOrLevel: '',
    },
  ]
}

function readKnowledgeSnapshotItems(importMeta: Record<string, unknown> | null): KnowledgeUsageItem[] {
  const snapshots = Array.isArray(importMeta?.knowledgePointSnapshots) ? importMeta.knowledgePointSnapshots : []
  return snapshots
    .map((snapshot) => {
      if (!isRecord(snapshot)) return null
      if (snapshot.classification !== '编程算法') return null
      const tagId = readNonEmptyString(snapshot.tagId)
      const zhName = readNonEmptyString(snapshot.zhName)
      if (!tagId || !zhName) return null
      return {
        tagId,
        classification: '编程算法' as const,
        zhName,
        enName: readNonEmptyString(snapshot.enName) ?? '',
        domain: readNonEmptyString(snapshot.domain) ?? 'algorithm',
        bandOrLevel: readNonEmptyString(snapshot.bandOrLevel) ?? '',
      }
    })
    .filter((item): item is KnowledgeUsageItem => Boolean(item))
}

function readKnowledgeTagIds(importMeta: Record<string, unknown> | null): string[] {
  const tags = Array.isArray(importMeta?.knowledgeTags) ? importMeta.knowledgeTags : []
  return Array.from(
    new Set(
      tags
        .map((tag) => {
          if (!isRecord(tag)) return ''
          if (tag.classification !== '编程算法') return ''
          return readNonEmptyString(tag.tagId) ?? ''
        })
        .filter(Boolean),
    ),
  )
}

async function loadKnowledgeItemsByTagIds(client: pg.PoolClient, tagIds: string[]): Promise<KnowledgeUsageItem[]> {
  const result = await client.query<{
    tag_id: string
    zh_name: string
    en_name: string
    domain: string
    band_or_level: string
  }>(
    `
    SELECT tag_id, zh_name, en_name, domain, band_or_level
    FROM knowledge_points
    WHERE classification = '编程算法'
      AND tag_id = ANY($1::text[])
    `,
    [tagIds],
  )
  const byTagId = new Map(result.rows.map((row) => [row.tag_id, row]))
  return tagIds.flatMap((tagId) => {
    const row = byTagId.get(tagId)
    return row
      ? [
          {
            tagId: row.tag_id,
            classification: '编程算法' as const,
            zhName: row.zh_name,
            enName: row.en_name,
            domain: row.domain,
            bandOrLevel: row.band_or_level,
          },
        ]
      : []
  })
}

async function findKnowledgeItemByName(
  client: pg.PoolClient,
  knowledgePoint: string,
): Promise<KnowledgeUsageItem | null> {
  const title = knowledgePoint.trim()
  if (!title) return null
  const result = await client.query<{
    tag_id: string
    zh_name: string
    en_name: string
    domain: string
    band_or_level: string
  }>(
    `
    SELECT tag_id, zh_name, en_name, domain, band_or_level
    FROM knowledge_points
    WHERE classification = '编程算法'
      AND (
        zh_name = $1
        OR $1 ILIKE '%' || zh_name || '%'
        OR zh_name ILIKE '%' || $1 || '%'
      )
    ORDER BY
      CASE WHEN zh_name = $1 THEN 0 ELSE 1 END,
      sort_order ASC
    LIMIT 1
    `,
    [title],
  )
  const row = result.rows[0]
  return row
    ? {
        tagId: row.tag_id,
        classification: '编程算法',
        zhName: row.zh_name,
        enName: row.en_name,
        domain: row.domain,
        bandOrLevel: row.band_or_level,
      }
    : null
}

function uniqueKnowledgeItems(items: KnowledgeUsageItem[]): KnowledgeUsageItem[] {
  const seen = new Set<string>()
  const unique: KnowledgeUsageItem[] = []
  for (const item of items) {
    const key = `${item.classification}:${item.tagId}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
  }
  return unique
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

async function grantRepairSuccessReward(
  client: pg.PoolClient,
  submission: ClaimedSubmission,
  previousProgress: PreviousProgress,
) {
  if (!previousProgress || previousProgress.passed || previousProgress.attempt_count <= 0) return

  const difficulty = {
    spcgLevel: submission.difficulty?.spcgLevel ?? 1,
    stars: submission.difficulty?.stars ?? 1,
  }
  const firstAcCoinReward = getLevelCoinReward(difficulty)
  const repairCoinReward = Math.max(1, Math.floor(firstAcCoinReward / 3))
  const insertedLedgerId = await insertRewardLedger(client, {
    userId: submission.user_id,
    source: 'repair_ac',
    sourceRef: submission.level_id,
    coinDelta: repairCoinReward,
    garlicDelta: 0,
    itemId: null,
    itemQuantity: 0,
    metadata: {
      levelId: submission.level_id,
      submissionId: submission.id,
      previousAttemptCount: previousProgress.attempt_count,
      firstAcCoinReward,
      reason: 'fixed_after_failed_attempts',
    },
  })

  if (insertedLedgerId) {
    await refreshWallet(client, submission.user_id, { ledgerIds: [insertedLedgerId] })
  }
}

async function insertRewardLedger(
  client: pg.PoolClient,
  input: {
    userId: string
    source: string
    sourceRef: string
    coinDelta: number
    garlicDelta: number
    itemId: string | null
    itemQuantity: number
    metadata: Record<string, unknown>
  },
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `
    INSERT INTO reward_ledger
      (user_id, source, source_ref, coin_delta, garlic_delta, item_id, item_quantity, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (user_id, source, source_ref) DO NOTHING
    RETURNING id
    `,
    [
      input.userId,
      input.source,
      input.sourceRef,
      input.coinDelta,
      input.garlicDelta,
      input.itemId,
      input.itemQuantity,
      input.metadata,
    ],
  )

  return result.rows[0]?.id ?? null
}

async function addInventoryItem(client: pg.PoolClient, userId: string, itemId: string, quantity: number) {
  await client.query(
    `
    INSERT INTO user_inventory (user_id, item_id, quantity)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET
      quantity = user_inventory.quantity + EXCLUDED.quantity,
      last_acquired_at = NOW()
    `,
    [userId, itemId, quantity],
  )
}

async function refreshWallet(
  client: pg.PoolClient,
  userId: string,
  input: {
    firstAcLevelId?: string
    firstAcSubmissionId?: string
    ledgerIds?: string[]
  } = {},
) {
  const before = await client.query<{ rank: RewardRank }>('SELECT rank FROM user_wallets WHERE user_id = $1', [userId])
  const totals = await client.query<{ coin_total: string | number; garlic_balance: string | number }>(
    `
    SELECT
      COALESCE(SUM(coin_delta), 0) AS coin_total,
      COALESCE(SUM(garlic_delta), 0) AS garlic_balance
    FROM reward_ledger
    WHERE user_id = $1
    `,
    [userId],
  )
  const coinTotal = toNumber(totals.rows[0]?.coin_total)
  const garlicBalance = toNumber(totals.rows[0]?.garlic_balance)
  const rank = getRankForCoins(coinTotal).rank
  const generatedTitle = generateTitle({ garlicBalance, rank })
  const titleAward = input.ledgerIds?.length
    ? await awardEarnedTitleForRankOnce(client, {
        userId,
        levelId: input.firstAcLevelId ?? null,
        submissionId: input.firstAcSubmissionId ?? null,
        rankAfter: rank,
      })
    : null
  const title = titleAward?.titleLabel ?? (await getLatestEarnedTitleLabel(client, userId)) ?? generatedTitle

  await client.query(
    `
    INSERT INTO user_wallets (user_id, coin_total, garlic_balance, rank, title)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id)
    DO UPDATE SET
      coin_total = EXCLUDED.coin_total,
      garlic_balance = EXCLUDED.garlic_balance,
      rank = EXCLUDED.rank,
      title = EXCLUDED.title
    `,
    [userId, coinTotal, garlicBalance, rank, title],
  )

  if (input.ledgerIds?.length) {
    await client.query(
      `
      UPDATE reward_ledger
      SET metadata = metadata || $2::jsonb
      WHERE id = ANY($1::uuid[])
      `,
      [
        input.ledgerIds,
        {
          rankBefore: before.rows[0]?.rank ?? 'scrap_iron',
          rankAfter: rank,
          title,
          titleAward,
        },
      ],
    )
  }
}

async function getItemName(client: pg.PoolClient, itemId: string): Promise<string> {
  const result = await client.query<{ name: string }>('SELECT name FROM inventory_items WHERE id = $1', [itemId])
  return result.rows[0]?.name ?? itemId
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    once: false,
    drain: false,
    pollMs: Number(process.env.JUDGE_WORKER_POLL_MS ?? 1000),
    concurrency: Number(process.env.JUDGE_WORKER_CONCURRENCY ?? 1),
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    const value = argv[i + 1]

    if (token === '--once') {
      args.once = true
      continue
    }

    if (token === '--drain') {
      args.drain = true
      continue
    }

    if (token === '--poll-ms') {
      if (!value) throw new Error('--poll-ms requires a value')
      args.pollMs = Number(value)
      i++
      continue
    }

    if (token === '--concurrency') {
      if (!value) throw new Error('--concurrency requires a value')
      args.concurrency = Number(value)
      i++
      continue
    }

    throw new Error(`Unknown argument: ${token}`)
  }

  args.concurrency = Math.max(1, Math.floor(Number.isFinite(args.concurrency) ? args.concurrency : 1))
  args.pollMs = Math.max(50, Math.floor(Number.isFinite(args.pollMs) ? args.pollMs : 1000))

  return args
}

function pickMessage(result: Verdict['result']) {
  const messages: Record<Verdict['result'], string> = {
    AC: '通过啦！这段代码已经完成任务。',
    WA: '还有测试点没过，先对照公开样例看输出格式。',
    CE: '代码还没编译通过，检查括号、分号或变量名。',
    RE: '程序运行时遇到意外，看看除以 0、越界或输入。',
    TLE: '代码跑太久了，试试减少重复计算。',
    MLE: '程序使用的内存太多了，试试减少数组或缓存的规模。',
    PE: '输出格式还不完全正确，检查空格、换行和标点。',
    'Judge Error': '判题服务遇到问题，请稍后再试。',
  }

  return messages[result]
}

function pickItemForKnowledgePoint(knowledgePoint: string): string {
  if (/二分|查找|搜索/.test(knowledgePoint)) return 'binary-scope'
  if (/递归/.test(knowledgePoint)) return 'recursion-cloak'
  if (/if|分支|判断/.test(knowledgePoint)) return 'branch-badge'
  if (/循环|for|while/.test(knowledgePoint)) return 'loop-charm'
  return 'loop-charm'
}

function deterministicGarlicDrop(input: { userId: string; levelId: string; submissionId: string }) {
  const salt = process.env.REWARD_SALT ?? 'spcg-local-reward-salt'
  const hash = createHash('sha256')
    .update(`${input.userId}:${input.levelId}:${input.submissionId}:${salt}`)
    .digest('hex')
  const roll = Number.parseInt(hash.slice(0, 8), 16) % 100
  return {
    dropped: roll < 8,
    garlic: roll < 2 ? 2 : 1,
    roll,
  }
}

async function awardEarnedTitleForRankOnce(
  client: pg.PoolClient,
  input: {
    userId: string
    levelId: string | null
    submissionId: string | null
    rankAfter: RewardRank
  },
) {
  const existing = await client.query<{ title_key: string }>(
    `
    SELECT title_key
    FROM user_title_records
    WHERE user_id = $1 AND rank_at_award = $2
    LIMIT 1
    `,
    [input.userId, input.rankAfter],
  )
  if (existing.rows[0]) return null

  const poolKey = getEarnedTitlePoolKeyForRank(input.rankAfter)
  const usedRows = await client.query<{ title_label: string }>(
    `
    SELECT title_label
    FROM user_title_records
    WHERE user_id = $1 AND pool_key = $2
    `,
    [input.userId, poolKey],
  )
  const seed = deterministicEarnedTitleSeed({
    userId: input.userId,
    levelId: input.levelId ?? input.rankAfter,
    submissionId: input.submissionId ?? input.rankAfter,
  })
  const title = pickEarnedTitleFromPool({
    poolKey,
    seed,
    usedLabels: usedRows.rows.map((row) => row.title_label),
  })
  const result = await client.query<{
    title_key: string
    title_label: string
    rank_at_award: RewardRank
    pool_key: string
    level_id: string | null
    submission_id: string | null
    awarded_at: Date | string
  }>(
    `
    INSERT INTO user_title_records
      (user_id, title_key, title_label, rank_at_award, pool_key, source, source_ref, level_id, submission_id, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (user_id, rank_at_award) DO NOTHING
    RETURNING title_key, title_label, rank_at_award, pool_key, level_id, submission_id, awarded_at
    `,
    [
      input.userId,
      title.key,
      title.label,
      input.rankAfter,
      poolKey,
      input.levelId ? 'level_first_ac' : 'rank_reached',
      input.levelId ?? input.rankAfter,
      input.levelId,
      input.submissionId,
      {
        titleIndex: title.index,
        seed,
        reason: 'rank_reached',
      },
    ],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    titleKey: row.title_key,
    titleLabel: row.title_label,
    rankAtAward: row.rank_at_award,
    poolKey: row.pool_key,
    levelId: row.level_id,
    submissionId: row.submission_id,
    awardedAt: row.awarded_at instanceof Date ? row.awarded_at.toISOString() : new Date(row.awarded_at).toISOString(),
  }
}

async function getLatestEarnedTitleLabel(client: pg.PoolClient, userId: string): Promise<string | null> {
  const result = await client.query<{ title_label: string }>(
    `
    SELECT title_label
    FROM user_title_records
    WHERE user_id = $1
    ORDER BY awarded_at DESC
    LIMIT 1
    `,
    [userId],
  )
  return result.rows[0]?.title_label ?? null
}

function deterministicEarnedTitleSeed(input: { userId: string; levelId: string; submissionId: string }): number {
  const salt = process.env.REWARD_SALT ?? 'spcg-local-reward-salt'
  const hash = createHash('sha256')
    .update(`${input.userId}:${input.levelId}:${input.submissionId}:earned-title:${salt}`)
    .digest('hex')
  return Number.parseInt(hash.slice(0, 8), 16)
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
