export type TestCase = {
  id: string
  input: string
  expectedOutput: string
  visibility: 'public' | 'hidden'
}

export type Verdict = {
  result: 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'PE'
  passedCases: number
  totalCases: number
  maxRuntimeMs: number
  failedCaseIndex: number | null
  childFriendlyMessage: string
  errorDetail?: string
}

type Judge0CaseResult = {
  status?: {
    id?: number
    description?: string
  }
  time?: string | null
  stdout?: string | null
  stderr?: string | null
  compile_output?: string | null
}

type RunJudge0Input = {
  code: string
  cases: TestCase[]
  timeLimitMs: number
  memoryLimitMb: number
  childMessage: (result: Verdict['result']) => string
}

const JUDGE0_BASE_URL = 'https://judge0-ce.p.rapidapi.com'
const CPP_GCC_LANGUAGE_ID = 54

export async function runJudge0(input: RunJudge0Input): Promise<Verdict> {
  const key = Deno.env.get('JUDGE0_KEY')
  const host = Deno.env.get('JUDGE0_HOST') ?? 'judge0-ce.p.rapidapi.com'
  const mode = Deno.env.get('JUDGE0_MODE') ?? 'mock'

  if (mode === 'mock') {
    return mockVerdict(input)
  }

  if (!key) {
    throw new Error('JUDGE0_KEY is required when JUDGE0_MODE is not mock')
  }

  const caseResults: Judge0CaseResult[] = []

  for (const testCase of input.cases) {
    caseResults.push(
      await fetchJudge0Submission({
        key,
        host,
        code: input.code,
        testCase,
        timeLimitMs: input.timeLimitMs,
        memoryLimitMb: input.memoryLimitMb,
      }),
    )
  }

  return aggregateVerdict(caseResults, input.cases, input.timeLimitMs, input.childMessage)
}

function mockVerdict(input: RunJudge0Input): Verdict {
  const result = detectMockResult(input.code, input.cases)
  const passedCases = result === 'AC' ? input.cases.length : 0

  return {
    result,
    passedCases,
    totalCases: input.cases.length,
    maxRuntimeMs: result === 'TLE' ? input.timeLimitMs + 1000 : 12,
    failedCaseIndex: result === 'AC' ? null : 0,
    childFriendlyMessage: input.childMessage(result),
    ...(result === 'CE' ? { errorDetail: 'mock compile error near output statement' } : {}),
    ...(result === 'RE' ? { errorDetail: 'mock runtime error' } : {}),
  }
}

function aggregateVerdict(
  results: Judge0CaseResult[],
  expected: TestCase[],
  timeLimitMs: number,
  childMessage: (result: Verdict['result']) => string,
): Verdict {
  let passedCases = 0
  let failedCaseIndex: number | null = null
  let maxRuntimeMs = 0
  let result: Verdict['result'] = 'AC'
  let errorDetail: string | undefined

  for (let i = 0; i < expected.length; i++) {
    const current = results[i]

    if (!current) {
      result = 'RE'
      errorDetail = 'Judge result missing for test case'
      failedCaseIndex = i
      break
    }

    const runtimeMs = Math.round(Number.parseFloat(current.time ?? '0') * 1000)
    maxRuntimeMs = Math.max(maxRuntimeMs, Number.isFinite(runtimeMs) ? runtimeMs : 0)

    const statusId = current.status?.id
    const statusText = readJudgeStatusText(current)

    if (isMemoryLimitStatus(statusText)) {
      result = 'MLE'
      errorDetail = current.stderr ?? current.status?.description
      failedCaseIndex = i
      break
    }

    if (isPresentationErrorStatus(statusText)) {
      result = 'PE'
      errorDetail = current.stderr ?? current.status?.description
      failedCaseIndex = i
      break
    }

    if (statusId === 6) {
      result = 'CE'
      errorDetail = current.compile_output ?? current.status?.description
      failedCaseIndex = i
      break
    }

    if (statusId === 5 || runtimeMs > timeLimitMs) {
      result = 'TLE'
      failedCaseIndex = i
      break
    }

    if (statusId !== 3) {
      result = 'RE'
      errorDetail = current.stderr ?? current.status?.description
      failedCaseIndex = i
      break
    }

    if (normalizeOutput(current.stdout ?? '') !== normalizeOutput(expected[i]?.expectedOutput ?? '')) {
      result = 'WA'
      failedCaseIndex = i
      break
    }

    passedCases++
  }

  return {
    result,
    passedCases,
    totalCases: expected.length,
    maxRuntimeMs,
    failedCaseIndex,
    childFriendlyMessage: childMessage(result),
    ...(errorDetail ? { errorDetail } : {}),
  }
}

function normalizeOutput(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
}

function readJudgeStatusText(result: Judge0CaseResult): string {
  return [result.status?.description, result.stderr, result.compile_output].filter(Boolean).join(' ')
}

function isMemoryLimitStatus(value: string): boolean {
  return /\b(?:memory limit|memory exceeded|out of memory|sigxfsz)\b/i.test(value)
}

function isPresentationErrorStatus(value: string): boolean {
  return /\b(?:presentation error|wrong presentation|format error)\b/i.test(value)
}

async function fetchJudge0Submission(input: {
  key: string
  host: string
  code: string
  testCase: TestCase
  timeLimitMs: number
  memoryLimitMb: number
}): Promise<Judge0CaseResult> {
  const maxAttempts = 3

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(`${JUDGE0_BASE_URL}/submissions?base64_encoded=false&wait=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': input.key,
        'X-RapidAPI-Host': input.host,
      },
      body: JSON.stringify({
        source_code: input.code,
        language_id: CPP_GCC_LANGUAGE_ID,
        stdin: input.testCase.input,
        expected_output: input.testCase.expectedOutput,
        cpu_time_limit: Math.max(input.timeLimitMs / 1000, 1),
        memory_limit: input.memoryLimitMb * 1024,
      }),
    })

    if (response.ok) {
      return (await response.json()) as Judge0CaseResult
    }

    if (response.status === 429 && attempt < maxAttempts) {
      await sleep(attempt * 2000)
      continue
    }

    throw new Error(`Judge0 request failed: ${response.status} ${await response.text()}`)
  }

  throw new Error('Judge0 request failed after retries')
}

function detectMockResult(code: string, cases: TestCase[]): Verdict['result'] {
  const compact = code.replace(/\s+/g, ' ')

  if (compact.includes('SYNTAX_ERROR') || compact.includes('cout << ;')) return 'CE'
  if (compact.includes('while(true)') || compact.includes('for(;;)')) return 'TLE'
  if (compact.includes('/ 0') || compact.includes('throw ')) return 'RE'

  const uniqueExpectedOutputs = [...new Set(cases.map((testCase) => normalizeOutput(testCase.expectedOutput)))]
  const hasOutputStatement = code.includes('cout') || code.includes('printf')
  const matchesStaticOutput = uniqueExpectedOutputs.every((expected) => expected.length > 0 && code.includes(expected))

  return hasOutputStatement && matchesStaticOutput ? 'AC' : 'WA'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
