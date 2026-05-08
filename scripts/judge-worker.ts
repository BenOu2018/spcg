import { setTimeout as sleep } from 'node:timers/promises'
import { createHash } from 'node:crypto'
import pg from 'pg'
import type { JudgeProgress, Language, ResolvedLanguage, TestCase, Verdict } from '../shared/types.js'
import { runJudge0 } from '../shared/judge0-client.js'
import { getDifficultyCoefficient, getLevelCoinReward } from '../shared/difficulty.js'
import { normalizeLanguageMode, resolveLanguageMode } from '../shared/language-config.js'
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
  test_cases: TestCase[]
  time_limit_ms: number
  memory_limit_mb: number
  assessment_attempt_id: string | null
  assessment_phase: 'realtime' | 'final' | null
  judge_mode: 'fast' | 'full' | null
  max_score: number | null
}

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
        buildJudgeProgress({
          phase: 'queued',
          currentCaseIndex: null,
          runningCaseRange: null,
          completedCases: 0,
          totalCases: row.test_cases.length,
        }),
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

  try {
    console.log(`worker-${workerIndex} judging ${submission.id} (${language})`)
    const verdict = await runJudge0({
      code: submission.code,
      language,
      cases: submission.test_cases,
      timeLimitMs: submission.time_limit_ms,
      memoryLimitMb: submission.memory_limit_mb,
      childMessage: pickMessage,
      runAllCases: submission.judge_mode === 'full',
      onProgress: (progress) => updateSubmissionJudgeProgress(pool, submission.id, progress),
    })

    await finishSubmission(pool, submission, verdict, 'done', language)
  } catch (error) {
    const verdict: Verdict = {
      result: 'Judge Error',
      passedCases: 0,
      totalCases: submission.test_cases.length,
      maxRuntimeMs: 0,
      failedCaseIndex: null,
      childFriendlyMessage: '判题服务暂时没有跑完，请稍后再试一次。',
      errorDetail: error instanceof Error ? error.message : String(error),
    }

    await finishSubmission(pool, submission, verdict, 'error', language)
  }
}

async function finishSubmission(
  pool: pg.Pool,
  submission: ClaimedSubmission,
  verdict: Verdict,
  status: 'done' | 'error',
  resolvedLanguage: ResolvedLanguage,
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
        verdict,
        resolvedLanguage,
        buildJudgeProgress({
          phase: 'completed',
          currentCaseIndex: null,
          runningCaseRange: null,
          completedCases: verdict.caseResults?.length ?? countCompletedCases(verdict, submission.test_cases.length),
          totalCases: submission.test_cases.length,
        }),
      ],
    )

    const score = calculateSubmissionScore(submission, verdict)
    await client.query(
      `
      UPDATE submissions
      SET score = $2, case_results = $3
      WHERE id = $1
      `,
      [submission.id, score, verdict.caseResults ?? null],
    )

    if (submission.assessment_attempt_id) {
      await updateAssessmentAttemptItem(client, submission, verdict, score)
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
    [submissionId, buildJudgeProgress(progress)],
  )
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
  const itemId = pickItemForKnowledgePoint(submission.knowledge_point)
  const inserted = await insertRewardLedger(client, {
    userId: submission.user_id,
    source: 'level_first_ac',
    sourceRef: submission.level_id,
    coinDelta,
    garlicDelta: 0,
    itemId,
    itemQuantity: 1,
    metadata: {
      levelId: submission.level_id,
      submissionId: submission.id,
      knowledgePoint: submission.knowledge_point,
      spcgLevel: difficulty.spcgLevel,
      stars: difficulty.stars,
      difficultyCoefficient,
      itemName: await getItemName(client, itemId),
    },
  })

  if (!inserted) return

  await addInventoryItem(client, submission.user_id, itemId, 1)

  const drop = deterministicGarlicDrop({
    userId: submission.user_id,
    levelId: submission.level_id,
    submissionId: submission.id,
  })
  if (drop.dropped) {
    await insertRewardLedger(client, {
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
  }

  await refreshWallet(client, submission.user_id)
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
  const inserted = await insertRewardLedger(client, {
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

  if (inserted) {
    await refreshWallet(client, submission.user_id)
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
): Promise<boolean> {
  const result = await client.query(
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

  return Boolean(result.rows[0])
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

async function refreshWallet(client: pg.PoolClient, userId: string) {
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
  const title = generateTitle({ garlicBalance, rank })

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
