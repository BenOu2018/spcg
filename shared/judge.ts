import type { TestCase, Verdict } from './types.js'

export type JudgeCaseResult = {
  status?: {
    id?: number
    description?: string
  }
  time?: string | null
  stdout?: string | null
  stderr?: string | null
  compile_output?: string | null
  message?: string | null
}

export type JudgeMessagePicker = (result: Verdict['result']) => string

export type MockJudgeInput = {
  code: string
  cases: TestCase[]
  timeLimitMs: number
  childMessage: JudgeMessagePicker
  runAllCases?: boolean
}

export type MockExecutionResult = {
  result: Verdict['result']
  stdout: string
  maxRuntimeMs: number
  errorDetail?: string
}

export function aggregateJudgeResults(
  results: JudgeCaseResult[],
  expected: TestCase[],
  timeLimitMs: number,
  childMessage: JudgeMessagePicker,
  options: { runAllCases?: boolean } = {},
): Verdict {
  let passedCases = 0
  let failedCaseIndex: number | null = null
  let maxRuntimeMs = 0
  let result: Verdict['result'] = 'AC'
  let errorDetail: string | undefined
  const caseResults: NonNullable<Verdict['caseResults']> = []

  for (let i = 0; i < expected.length; i++) {
    const current = results[i]
    let caseResult: Verdict['result'] = 'AC'
    let casePassed = false
    let caseRuntimeMs = 0

    if (!current) {
      caseResult = 'RE'
      errorDetail = 'Judge result missing for test case'
    } else {
      const runtimeMs = Math.round(Number.parseFloat(current.time ?? '0') * 1000)
      caseRuntimeMs = Number.isFinite(runtimeMs) ? runtimeMs : 0
      maxRuntimeMs = Math.max(maxRuntimeMs, caseRuntimeMs)

      const statusId = current.status?.id
      const statusText = readJudgeStatusText(current)

      if (isMemoryLimitStatus(statusText)) {
        caseResult = 'MLE'
        errorDetail ??= current.stderr ?? current.message ?? current.status?.description
      } else if (isPresentationErrorStatus(statusText)) {
        caseResult = 'PE'
        errorDetail ??= current.stderr ?? current.message ?? current.status?.description
      } else if (statusId === 6) {
        caseResult = 'CE'
        errorDetail ??= current.compile_output ?? current.status?.description
      } else if (statusId === 5 || runtimeMs > timeLimitMs) {
        caseResult = 'TLE'
      } else if (statusId === 4) {
        caseResult = 'WA'
      } else if (statusId === 13) {
        caseResult = 'Judge Error'
        errorDetail ??= current.stderr ?? current.message ?? current.status?.description
      } else if (statusId !== 3) {
        caseResult = 'RE'
        errorDetail ??= current.stderr ?? current.message ?? current.status?.description
      } else if (normalizeOutput(current.stdout ?? '') !== normalizeOutput(expected[i]?.expectedOutput ?? '')) {
        caseResult = 'WA'
      } else {
        casePassed = true
      }
    }

    if (casePassed) passedCases++
    if (!casePassed && result === 'AC') {
      result = caseResult
      failedCaseIndex = i
    }
    caseResults.push({
      index: i + 1,
      visibility: expected[i]?.visibility ?? 'hidden',
      passed: casePassed,
      result: caseResult,
      runtimeMs: caseRuntimeMs,
    })
    if (!casePassed && !options.runAllCases) break
  }

  return {
    result,
    passedCases,
    totalCases: expected.length,
    maxRuntimeMs,
    failedCaseIndex,
    childFriendlyMessage: childMessage(result),
    caseResults,
    ...(errorDetail ? { errorDetail } : {}),
  }
}

export function mockJudgeSubmission(input: MockJudgeInput): Verdict {
  let passedCases = 0
  let failedCaseIndex: number | null = null
  let result: Verdict['result'] = 'AC'
  let errorDetail: string | undefined
  let maxRuntimeMs = 0

  for (let i = 0; i < input.cases.length; i++) {
    const testCase = input.cases[i]
    const execution = mockExecuteCpp(input.code, testCase?.input ?? '', input.timeLimitMs)

    maxRuntimeMs = Math.max(maxRuntimeMs, execution.maxRuntimeMs)

    if (execution.result !== 'AC') {
      if (result === 'AC') {
        result = execution.result
        failedCaseIndex = i
      }
      errorDetail = execution.errorDetail
    } else if (normalizeOutput(execution.stdout) !== normalizeOutput(testCase?.expectedOutput ?? '')) {
      if (result === 'AC') {
        result = 'WA'
        failedCaseIndex = i
      }
    } else {
      passedCases++
    }

    if (result !== 'AC' && !input.runAllCases) break
  }

  return {
    result,
    passedCases,
    totalCases: input.cases.length,
    maxRuntimeMs,
    failedCaseIndex,
    childFriendlyMessage: input.childMessage(result),
    ...(errorDetail ? { errorDetail } : {}),
  }
}

export function mockExecuteCpp(code: string, stdin: string, timeLimitMs = 1000): MockExecutionResult {
  const compact = code.replace(/\s+/g, ' ')

  if (compact.includes('SYNTAX_ERROR') || compact.includes('cout << ;')) {
    return {
      result: 'CE',
      stdout: '',
      maxRuntimeMs: 0,
      errorDetail: 'mock compile error near output statement',
    }
  }

  if (compact.includes('while(true)') || compact.includes('for(;;)')) {
    return {
      result: 'TLE',
      stdout: '',
      maxRuntimeMs: timeLimitMs + 1000,
    }
  }

  if (compact.includes('/ 0') || compact.includes('throw ')) {
    return {
      result: 'RE',
      stdout: '',
      maxRuntimeMs: 12,
      errorDetail: 'mock runtime error',
    }
  }

  return {
    result: 'AC',
    stdout: inferMockStdout(code, stdin),
    maxRuntimeMs: 12,
  }
}

export function normalizeOutput(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
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

function inferMockStdout(code: string, stdin: string): string {
  const inputTokens = stdin.trim().length > 0 ? stdin.trim().split(/\s+/) : []
  const readVariables = extractInputVariables(code)
  const values = new Map<string, string>()

  readVariables.forEach((name, index) => {
    values.set(name, inputTokens[index] ?? '')
  })
  inferAssignedNumericValues(code, values)
  const executableCode = selectSimpleBranches(code, values)

  const specialCaseOutput = inferCommonBeginnerPattern(executableCode, readVariables, values)
  if (specialCaseOutput !== null) return specialCaseOutput

  const outputBlocks = [
    ...[...executableCode.matchAll(/(?:std::)?cout\s*<<([\s\S]*?);/g)].map((match) => ({
      index: match.index ?? 0,
      text: renderCoutChain(match[1] ?? '', values),
    })),
    ...[...executableCode.matchAll(/(?:std::)?printf\s*\(\s*("(?:(?:\\.|[^"\\])*)")\s*(?:,([\s\S]*?))?\)\s*;/g)].map((match) => ({
      index: match.index ?? 0,
      text: renderPrintfCall(match[1] ?? '""', match[2] ?? '', values),
    })),
  ].sort((left, right) => left.index - right.index)

  return outputBlocks.map((block) => block.text).join('')
}

function extractInputVariables(code: string): string[] {
  const reads: Array<{ index: number; variables: string[] }> = []

  for (const match of code.matchAll(/(?:std::)?cin\s*>>([\s\S]*?);/g)) {
    const chain = match[1] ?? ''
    const variables: string[] = []

    for (const part of chain.split('>>')) {
      const name = part.replace(/[^A-Za-z0-9_]/g, '').trim()
      if (name) variables.push(name)
    }

    reads.push({ index: match.index ?? 0, variables })
  }

  for (const match of code.matchAll(/(?:std::)?scanf\s*\(\s*"(?:(?:\\.|[^"\\])*)"\s*,([\s\S]*?)\)\s*;/g)) {
    reads.push({ index: match.index ?? 0, variables: extractScanfVariables(match[1] ?? '') })
  }

  return reads.sort((left, right) => left.index - right.index).flatMap((read) => read.variables)
}

function extractScanfVariables(args: string): string[] {
  return splitCppArguments(args)
    .map((part) => part.replace(/^\s*&\s*/, '').replace(/[^A-Za-z0-9_]/g, '').trim())
    .filter(Boolean)
}

function inferCommonBeginnerPattern(code: string, readVariables: string[], values: Map<string, string>): string | null {
  if (readVariables.length < 2) return null

  const leftName = readVariables[0]
  const rightName = readVariables[1]
  if (!leftName || !rightName) return null
  const left = Number(values.get(leftName))
  const right = Number(values.get(rightName))

  if (!Number.isFinite(left) || !Number.isFinite(right)) return null

  const compact = code.replace(/\s+/g, ' ')
  if (/if\s*\([^)]*>[^)]*\)/.test(compact) && compact.includes('else')) return `${Math.max(left, right)}\n`
  if (/if\s*\([^)]*<[^)]*\)/.test(compact) && compact.includes('else')) return `${Math.min(left, right)}\n`

  return null
}

function selectSimpleBranches(code: string, values: Map<string, string>): string {
  let output = ''
  let index = 0

  while (index < code.length) {
    const nextIf = findNextKeyword(code, 'if', index)
    if (nextIf < 0) {
      output += code.slice(index)
      break
    }

    output += code.slice(index, nextIf)
    const parsed = parseIfElse(code, nextIf, values)
    if (!parsed) {
      output += code.slice(nextIf, nextIf + 2)
      index = nextIf + 2
      continue
    }

    output += selectSimpleBranches(parsed.selectedBody, values)
    index = parsed.end
  }

  return output
}

function parseIfElse(
  code: string,
  ifIndex: number,
  values: Map<string, string>,
): { selectedBody: string; end: number } | null {
  let cursor = ifIndex + 2
  cursor = skipWhitespace(code, cursor)
  if (code[cursor] !== '(') return null

  const conditionEnd = findMatchingDelimiter(code, cursor, '(', ')')
  if (conditionEnd < 0) return null

  const condition = code.slice(cursor + 1, conditionEnd)
  const conditionValue = evaluateBooleanCondition(condition, values)
  if (conditionValue === null) return null

  const thenStatement = readControlledStatement(code, conditionEnd + 1, values)
  if (!thenStatement) return null

  cursor = skipWhitespace(code, thenStatement.end)
  let elseStatement: { body: string; end: number } | null = null
  if (startsWithKeyword(code, 'else', cursor)) {
    elseStatement = readControlledStatement(code, cursor + 4, values)
  }

  return {
    selectedBody: conditionValue ? thenStatement.body : elseStatement?.body ?? '',
    end: elseStatement?.end ?? thenStatement.end,
  }
}

function readControlledStatement(
  code: string,
  start: number,
  values: Map<string, string>,
): { body: string; end: number } | null {
  let cursor = skipWhitespace(code, start)

  if (code[cursor] === '{') {
    const blockEnd = findMatchingDelimiter(code, cursor, '{', '}')
    if (blockEnd < 0) return null
    return {
      body: code.slice(cursor + 1, blockEnd),
      end: blockEnd + 1,
    }
  }

  if (startsWithKeyword(code, 'if', cursor)) {
    const parsed = parseIfElse(code, cursor, values)
    if (!parsed) return null
    return {
      body: code.slice(cursor, parsed.end),
      end: parsed.end,
    }
  }

  const statementEnd = findStatementEnd(code, cursor)
  if (statementEnd < 0) return null
  return {
    body: code.slice(cursor, statementEnd + 1),
    end: statementEnd + 1,
  }
}

function evaluateBooleanCondition(condition: string, values: Map<string, string>): boolean | null {
  const normalized = stripOuterParens(condition.trim())
  const orParts = splitTopLevelOperator(normalized, '||')
  if (orParts.length > 1) {
    let sawUnknown = false
    for (const part of orParts) {
      const value = evaluateBooleanCondition(part, values)
      if (value === true) return true
      if (value === null) sawUnknown = true
    }
    return sawUnknown ? null : false
  }

  const andParts = splitTopLevelOperator(normalized, '&&')
  if (andParts.length > 1) {
    let sawUnknown = false
    for (const part of andParts) {
      const value = evaluateBooleanCondition(part, values)
      if (value === false) return false
      if (value === null) sawUnknown = true
    }
    return sawUnknown ? null : true
  }

  const comparison = splitComparison(normalized)
  if (!comparison) {
    const numericValue = evaluateNumericExpression(normalized, values)
    return numericValue === null ? null : numericValue !== 0
  }

  const left = evaluateNumericExpression(comparison.left, values)
  const right = evaluateNumericExpression(comparison.right, values)
  if (left === null || right === null) return null

  if (comparison.operator === '>=') return left >= right
  if (comparison.operator === '<=') return left <= right
  if (comparison.operator === '==') return left === right
  if (comparison.operator === '!=') return left !== right
  if (comparison.operator === '>') return left > right
  return left < right
}

function splitComparison(condition: string): { left: string; operator: string; right: string } | null {
  for (const operator of ['>=', '<=', '==', '!=', '>', '<']) {
    const index = findTopLevelOperator(condition, operator)
    if (index >= 0) {
      return {
        left: condition.slice(0, index),
        operator,
        right: condition.slice(index + operator.length),
      }
    }
  }
  return null
}

function renderCoutChain(chain: string, values: Map<string, string>): string {
  return chain
    .split('<<')
    .map((part) => renderCoutPart(part.trim(), values))
    .join('')
}

function renderCoutPart(part: string, values: Map<string, string>): string {
  if (!part || part === 'std::endl' || part === 'endl') return '\n'

  return renderExpressionValue(part, values)
}

function renderPrintfCall(formatLiteral: string, rawArgs: string, values: Map<string, string>): string {
  const formatMatch = formatLiteral.match(/^"([\s\S]*)"$/)
  const format = unescapeCppString(formatMatch?.[1] ?? '')
  const args = splitCppArguments(rawArgs)
  let argIndex = 0
  const percentPlaceholder = '\u0000PERCENT\u0000'

  return format
    .replace(/%%/g, percentPlaceholder)
    .replace(/%[-+ #0]*\d*(?:\.\d+)?(?:ll|l|h|hh)?[diuoxXfFeEgGaAcCs]/g, () => {
      const arg = args[argIndex] ?? ''
      argIndex += 1
      return renderExpressionValue(arg, values)
    })
    .replaceAll(percentPlaceholder, '%')
}

function inferAssignedNumericValues(code: string, values: Map<string, string>) {
  const declarationPattern =
    /\b(?:const\s+)?(?:int|long\s+long|long|short|double|float|auto)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+)/g
  const assignmentPattern = /(?:^|[;\n{}])\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^=;]+);/g

  for (let pass = 0; pass < 3; pass++) {
    for (const match of code.matchAll(declarationPattern)) {
      const name = match[1]
      const expression = match[2]
      if (!name || !expression) continue

      const value = evaluateNumericExpression(expression, values)
      if (value !== null) values.set(name, String(value))
    }

    for (const match of code.matchAll(assignmentPattern)) {
      const name = match[1]
      const expression = match[2]
      if (!name || !expression) continue

      const value = evaluateNumericExpression(expression, values)
      if (value !== null) values.set(name, String(value))
    }
  }
}

function renderExpressionValue(part: string, values: Map<string, string>): string {
  const trimmed = part.trim()

  const doubleQuoted = trimmed.match(/^"([\s\S]*)"$/)
  if (doubleQuoted) return unescapeCppString(doubleQuoted[1] ?? '')

  const singleQuoted = trimmed.match(/^'([\s\S]*)'$/)
  if (singleQuoted) return unescapeCppString(singleQuoted[1] ?? '')

  if (values.has(trimmed)) return values.get(trimmed) ?? ''

  const numericValue = evaluateNumericExpression(trimmed, values)
  if (numericValue !== null) return String(numericValue)

  return ''
}

function splitCppArguments(value: string): string[] {
  const args: string[] = []
  let current = ''
  let depth = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (const char of value) {
    if (quote) {
      current += char

      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }

      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }

    if (char === '(' || char === '[' || char === '{') depth += 1
    if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1)

    if (char === ',' && depth === 0) {
      if (current.trim()) args.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) args.push(current.trim())
  return args
}

function splitTopLevelOperator(value: string, operator: string): string[] {
  const parts: string[] = []
  let cursor = 0
  let start = 0

  while (cursor < value.length) {
    const index = findTopLevelOperator(value, operator, cursor)
    if (index < 0) break

    parts.push(value.slice(start, index).trim())
    cursor = index + operator.length
    start = cursor
  }

  if (parts.length === 0) return [value]
  parts.push(value.slice(start).trim())
  return parts
}

function findTopLevelOperator(value: string, operator: string, start = 0): number {
  let depth = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = start; index < value.length; index++) {
    const char = value[index]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '(' || char === '[' || char === '{') depth += 1
    if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1)

    if (depth === 0 && value.startsWith(operator, index)) return index
  }

  return -1
}

function findNextKeyword(value: string, keyword: string, start: number): number {
  for (let index = start; index < value.length; index++) {
    if (startsWithKeyword(value, keyword, index)) return index
  }
  return -1
}

function startsWithKeyword(value: string, keyword: string, index: number): boolean {
  if (!value.startsWith(keyword, index)) return false

  const before = index > 0 ? value[index - 1] : ''
  const after = value[index + keyword.length] ?? ''
  return !isIdentifierChar(before) && !isIdentifierChar(after)
}

function isIdentifierChar(value: string | undefined): boolean {
  return Boolean(value && /[A-Za-z0-9_]/.test(value))
}

function skipWhitespace(value: string, start: number): number {
  let cursor = start
  while (cursor < value.length && /\s/.test(value[cursor] ?? '')) cursor += 1
  return cursor
}

function findMatchingDelimiter(value: string, start: number, open: string, close: string): number {
  let depth = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = start; index < value.length; index++) {
    const char = value[index]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === open) depth += 1
    if (char === close) {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

function findStatementEnd(value: string, start: number): number {
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = start; index < value.length; index++) {
    const char = value[index]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === ';') return index
  }

  return -1
}

function stripOuterParens(value: string): string {
  let nextValue = value

  while (nextValue.startsWith('(') && findMatchingDelimiter(nextValue, 0, '(', ')') === nextValue.length - 1) {
    nextValue = nextValue.slice(1, -1).trim()
  }

  return nextValue
}

function unescapeCppString(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

function evaluateNumericExpression(expression: string, values: Map<string, string>): number | null {
  let nextExpression = expression

  for (const [name, value] of values) {
    nextExpression = nextExpression.replace(new RegExp(`\\b${name}\\b`, 'g'), value)
  }

  if (!/^[\d+\-*/%().\s]+$/.test(nextExpression)) return null

  try {
    const result = Function(`"use strict"; return (${nextExpression})`)()
    return Number.isFinite(result) ? Math.trunc(result) : null
  } catch {
    return null
  }
}
