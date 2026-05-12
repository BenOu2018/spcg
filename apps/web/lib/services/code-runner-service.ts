import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockExecuteCpp, type JudgeCaseResult, type MockExecutionResult } from '@spcg/shared/judge'
import {
  DEFAULT_CPP_LANGUAGE,
  getCompilerOptions,
  getCppStandard,
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
const LOCAL_RUN_MAX_BUFFER = 16 * 1024 * 1024

export async function executeCode(input: ExecuteCodeInput): Promise<MockExecutionResult> {
  const baseUrl = process.env.JUDGE0_BASE_URL
  const mode = process.env.JUDGE0_MODE
  const language = input.language ?? DEFAULT_CPP_LANGUAGE

  if (mode === 'mock' || !baseUrl) {
    return executeMockCode({ ...input, language })
  }

  try {
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
  } catch (error) {
    if (process.env.SPCG_LOCAL_RUN_FALLBACK === 'false') throw error
    return executeLocalCode({ ...input, language })
  }
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

async function executeLocalCode(input: ExecuteCodeInput & { language: ResolvedLanguage }): Promise<MockExecutionResult> {
  if (input.language === 'python3') return executeLocalPython(input)
  return executeLocalNative(input)
}

async function executeLocalNative(input: ExecuteCodeInput & { language: ResolvedLanguage }): Promise<MockExecutionResult> {
  const compiler =
    input.language === 'c' ? findExecutable(['gcc', 'clang', 'cc']) : findExecutable(['g++', 'clang++', 'c++'])
  if (!compiler) {
    return {
      result: 'Judge Error',
      stdout: '',
      maxRuntimeMs: 0,
      errorDetail: `${getLanguageLabel(input.language)} compiler not found for local Run fallback.`,
    }
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'spcg-run-'))
  const sourcePath = join(tempDir, input.language === 'c' ? 'main.c' : 'main.cpp')
  const binaryPath = join(tempDir, 'main')

  try {
    await writeFile(sourcePath, input.code)
    if (input.language !== 'c') {
      await mkdir(join(tempDir, 'bits'), { recursive: true })
      await writeFile(join(tempDir, 'bits', 'stdc++.h'), buildBitsStdCppShim())
    }

    const compileArgs =
      input.language === 'c'
        ? ['-O2', sourcePath, '-o', binaryPath]
        : [`-std=${getCppStandard(input.language)}`, '-O2', '-I', tempDir, sourcePath, '-o', binaryPath]
    const compile = spawnSync(compiler, compileArgs, {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: LOCAL_RUN_MAX_BUFFER,
    })

    if (compile.error || compile.status !== 0) {
      return {
        result: 'CE',
        stdout: '',
        maxRuntimeMs: 0,
        errorDetail: compile.stderr || compile.stdout || compile.error?.message || 'Compile failed.',
      }
    }

    return runLocalExecutable(binaryPath, [], input.stdin, input.timeLimitMs)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function executeLocalPython(input: ExecuteCodeInput & { language: ResolvedLanguage }): Promise<MockExecutionResult> {
  const python = findExecutable(['python3', 'python'])
  if (!python) {
    return {
      result: 'Judge Error',
      stdout: '',
      maxRuntimeMs: 0,
      errorDetail: 'Python3 executable not found for local Run fallback.',
    }
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'spcg-run-'))
  const sourcePath = join(tempDir, 'main.py')
  try {
    await writeFile(sourcePath, input.code)
    return runLocalExecutable(python, [sourcePath], input.stdin, input.timeLimitMs)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function runLocalExecutable(command: string, args: string[], stdin: string, timeLimitMs: number): MockExecutionResult {
  const startedAt = Date.now()
  const run = spawnSync(command, args, {
    input: stdin,
    encoding: 'utf8',
    timeout: Math.max(timeLimitMs + 1000, 5000),
    maxBuffer: LOCAL_RUN_MAX_BUFFER,
  })
  const maxRuntimeMs = Math.max(0, Date.now() - startedAt)

  if (run.error?.message.includes('ETIMEDOUT') || run.signal === 'SIGTERM') {
    return { result: 'TLE', stdout: run.stdout ?? '', maxRuntimeMs }
  }

  if (run.error) {
    return { result: 'Judge Error', stdout: run.stdout ?? '', maxRuntimeMs, errorDetail: run.error.message }
  }

  if (run.status !== 0) {
    return {
      result: 'RE',
      stdout: run.stdout ?? '',
      maxRuntimeMs,
      errorDetail: run.stderr || run.signal || `Process exited with status ${run.status}`,
    }
  }

  return { result: 'AC', stdout: run.stdout ?? '', maxRuntimeMs }
}

function findExecutable(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' })
    if (!result.error) return candidate
  }
  return null
}

function buildBitsStdCppShim(): string {
  return [
    '#include <algorithm>',
    '#include <array>',
    '#include <bitset>',
    '#include <cassert>',
    '#include <cctype>',
    '#include <cerrno>',
    '#include <climits>',
    '#include <cmath>',
    '#include <cstdio>',
    '#include <cstdlib>',
    '#include <cstring>',
    '#include <deque>',
    '#include <functional>',
    '#include <iomanip>',
    '#include <iostream>',
    '#include <limits>',
    '#include <map>',
    '#include <numeric>',
    '#include <queue>',
    '#include <set>',
    '#include <sstream>',
    '#include <stack>',
    '#include <string>',
    '#include <tuple>',
    '#include <utility>',
    '#include <vector>',
    '',
  ].join('\n')
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
