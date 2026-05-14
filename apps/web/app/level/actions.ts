'use server'

import { auth } from '@/auth'
import { wakeJudgeWorker } from '@/lib/judge-worker-autostart'
import { canUserRunAssessmentLevel } from '@/lib/services/assessment-service'
import { getLevelAccessForUser } from '@/lib/services/level-access-service'
import { getLevelByIdForUser, getUnlockedLevelSolutionForUser } from '@/lib/services/level-service'
import { explainSubmissionErrorForUser } from '@/lib/services/submission-error-analysis-service'
import {
  createUserSubmission,
  getLevelSubmissionHistoryForViewer,
  getUserSubmissionVerdict,
  type LevelSubmissionHistoryResult,
  type SubmissionPollResult,
} from '@/lib/services/submission-service'
import { executeCode } from '@/lib/services/code-runner-service'
import { RATE_LIMIT_ACTIONS, consumeUserRateLimit } from '@/lib/services/rate-limit-service'
import { normalizeOutput, type MockExecutionResult } from '@spcg/shared/judge'
import { normalizeLanguageMode, resolveLanguageMode, type LanguageMode, type ResolvedLanguage } from '@spcg/shared/language-config'
import type { Level, Verdict } from '@spcg/shared/types'

type SubmitCodeInput = {
  levelId: string
  code: string
  languageMode?: LanguageMode
  assessmentAttemptId?: string | null
  assessmentPhase?: 'realtime' | 'final' | null
  judgeMode?: 'fast' | 'full' | null
  maxScore?: number | null
}

type RunCodeInput = {
  levelId: string
  code: string
  stdin: string
  languageMode?: LanguageMode
  assessmentAttemptId?: string | null
}

type SampleRunStatus = Verdict['result'] | 'judging'
type SampleRunResultMap = Record<string, { status: SampleRunStatus; passed: boolean }>
const IDE_JUDGE_RATE_LIMIT_SECONDS = 60

export type RunCodeActionResult = {
  execution: MockExecutionResult
  samples: SampleRunResultMap
  resolvedLanguage: ResolvedLanguage
  engine: 'judge0' | 'mock' | 'error'
  code?: 'rate_limited'
  retryAfterSeconds?: number
}

export type RunPublicSamplesActionResult = {
  samples: SampleRunResultMap
  resolvedLanguage: ResolvedLanguage
  engine: 'judge0' | 'mock' | 'error'
}

export type SubmitCodeActionResult =
  | {
      mode: 'remote'
      submissionId: string
      status: 'pending' | 'judging' | 'done' | 'error'
      language: LanguageMode
      resolvedLanguage: ResolvedLanguage
    }
  | {
      mode: 'mock'
      reason: string
      code?: string
      retryAfterSeconds?: number
    }

export async function runCodeAction(input: RunCodeInput): Promise<RunCodeActionResult> {
  const session = await auth()
  const languageMode = normalizeLanguageMode(input.languageMode)
  const resolvedLanguage = resolveLanguageMode(languageMode, input.code)
  const level = await getLevelByIdForUser(input.levelId, {
    userId: session?.user?.id,
    allowMockFallback: true,
  })

  if (!level) {
    return {
      engine: 'error',
      resolvedLanguage,
      samples: {},
      execution: buildRunError('题目不存在，无法运行代码。'),
    }
  }

  const access = await canRunLevelForUser({
    userId: session?.user?.id,
    levelId: input.levelId,
    assessmentAttemptId: input.assessmentAttemptId ?? null,
  })
  if (!access.allowed) {
    return {
      engine: 'error',
      resolvedLanguage,
      samples: {},
      execution: buildRunError(access.reason ?? '当前关卡尚未解锁，无法运行代码。'),
    }
  }

  const rateLimit = await consumeIdeJudgeRateLimit(session?.user?.id)
  if (!rateLimit.allowed) {
    return {
      engine: 'error',
      resolvedLanguage,
      samples: {},
      execution: buildRunError(rateLimit.message),
      code: 'rate_limited',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    }
  }

  try {
    const [execution, samples] = await Promise.all([
      executeCode({
        code: input.code,
        language: resolvedLanguage,
        stdin: input.stdin,
        timeLimitMs: level.timeLimitMs,
        memoryLimitMb: level.memoryLimitMb,
      }),
      runVisiblePublicSamplesForLevel({
        level,
        code: input.code,
        resolvedLanguage,
      }),
    ])

    return {
      engine: isJudge0Configured() ? 'judge0' : 'mock',
      resolvedLanguage,
      execution,
      samples,
      retryAfterSeconds: IDE_JUDGE_RATE_LIMIT_SECONDS,
    }
  } catch (error) {
    return {
      engine: 'error',
      resolvedLanguage,
      samples: {},
      execution: buildRunError(error instanceof Error ? error.message : 'Judge0 运行失败。'),
      retryAfterSeconds: IDE_JUDGE_RATE_LIMIT_SECONDS,
    }
  }
}

export async function runPublicSamplesAction(input: SubmitCodeInput): Promise<RunPublicSamplesActionResult> {
  const session = await auth()
  const languageMode = normalizeLanguageMode(input.languageMode)
  const resolvedLanguage = resolveLanguageMode(languageMode, input.code)
  const level = await getLevelByIdForUser(input.levelId, {
    userId: session?.user?.id,
    allowMockFallback: true,
  })

  if (!level) {
    return {
      engine: 'error',
      resolvedLanguage,
      samples: {},
    }
  }

  const access = await canRunLevelForUser({
    userId: session?.user?.id,
    levelId: input.levelId,
    assessmentAttemptId: input.assessmentAttemptId ?? null,
  })
  if (!access.allowed) {
    return {
      engine: 'error',
      resolvedLanguage,
      samples: {},
    }
  }

  const rateLimit = await consumeIdeJudgeRateLimit(session?.user?.id)
  if (!rateLimit.allowed) {
    return {
      engine: 'error',
      resolvedLanguage,
      samples: {},
    }
  }

  return {
    engine: isJudge0Configured() ? 'judge0' : 'mock',
    resolvedLanguage,
    samples: await runVisiblePublicSamplesForLevel({
      level,
      code: input.code,
      resolvedLanguage,
    }),
  }
}

export async function submitCodeAction(input: SubmitCodeInput): Promise<SubmitCodeActionResult> {
  const session = await auth()
  const languageMode = normalizeLanguageMode(input.languageMode)
  const result = await createUserSubmission({
    userId: session?.user?.id,
    levelId: input.levelId,
    code: input.code,
    language: languageMode,
    assessmentAttemptId: input.assessmentAttemptId ?? null,
    assessmentPhase: input.assessmentPhase ?? null,
    judgeMode: input.judgeMode ?? null,
    maxScore: input.maxScore ?? null,
  })

  if (!result.ok) {
    return {
      mode: 'mock',
      reason: result.reason,
      code: result.code,
      retryAfterSeconds: result.retryAfterSeconds,
    }
  }

  wakeJudgeWorker()

  return {
    mode: 'remote',
    submissionId: result.submissionId,
    status: result.status,
    language: result.language,
    resolvedLanguage: result.resolvedLanguage,
  }
}

export async function getSubmissionVerdictAction(submissionId: string): Promise<SubmissionPollResult> {
  const session = await auth()
  return getUserSubmissionVerdict({
    userId: session?.user?.id,
    submissionId,
  })
}

export async function getSubmissionHistoryAction(levelId: string): Promise<LevelSubmissionHistoryResult> {
  const session = await auth()
  return getLevelSubmissionHistoryForViewer({
    userId: session?.user?.id,
    levelId,
  })
}

export async function getAssessmentSubmissionHistoryAction(input: {
  levelId: string
  assessmentAttemptId: string
}): Promise<LevelSubmissionHistoryResult> {
  const session = await auth()
  return getLevelSubmissionHistoryForViewer({
    userId: session?.user?.id,
    levelId: input.levelId,
    assessmentAttemptId: input.assessmentAttemptId,
  })
}

export async function explainSubmissionErrorAction(input: { submissionId: string }) {
  const session = await auth()
  return explainSubmissionErrorForUser({
    userId: session?.user?.id,
    submissionId: input.submissionId,
  })
}

export async function getUnlockedLevelSolutionAction(levelId: string) {
  const session = await auth()
  return getUnlockedLevelSolutionForUser({
    userId: session?.user?.id,
    levelId,
  })
}

function buildRunError(message: string): MockExecutionResult {
  return {
    result: 'Judge Error',
    stdout: '',
    maxRuntimeMs: 0,
    errorDetail: message,
  }
}

async function runVisiblePublicSamplesForLevel(input: {
  level: Level
  code: string
  resolvedLanguage: ResolvedLanguage
}): Promise<SampleRunResultMap> {
  const entries = await Promise.all(
    input.level.publicCases.slice(0, 2).map(async (sample) => {
      try {
        const execution = await executeCode({
          code: input.code,
          language: input.resolvedLanguage,
          stdin: sample.input,
          timeLimitMs: input.level.timeLimitMs,
          memoryLimitMb: input.level.memoryLimitMb,
        })
        const passed = execution.result === 'AC' && normalizeOutput(execution.stdout) === normalizeOutput(sample.expectedOutput)
        const status: SampleRunStatus = execution.result === 'AC' ? (passed ? 'AC' : 'WA') : execution.result
        return [sample.id, { status, passed }] as const
      } catch {
        return [sample.id, { status: 'Judge Error' as const, passed: false }] as const
      }
    }),
  )

  return Object.fromEntries(entries)
}

async function consumeIdeJudgeRateLimit(userId: string | null | undefined) {
  if (!userId) {
    return {
      allowed: true as const,
      retryAfterSeconds: 0,
      message: null,
    }
  }

  return consumeUserRateLimit({
    userId,
    actionKey: RATE_LIMIT_ACTIONS.ideJudge,
    windowSeconds: IDE_JUDGE_RATE_LIMIT_SECONDS,
  })
}

function isJudge0Configured(): boolean {
  return Boolean(process.env.JUDGE0_BASE_URL) && process.env.JUDGE0_MODE !== 'mock'
}

async function canRunLevelForUser(input: {
  userId?: string | null
  levelId: string
  assessmentAttemptId?: string | null
}): Promise<{ allowed: boolean; reason?: string | null }> {
  if (input.assessmentAttemptId) {
    if (!input.userId) return { allowed: false, reason: '当前未登录，无法运行代码。' }

    const allowed = await canUserRunAssessmentLevel({
      userId: input.userId,
      attemptId: input.assessmentAttemptId,
      levelId: input.levelId,
    })

    return {
      allowed,
      reason: allowed ? null : '当前考试不包含这道题，无法运行代码。',
    }
  }

  return getLevelAccessForUser({
    userId: input.userId,
    levelId: input.levelId,
  })
}
