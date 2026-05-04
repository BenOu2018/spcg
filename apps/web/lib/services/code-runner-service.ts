import { mockExecuteCpp, type JudgeCaseResult, type MockExecutionResult } from '@spcg/shared/judge'
import {
  DEFAULT_CPP_LANGUAGE,
  getCompilerOptions,
  getJudge0LanguageId,
  getLanguageLabel,
  type ResolvedLanguage,
} from '@spcg/shared/language-config'

type ExecuteCodeInput = {
  code: string
  language?: ResolvedLanguage
  stdin: string
  timeLimitMs: number
  memoryLimitMb: number
}

const DEFAULT_MIN_MEMORY_LIMIT_KB = 0

export async function executeCode(input: ExecuteCodeInput): Promise<MockExecutionResult> {
  const baseUrl = process.env.JUDGE0_BASE_URL
  const mode = process.env.JUDGE0_MODE
  const language = input.language ?? DEFAULT_CPP_LANGUAGE

  if (mode === 'mock' || !baseUrl) {
    return executeMockCode({ ...input, language })
  }

  const response = await fetch(`${trimTrailingSlash(baseUrl)}/submissions?base64_encoded=true&wait=true`, {
    method: 'POST',
    headers: buildJudge0Headers({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(buildPayload({ ...input, language })),
  })

  if (!response.ok) {
    throw new Error(`Judge0 run request failed: ${response.status} ${await response.text()}`)
  }

  return toExecutionResult(decodeJudge0Result((await response.json()) as JudgeCaseResult), input.timeLimitMs)
}

function buildPayload(input: ExecuteCodeInput & { language: ResolvedLanguage }) {
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
    ...(disableCgroups
      ? {
          enable_per_process_and_thread_time_limit: true,
          enable_per_process_and_thread_memory_limit: true,
        }
      : {}),
  }
}

function executeMockCode(input: ExecuteCodeInput & { language: ResolvedLanguage }): MockExecutionResult {
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

function toExecutionResult(result: JudgeCaseResult, timeLimitMs: number): MockExecutionResult {
  const runtimeMs = Math.round(Number.parseFloat(result.time ?? '0') * 1000)
  const maxRuntimeMs = Number.isFinite(runtimeMs) ? runtimeMs : 0
  const statusId = result.status?.id

  if (statusId === 3 && maxRuntimeMs <= timeLimitMs) {
    return {
      result: 'AC',
      stdout: result.stdout ?? '',
      maxRuntimeMs,
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
