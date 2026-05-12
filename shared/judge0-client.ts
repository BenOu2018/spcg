import { setTimeout as sleep } from 'node:timers/promises'
import type { JudgeProgress, ResolvedLanguage, TestCase, Verdict } from './types.js'
import {
  aggregateJudgeResults,
  mockExecuteCpp,
  mockJudgeSubmission,
  normalizeOutput,
  type JudgeCaseResult,
  type MockExecutionResult,
} from './judge.js'
import {
  DEFAULT_CPP_LANGUAGE,
  getCompilerOptions,
  getJudge0LanguageId,
  getLanguageLabel,
  resolveLanguageMode,
} from './language-config.js'

type RunJudge0Input = {
  code: string
  language?: ResolvedLanguage
  cases: TestCase[]
  timeLimitMs: number
  memoryLimitMb: number
  childMessage: (result: Verdict['result']) => string
  runAllCases?: boolean
  onProgress?: (progress: JudgeProgressSnapshot) => void | Promise<void>
}

type JudgeProgressSnapshot = Omit<JudgeProgress, 'updatedAt'>

type ExecuteJudge0Input = {
  code: string
  language?: ResolvedLanguage
  stdin: string
  timeLimitMs: number
  memoryLimitMb: number
  maxFileSizeKb?: number
}

type Judge0Token = {
  token?: string
}

type Judge0BatchResult = {
  submissions?: Array<JudgeCaseResult & { token?: string }>
}

const DEFAULT_MIN_MEMORY_LIMIT_KB = 0
const DEFAULT_BATCH_POLL_MS = 200
const DEFAULT_BATCH_TIMEOUT_MS = 45_000
const DEFAULT_CASE_CONCURRENCY = 4
const QUEUED_STATUS_IDS = new Set([1, 2])

export async function runJudge0(input: RunJudge0Input): Promise<Verdict> {
  const baseUrl = process.env.JUDGE0_BASE_URL
  const mode = process.env.JUDGE0_MODE
  const language = input.language ?? resolveLanguageMode('auto', input.code)
  const resolvedInput = { ...input, language }

  if (mode === 'mock' || !baseUrl) {
    await reportJudgeProgress(resolvedInput, {
      currentCaseIndex: input.cases.length > 0 ? 1 : null,
      runningCaseRange: null,
      completedCases: 0,
    })
    const verdict = mockJudgeSubmissionForLanguage(resolvedInput)
    await reportJudgeProgress(resolvedInput, {
      phase: 'completed',
      currentCaseIndex: null,
      runningCaseRange: null,
      completedCases: countCompletedCases(verdict, input.cases.length),
    })
    return verdict
  }

  if (input.cases.length === 0) {
    return aggregateJudgeResults([], input.cases, input.timeLimitMs, input.childMessage, {
      runAllCases: input.runAllCases,
    })
  }

  if (input.runAllCases) {
    return runJudge0AllCases(baseUrl, resolvedInput)
  }

  if (input.cases.length === 1) {
    return runJudge0Sequential(baseUrl, resolvedInput)
  }

  if (process.env.JUDGE0_USE_BATCH === 'true') {
    try {
      return await runJudge0Batch(baseUrl, resolvedInput)
    } catch (error) {
      if (process.env.JUDGE0_BATCH_FALLBACK === 'false') throw error
      console.warn(`Judge0 batch failed, falling back to parallel mode: ${error instanceof Error ? error.message : error}`)
    }
  }

  if (getCaseConcurrency(input.cases.length - 1) <= 1) {
    return runJudge0Sequential(baseUrl, resolvedInput)
  }

  return runJudge0Parallel(baseUrl, resolvedInput)
}

async function runJudge0AllCases(baseUrl: string, input: RunJudge0Input & { language: ResolvedLanguage }): Promise<Verdict> {
  let results: JudgeCaseResult[]

  if (process.env.JUDGE0_USE_BATCH === 'true') {
    try {
      results = await submitAndWaitJudge0Batch(baseUrl, input, input.cases, {
        fromIndex: 1,
        completedOffset: 0,
      })
    } catch (error) {
      if (process.env.JUDGE0_BATCH_FALLBACK === 'false') throw error
      console.warn(`Judge0 batch failed, falling back to parallel mode: ${error instanceof Error ? error.message : error}`)
      results =
        getCaseConcurrency(input.cases.length) <= 1
          ? await submitJudge0CasesSequentially(baseUrl, input, input.cases, {
              fromIndex: 1,
              completedOffset: 0,
            })
          : await submitJudge0CasesConcurrently(baseUrl, input, input.cases, {
              fromIndex: 1,
              completedOffset: 0,
            })
    }
  } else {
    results =
      getCaseConcurrency(input.cases.length) <= 1
        ? await submitJudge0CasesSequentially(baseUrl, input, input.cases, {
            fromIndex: 1,
            completedOffset: 0,
          })
        : await submitJudge0CasesConcurrently(baseUrl, input, input.cases, {
            fromIndex: 1,
            completedOffset: 0,
          })
  }

  return aggregateJudgeResults(results, input.cases, input.timeLimitMs, input.childMessage, { runAllCases: true })
}

export async function executeJudge0(input: ExecuteJudge0Input): Promise<MockExecutionResult> {
  const baseUrl = process.env.JUDGE0_BASE_URL
  const mode = process.env.JUDGE0_MODE
  const language = input.language ?? DEFAULT_CPP_LANGUAGE

  if (mode === 'mock' || !baseUrl) {
    return mockExecuteForLanguage({ ...input, language })
  }

  const response = await fetch(`${trimTrailingSlash(baseUrl)}/submissions?base64_encoded=true&wait=true`, {
    method: 'POST',
    headers: buildJudge0Headers({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(buildExecutionPayload({ ...input, language })),
  })

  if (!response.ok) {
    throw new Error(`Judge0 run request failed: ${response.status} ${await response.text()}`)
  }

  return toExecutionResult(decodeJudge0Result((await response.json()) as JudgeCaseResult), input.timeLimitMs)
}

async function runJudge0Sequential(baseUrl: string, input: RunJudge0Input & { language: ResolvedLanguage }): Promise<Verdict> {
  const caseResults: JudgeCaseResult[] = []

  for (const [index, testCase] of input.cases.entries()) {
    await reportJudgeProgress(input, {
      currentCaseIndex: index + 1,
      runningCaseRange: null,
      completedCases: caseResults.length,
    })
    const caseResult = await submitJudge0Case(baseUrl, input, testCase)
    caseResults.push(caseResult)
    await reportJudgeProgress(input, {
      currentCaseIndex: index + 1 < input.cases.length ? index + 2 : null,
      runningCaseRange: null,
      completedCases: caseResults.length,
    })

    if (!isAcceptedCase(caseResult, testCase, input.timeLimitMs)) {
      break
    }
  }

  return aggregateJudgeResults(caseResults, input.cases, input.timeLimitMs, input.childMessage)
}

async function runJudge0Batch(baseUrl: string, input: RunJudge0Input & { language: ResolvedLanguage }): Promise<Verdict> {
  const firstCase = input.cases[0] as TestCase
  await reportJudgeProgress(input, {
    currentCaseIndex: 1,
    runningCaseRange: null,
    completedCases: 0,
  })
  const firstResult = await submitJudge0Case(baseUrl, input, firstCase)
  await reportJudgeProgress(input, {
    currentCaseIndex: input.cases.length > 1 ? 2 : null,
    runningCaseRange: null,
    completedCases: 1,
  })

  if (!isAcceptedCase(firstResult, firstCase, input.timeLimitMs)) {
    return aggregateJudgeResults([firstResult], input.cases, input.timeLimitMs, input.childMessage)
  }

  const remainingCases = input.cases.slice(1)
  if (remainingCases.length === 0) {
    return aggregateJudgeResults([firstResult], input.cases, input.timeLimitMs, input.childMessage)
  }

  const remainingResults = await submitAndWaitJudge0Batch(baseUrl, input, remainingCases, {
    fromIndex: 2,
    completedOffset: 1,
  })
  return aggregateJudgeResults([firstResult, ...remainingResults], input.cases, input.timeLimitMs, input.childMessage)
}

async function runJudge0Parallel(baseUrl: string, input: RunJudge0Input & { language: ResolvedLanguage }): Promise<Verdict> {
  const firstCase = input.cases[0] as TestCase
  await reportJudgeProgress(input, {
    currentCaseIndex: 1,
    runningCaseRange: null,
    completedCases: 0,
  })
  const firstResult = await submitJudge0Case(baseUrl, input, firstCase)
  await reportJudgeProgress(input, {
    currentCaseIndex: input.cases.length > 1 ? 2 : null,
    runningCaseRange: null,
    completedCases: 1,
  })

  if (!isAcceptedCase(firstResult, firstCase, input.timeLimitMs)) {
    return aggregateJudgeResults([firstResult], input.cases, input.timeLimitMs, input.childMessage)
  }

  const remainingCases = input.cases.slice(1)
  const remainingResults = await submitJudge0CasesConcurrently(baseUrl, input, remainingCases, {
    fromIndex: 2,
    completedOffset: 1,
  })
  return aggregateJudgeResults([firstResult, ...remainingResults], input.cases, input.timeLimitMs, input.childMessage)
}

export async function checkJudge0Health(): Promise<boolean> {
  const baseUrl = process.env.JUDGE0_BASE_URL
  if (!baseUrl) return false

  const response = await fetch(`${trimTrailingSlash(baseUrl)}/languages`, {
    headers: buildJudge0Headers(),
  })
  return response.ok
}

async function submitJudge0Case(
  baseUrl: string,
  input: RunJudge0Input & { language: ResolvedLanguage },
  testCase: TestCase,
): Promise<JudgeCaseResult> {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}/submissions?base64_encoded=true&wait=true`, {
    method: 'POST',
    headers: buildJudge0Headers({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(buildSubmissionPayload(input, testCase)),
  })

  if (!response.ok) {
    throw new Error(`Judge0 request failed: ${response.status} ${await response.text()}`)
  }

  return decodeJudge0Result((await response.json()) as JudgeCaseResult)
}

async function submitAndWaitJudge0Batch(
  baseUrl: string,
  input: RunJudge0Input & { language: ResolvedLanguage },
  cases: TestCase[],
  progress: { fromIndex: number; completedOffset: number },
): Promise<JudgeCaseResult[]> {
  await reportJudgeProgress(input, {
    currentCaseIndex: cases.length === 1 ? progress.fromIndex : null,
    runningCaseRange: cases.length > 1 ? { from: progress.fromIndex, to: progress.fromIndex + cases.length - 1 } : null,
    completedCases: progress.completedOffset,
  })

  const response = await fetch(`${trimTrailingSlash(baseUrl)}/submissions/batch?base64_encoded=true`, {
    method: 'POST',
    headers: buildJudge0Headers({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      submissions: cases.map((testCase) => buildSubmissionPayload(input, testCase)),
    }),
  })

  if (!response.ok) {
    throw new Error(`Judge0 batch request failed: ${response.status} ${await response.text()}`)
  }

  const tokens = ((await response.json()) as Judge0Token[])
    .map((submission) => submission.token)
    .filter((token): token is string => Boolean(token))

  if (tokens.length !== cases.length) {
    throw new Error(`Judge0 batch returned ${tokens.length}/${cases.length} tokens`)
  }

  return pollJudge0Batch(baseUrl, tokens, input, {
    fromIndex: progress.fromIndex,
    toIndex: progress.fromIndex + cases.length - 1,
    completedOffset: progress.completedOffset,
  })
}

async function submitJudge0CasesSequentially(
  baseUrl: string,
  input: RunJudge0Input & { language: ResolvedLanguage },
  cases: TestCase[],
  progress: { fromIndex: number; completedOffset: number },
): Promise<JudgeCaseResult[]> {
  const results: JudgeCaseResult[] = []
  for (const [index, testCase] of cases.entries()) {
    const caseIndex = progress.fromIndex + index
    await reportJudgeProgress(input, {
      currentCaseIndex: caseIndex,
      runningCaseRange: null,
      completedCases: progress.completedOffset + results.length,
    })
    results.push(await submitJudge0Case(baseUrl, input, testCase))
    await reportJudgeProgress(input, {
      currentCaseIndex: index + 1 < cases.length ? caseIndex + 1 : null,
      runningCaseRange: null,
      completedCases: progress.completedOffset + results.length,
    })
  }
  return results
}

async function submitJudge0CasesConcurrently(
  baseUrl: string,
  input: RunJudge0Input & { language: ResolvedLanguage },
  cases: TestCase[],
  progress: { fromIndex: number; completedOffset: number },
): Promise<JudgeCaseResult[]> {
  const results: JudgeCaseResult[] = new Array(cases.length)
  const concurrency = getCaseConcurrency(cases.length)
  const runningCaseRange = cases.length > 1 ? { from: progress.fromIndex, to: progress.fromIndex + cases.length - 1 } : null
  let nextIndex = 0
  let completedInGroup = 0

  await reportJudgeProgress(input, {
    currentCaseIndex: cases.length === 1 ? progress.fromIndex : null,
    runningCaseRange,
    completedCases: progress.completedOffset,
  })

  async function worker() {
    while (nextIndex < cases.length) {
      const index = nextIndex
      nextIndex += 1
      const testCase = cases[index] as TestCase
      results[index] = await submitJudge0Case(baseUrl, input, testCase)
      completedInGroup += 1
      await reportJudgeProgress(input, {
        currentCaseIndex: cases.length === 1 ? progress.fromIndex : null,
        runningCaseRange,
        completedCases: progress.completedOffset + completedInGroup,
      })
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}

function getCaseConcurrency(caseCount: number): number {
  const requestedConcurrency = Number(process.env.JUDGE0_CASE_CONCURRENCY ?? DEFAULT_CASE_CONCURRENCY)
  return Math.max(
    1,
    Math.min(caseCount, Number.isFinite(requestedConcurrency) ? requestedConcurrency : DEFAULT_CASE_CONCURRENCY),
  )
}

async function pollJudge0Batch(
  baseUrl: string,
  tokens: string[],
  input: RunJudge0Input & { language: ResolvedLanguage },
  progress: { fromIndex: number; toIndex: number; completedOffset: number },
): Promise<JudgeCaseResult[]> {
  const startedAt = Date.now()
  const timeoutMs = Number(process.env.JUDGE0_BATCH_TIMEOUT_MS ?? DEFAULT_BATCH_TIMEOUT_MS)
  const pollMs = Number(process.env.JUDGE0_BATCH_POLL_MS ?? DEFAULT_BATCH_POLL_MS)
  const runningCaseRange = progress.fromIndex === progress.toIndex ? null : { from: progress.fromIndex, to: progress.toIndex }
  let lastCompletedCases = -1

  while (Date.now() - startedAt <= timeoutMs) {
    const response = await fetch(
      `${trimTrailingSlash(baseUrl)}/submissions/batch?tokens=${encodeURIComponent(tokens.join(','))}&base64_encoded=true`,
      {
        headers: buildJudge0Headers(),
      },
    )

    if (!response.ok) {
      throw new Error(`Judge0 batch poll failed: ${response.status} ${await response.text()}`)
    }

    const body = (await response.json()) as Judge0BatchResult
    const submissions = body.submissions ?? []
    const completedCases = submissions.filter((result) => !isQueuedOrProcessing(result)).length

    if (completedCases !== lastCompletedCases) {
      lastCompletedCases = completedCases
      await reportJudgeProgress(input, {
        currentCaseIndex: progress.fromIndex === progress.toIndex ? progress.fromIndex : null,
        runningCaseRange,
        completedCases: progress.completedOffset + completedCases,
      })
    }

    if (submissions.length === tokens.length && submissions.every((result) => !isQueuedOrProcessing(result))) {
      const byToken = new Map(submissions.map((result) => [result.token, decodeJudge0Result(result)]))
      return tokens.map((token) => byToken.get(token) ?? { status: { id: 13, description: 'Internal Error' } })
    }

    await sleep(Number.isFinite(pollMs) ? pollMs : DEFAULT_BATCH_POLL_MS)
  }

  throw new Error(`Judge0 batch timed out after ${Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_BATCH_TIMEOUT_MS} ms`)
}

async function reportJudgeProgress(
  input: RunJudge0Input,
  progress: Omit<Partial<JudgeProgressSnapshot>, 'totalCases'> & { completedCases: number },
) {
  if (!input.onProgress) return

  try {
    await input.onProgress({
      phase: progress.phase ?? 'judging',
      currentCaseIndex: progress.currentCaseIndex ?? null,
      runningCaseRange: progress.runningCaseRange ?? null,
      completedCases: Math.max(0, Math.min(input.cases.length, progress.completedCases)),
      totalCases: input.cases.length,
    })
  } catch (error) {
    console.warn(`Judge progress update failed: ${error instanceof Error ? error.message : error}`)
  }
}

function countCompletedCases(verdict: Verdict, totalCases: number): number {
  if (verdict.caseResults) return verdict.caseResults.length
  if (verdict.result === 'AC') return totalCases
  return Math.max(0, Math.min(totalCases, (verdict.failedCaseIndex ?? -1) + 1))
}

function buildSubmissionPayload(input: RunJudge0Input, testCase: TestCase) {
  if (testCase.inputRef || testCase.expectedOutputRef) {
    throw new Error(`file-backed test case ${testCase.id} must be resolved before Judge0 submission`)
  }

  const expectedOutputBytes = Buffer.byteLength(testCase.expectedOutput, 'utf8')

  return {
    ...buildBasePayload(
      {
        code: input.code,
        language: input.language ?? DEFAULT_CPP_LANGUAGE,
        stdin: testCase.input,
        timeLimitMs: input.timeLimitMs,
        memoryLimitMb: input.memoryLimitMb,
        maxFileSizeKb: getJudge0MaxFileSizeKb(expectedOutputBytes),
      },
    ),
    expected_output: encodeBase64(testCase.expectedOutput),
  }
}

function buildExecutionPayload(input: ExecuteJudge0Input & { language: ResolvedLanguage }) {
  return buildBasePayload(input)
}

function buildBasePayload(input: ExecuteJudge0Input & { language: ResolvedLanguage }) {
  const disableCgroups = process.env.JUDGE0_DISABLE_CGROUPS === 'true'
  const minMemoryLimitKb = Number(process.env.JUDGE0_MIN_MEMORY_LIMIT_KB ?? DEFAULT_MIN_MEMORY_LIMIT_KB)
  const memoryLimitKb = Math.max(input.memoryLimitMb * 1024, Number.isFinite(minMemoryLimitKb) ? minMemoryLimitKb : 0)
  const compilerOptions = getCompilerOptions(input.language)

  return {
    source_code: encodeBase64(input.code),
    language_id: getJudge0LanguageId(input.language),
    ...(compilerOptions ? { compiler_options: compilerOptions } : {}),
    stdin: encodeBase64(input.stdin),
    cpu_time_limit: Math.max(input.timeLimitMs / 1000, 1),
    memory_limit: memoryLimitKb,
    ...(input.maxFileSizeKb ? { max_file_size: input.maxFileSizeKb } : {}),
    ...(disableCgroups
      ? {
          enable_per_process_and_thread_time_limit: true,
          enable_per_process_and_thread_memory_limit: true,
        }
      : {}),
  }
}

function getJudge0MaxFileSizeKb(expectedOutputBytes: number): number | undefined {
  const configured = Number(process.env.JUDGE0_MAX_FILE_SIZE_KB)
  const minimumKb = Number.isFinite(configured) && configured > 0 ? configured : 1024
  if (expectedOutputBytes <= minimumKb * 1024) return configured > 0 ? minimumKb : undefined

  return Math.ceil(expectedOutputBytes / 1024) + 1024
}

function mockExecuteForLanguage(input: ExecuteJudge0Input & { language: ResolvedLanguage }): MockExecutionResult {
  if (input.language === 'python3') {
    return {
      result: 'CE',
      stdout: '',
      maxRuntimeMs: 0,
      errorDetail: `${getLanguageLabel(input.language)} requires Judge0; mock mode only supports beginner C/C++ patterns.`,
    }
  }

  return mockExecuteCpp(input.code, input.stdin, input.timeLimitMs)
}

function mockJudgeSubmissionForLanguage(
  input: RunJudge0Input & { language: ResolvedLanguage },
): Verdict {
  if (input.language !== 'python3') return mockJudgeSubmission(input)

  return {
    result: 'CE',
    passedCases: 0,
    totalCases: input.cases.length,
    maxRuntimeMs: 0,
    failedCaseIndex: input.cases.length > 0 ? 0 : null,
    childFriendlyMessage: input.childMessage('CE'),
    errorDetail: `${getLanguageLabel(input.language)} requires Judge0; mock mode only supports beginner C/C++ patterns.`,
  }
}

function toExecutionResult(result: JudgeCaseResult, timeLimitMs: number): MockExecutionResult {
  const runtimeMs = Math.round(Number.parseFloat(result.time ?? '0') * 1000)
  const maxRuntimeMs = Number.isFinite(runtimeMs) ? runtimeMs : 0
  const statusId = result.status?.id
  const statusText = readJudgeStatusText(result)

  if (statusId === 3 && maxRuntimeMs <= timeLimitMs) {
    return {
      result: 'AC',
      stdout: result.stdout ?? '',
      maxRuntimeMs,
    }
  }

  if (isMemoryLimitStatus(statusText)) {
    return {
      result: 'MLE',
      stdout: result.stdout ?? '',
      maxRuntimeMs,
      errorDetail: result.stderr ?? result.message ?? result.status?.description,
    }
  }

  if (isPresentationErrorStatus(statusText)) {
    return {
      result: 'PE',
      stdout: result.stdout ?? '',
      maxRuntimeMs,
      errorDetail: result.stderr ?? result.message ?? result.status?.description,
    }
  }

  if (statusId === 6) {
    return {
      result: 'CE',
      stdout: result.stdout ?? '',
      maxRuntimeMs,
      errorDetail: result.compile_output ?? result.status?.description,
    }
  }

  if (statusId === 5 || maxRuntimeMs > timeLimitMs) {
    return {
      result: 'TLE',
      stdout: result.stdout ?? '',
      maxRuntimeMs,
    }
  }

  if (statusId === 13) {
    return {
      result: 'Judge Error',
      stdout: result.stdout ?? '',
      maxRuntimeMs,
      errorDetail: result.stderr ?? result.message ?? result.status?.description,
    }
  }

  return {
    result: 'RE',
    stdout: result.stdout ?? '',
    maxRuntimeMs,
    errorDetail: result.stderr ?? result.message ?? result.status?.description,
  }
}

function decodeJudge0Result(result: JudgeCaseResult): JudgeCaseResult {
  return {
    ...result,
    stdout: decodeBase64Field(result.stdout),
    stderr: decodeBase64Field(result.stderr),
    compile_output: decodeBase64Field(result.compile_output),
    message: decodeBase64Field(result.message),
  }
}

function isAcceptedCase(result: JudgeCaseResult, expected: TestCase, timeLimitMs: number): boolean {
  const runtimeMs = Math.round(Number.parseFloat(result.time ?? '0') * 1000)
  return (
    result.status?.id === 3 &&
    (!Number.isFinite(runtimeMs) || runtimeMs <= timeLimitMs) &&
    normalizeOutput(result.stdout ?? '') === normalizeOutput(expected.expectedOutput)
  )
}

function isQueuedOrProcessing(result: JudgeCaseResult): boolean {
  const statusId = result.status?.id
  return typeof statusId === 'number' && QUEUED_STATUS_IDS.has(statusId)
}

function encodeBase64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

function decodeBase64Field(value: string | null | undefined): string | null | undefined {
  if (value == null) return value

  try {
    return Buffer.from(value, 'base64').toString('utf8')
  } catch {
    return value
  }
}

function readJudgeStatusText(result: JudgeCaseResult): string {
  return [result.status?.description, result.stderr, result.compile_output, result.message].filter(Boolean).join(' ')
}

function isMemoryLimitStatus(value: string): boolean {
  return /\b(?:memory limit|memory exceeded|out of memory|sigxfsz)\b/i.test(value)
}

function isPresentationErrorStatus(value: string): boolean {
  return /\b(?:presentation error|wrong presentation|format error)\b/i.test(value)
}

function buildJudge0Headers(extra: Record<string, string> = {}): Record<string, string> {
  const token = process.env.JUDGE0_AUTH_TOKEN
  return {
    ...extra,
    ...(token ? { 'X-Auth-Token': token } : {}),
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}
