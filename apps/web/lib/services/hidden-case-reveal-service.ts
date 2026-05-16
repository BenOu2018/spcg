import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import type { TestCase, TestCaseDataRef, VerdictCaseResult } from '@spcg/shared/types'
import {
  claimHiddenCaseReveal,
  listHiddenCaseReveals,
  type HiddenCaseRevealRecord,
} from '@/lib/repositories/hidden-case-reveal-repository'
import { getPublishedLevelTestCases } from '@/lib/repositories/level-repository'
import { getHiddenCaseRevealSubmissionForUser, type HiddenCaseRevealSubmission } from '@/lib/repositories/submission-repository'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'

const MAX_HIDDEN_CASE_REVEALS_PER_LEVEL = 4

type HiddenCaseRevealUnavailableCode =
  | 'db_unconfigured'
  | 'unauthorized'
  | 'submission_missing'
  | 'assessment_submission'
  | 'submission_not_done'
  | 'not_failed'
  | 'no_failed_case'
  | 'not_hidden_case'
  | 'level_missing'
  | 'limit_reached'

export type HiddenCaseRevealStatus =
  | {
      ok: true
      available: true
      submissionId: string
      levelId: string
      caseIndex: number
      caseNumber: number
      alreadyRevealed: boolean
      revealedCount: number
      remainingReveals: number
    }
  | {
      ok: true
      available: false
      code: HiddenCaseRevealUnavailableCode
      reason: string
      revealedCount: number
      remainingReveals: number
    }

export type HiddenCaseRevealResult =
  | {
      ok: true
      submissionId: string
      levelId: string
      caseIndex: number
      caseNumber: number
      input: string
      expectedOutput: string
      actualOutput: string | null
      actualOutputRecorded: boolean
      alreadyRevealed: boolean
      revealedCount: number
      remainingReveals: number
    }
  | {
      ok: false
      code: HiddenCaseRevealUnavailableCode
      reason: string
      revealedCount: number
      remainingReveals: number
    }

type RevealContext =
  | {
      ok: true
      submission: HiddenCaseRevealSubmission
      testCase: TestCase
      caseIndex: number
      caseNumber: number
      caseResult: VerdictCaseResult | null
      reveals: HiddenCaseRevealRecord[]
      alreadyRevealed: boolean
      remainingReveals: number
    }
  | (HiddenCaseRevealStatus & { available: false })

export async function getHiddenCaseRevealStatusForUser(input: {
  userId?: string | null
  submissionId: string
}): Promise<HiddenCaseRevealStatus> {
  const context = await getRevealContext(input)
  if (isUnavailableContext(context)) return context

  return {
    ok: true,
    available: true,
    submissionId: context.submission.id,
    levelId: context.submission.levelId,
    caseIndex: context.caseIndex,
    caseNumber: context.caseNumber,
    alreadyRevealed: context.alreadyRevealed,
    revealedCount: context.reveals.length,
    remainingReveals: context.remainingReveals,
  }
}

export async function revealHiddenCaseForUser(input: {
  userId?: string | null
  submissionId: string
}): Promise<HiddenCaseRevealResult> {
  const context = await getRevealContext(input)
  if (isUnavailableContext(context)) {
    return {
      ok: false,
      code: context.code,
      reason: context.reason,
      revealedCount: context.revealedCount,
      remainingReveals: context.remainingReveals,
    }
  }

  const resolvedCase = await resolveTestCaseData(context.testCase)
  const claim = await claimHiddenCaseReveal({
    userId: context.submission.userId,
    levelId: context.submission.levelId,
    testCaseId: context.testCase.id,
    caseIndex: context.caseIndex,
    submissionId: context.submission.id,
    maxReveals: MAX_HIDDEN_CASE_REVEALS_PER_LEVEL,
  })

  if (claim.limitReached) {
    return {
      ok: false,
      code: 'limit_reached',
      reason: '这道题已经显示过 4 个隐藏错误样例，后续隐藏样例不再提示。',
      revealedCount: claim.records.length,
      remainingReveals: 0,
    }
  }

  const actualOutputRecorded = typeof context.caseResult?.stdout === 'string'
  return {
    ok: true,
    submissionId: context.submission.id,
    levelId: context.submission.levelId,
    caseIndex: context.caseIndex,
    caseNumber: context.caseNumber,
    input: resolvedCase.input,
    expectedOutput: resolvedCase.expectedOutput,
    actualOutput: actualOutputRecorded ? context.caseResult?.stdout ?? '' : null,
    actualOutputRecorded,
    alreadyRevealed: context.alreadyRevealed || !claim.created,
    revealedCount: claim.records.length,
    remainingReveals: Math.max(0, MAX_HIDDEN_CASE_REVEALS_PER_LEVEL - claim.records.length),
  }
}

async function getRevealContext(input: {
  userId?: string | null
  submissionId: string
}): Promise<RevealContext> {
  if (!isDatabaseConfigured()) {
    return unavailable('db_unconfigured', '数据库未配置。')
  }

  if (!input.userId) {
    return unavailable('unauthorized', '当前未登录。')
  }

  const submission = await getHiddenCaseRevealSubmissionForUser(input.submissionId, input.userId)
  if (!submission || !submission.verdict) {
    return unavailable('submission_missing', '提交记录不存在。')
  }

  if (submission.assessmentAttemptId) {
    return unavailable('assessment_submission', '考试和复习提交不开放隐藏样例显示。')
  }

  if (submission.status !== 'done' && submission.status !== 'error') {
    return unavailable('submission_not_done', '判题还没有完成。')
  }

  if (submission.verdict.result === 'AC') {
    return unavailable('not_failed', '这次提交已经通过。')
  }

  if (typeof submission.verdict.failedCaseIndex !== 'number') {
    return unavailable('no_failed_case', '这次提交没有可显示的隐藏失败样例。')
  }

  const caseIndex = submission.verdict.failedCaseIndex
  const testCases = await getPublishedLevelTestCases(submission.levelId)
  if (!testCases) {
    return unavailable('level_missing', '题目不存在。')
  }

  const testCase = testCases[caseIndex]
  if (!testCase || testCase.visibility !== 'hidden') {
    return unavailable('not_hidden_case', '这次错误不是隐藏样例错误。')
  }

  const reveals = await listHiddenCaseReveals({
    userId: input.userId,
    levelId: submission.levelId,
  })
  const alreadyRevealed = reveals.some((record) => record.testCaseId === testCase.id)
  if (!alreadyRevealed && reveals.length >= MAX_HIDDEN_CASE_REVEALS_PER_LEVEL) {
    return unavailable('limit_reached', '这道题已经显示过 4 个隐藏错误样例，后续隐藏样例不再提示。', reveals.length, 0)
  }

  return {
    ok: true,
    submission,
    testCase,
    caseIndex,
    caseNumber: caseIndex + 1,
    caseResult: findCaseResult(submission.caseResults ?? submission.verdict.caseResults ?? [], caseIndex),
    reveals,
    alreadyRevealed,
    remainingReveals: Math.max(0, MAX_HIDDEN_CASE_REVEALS_PER_LEVEL - reveals.length),
  }
}

function isUnavailableContext(context: RevealContext): context is HiddenCaseRevealStatus & { available: false } {
  return 'available' in context && context.available === false
}

function unavailable(
  code: HiddenCaseRevealUnavailableCode,
  reason: string,
  revealedCount = 0,
  remainingReveals = 0,
): HiddenCaseRevealStatus & { available: false } {
  return {
    ok: true,
    available: false,
    code,
    reason,
    revealedCount,
    remainingReveals,
  }
}

function findCaseResult(caseResults: VerdictCaseResult[], caseIndex: number): VerdictCaseResult | null {
  return caseResults.find((caseResult) => caseResult.index === caseIndex + 1) ?? null
}

async function resolveTestCaseData(testCase: TestCase): Promise<TestCase> {
  const [input, expectedOutput] = await Promise.all([
    testCase.inputRef ? readProblemCaseFile(testCase.inputRef) : Promise.resolve(testCase.input),
    testCase.expectedOutputRef ? readProblemCaseFile(testCase.expectedOutputRef) : Promise.resolve(testCase.expectedOutput),
  ])

  return {
    ...testCase,
    input,
    expectedOutput,
  }
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

  const configuredBaseDir = process.env.PROBLEM_CASES_DIR
  const baseDir = configuredBaseDir
    ? resolve(/* turbopackIgnore: true */ configuredBaseDir)
    : resolve(process.cwd(), 'problem-cases')
  const target = resolve(baseDir, relativePath)
  const rel = relative(baseDir, target)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`problem case path escapes base directory: ${relativePath}`)
  }
  return target
}
