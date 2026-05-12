import type { CodeErrorAnalysis } from '@spcg/shared/types'
import { ServiceError } from '@/lib/services/errors'
import {
  getMiniMaxCodeHelpRuntimeConfig,
  type MiniMaxCodeHelpRuntimeConfig,
} from '@/lib/services/system-settings-service'

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

type AnthropicMessagesResponse = {
  content?: Array<{
    type?: string
    text?: string
  }>
  error?: {
    message?: string
    type?: string
  }
  base_resp?: {
    status_code?: number
    status_msg?: string
  }
}

export type MiniMaxCodeHelpConfig = MiniMaxCodeHelpRuntimeConfig

const MIN_EFFECTIVE_TIMEOUT_MS = 120_000

export async function getMiniMaxCodeHelpConfig(): Promise<MiniMaxCodeHelpConfig> {
  return getMiniMaxCodeHelpRuntimeConfig()
}

export async function generateCodeErrorAnalysisWithMiniMax(input: {
  systemPrompt: string
  userPrompt: string
}): Promise<{ analysis: CodeErrorAnalysis; model: string }> {
  const config = await getMiniMaxCodeHelpConfig()
  const apiKey = config.apiKey

  if (!config.enabled) {
    throw new ServiceError('bad_request', 'AI 错误分析已关闭。', 400)
  }

  if (!apiKey) {
    throw new ServiceError('bad_request', 'MiniMax API Key 未配置，AI 错误分析暂不可用。', 400)
  }

  const controller = new AbortController()
  const timeoutMs = Math.max(config.timeoutMs, MIN_EFFECTIVE_TIMEOUT_MS)
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const content =
      config.apiMode === 'openai'
        ? await requestOpenAICompatibleAnalysis(config, apiKey, input, controller.signal)
        : await requestAnthropicCompatibleAnalysis(config, apiKey, input, controller.signal)
    const analysis = parseAnalysis(content)
    return { analysis, model: config.model }
  } catch (error) {
    if (error instanceof ServiceError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServiceError('internal_error', 'MiniMax 错误分析超时，请稍后重试。', 504)
    }
    throw new ServiceError(
      'internal_error',
      error instanceof Error ? `MiniMax 错误分析失败：${error.message}` : 'MiniMax 错误分析失败。',
      502,
    )
  } finally {
    clearTimeout(timer)
  }
}

async function requestAnthropicCompatibleAnalysis(
  config: MiniMaxCodeHelpConfig,
  apiKey: string,
  input: {
    systemPrompt: string
    userPrompt: string
  },
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(buildAnthropicMessagesUrl(config.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1200,
      temperature: 0.2,
      system: input.systemPrompt,
      messages: [{ role: 'user', content: input.userPrompt }],
    }),
    signal,
  })

  const data = (await response.json().catch(() => null)) as AnthropicMessagesResponse | null
  const apiStatusCode = data?.base_resp?.status_code

  if (!response.ok || (typeof apiStatusCode === 'number' && apiStatusCode !== 0)) {
    throw new ServiceError(
      'internal_error',
      readMiniMaxErrorMessage(data, response.status),
      502,
    )
  }

  return (
    data?.content
      ?.filter((item) => item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text?.trim())
      .filter(Boolean)
      .join('\n') ?? ''
  )
}

async function requestOpenAICompatibleAnalysis(
  config: MiniMaxCodeHelpConfig,
  apiKey: string,
  input: {
    systemPrompt: string
    userPrompt: string
  },
  signal: AbortSignal,
): Promise<string> {
  const data = await postOpenAICompatibleAnalysis(config, apiKey, input, signal, true)
  return data?.choices?.[0]?.message?.content ?? ''
}

async function postOpenAICompatibleAnalysis(
  config: MiniMaxCodeHelpConfig,
  apiKey: string,
  input: {
    systemPrompt: string
    userPrompt: string
  },
  signal: AbortSignal,
  jsonMode: boolean,
): Promise<ChatCompletionResponse | null> {
  const response = await fetch(buildOpenAIChatCompletionsUrl(config.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
    }),
    signal,
  })

  const data = (await response.json().catch(() => null)) as ChatCompletionResponse | null

  if (!response.ok) {
    if (jsonMode && isUnsupportedJsonModeError(data, response.status)) {
      return postOpenAICompatibleAnalysis(config, apiKey, input, signal, false)
    }

    throw new ServiceError(
      'internal_error',
      data?.error?.message ? `MiniMax 错误分析失败：${data.error.message}` : `MiniMax 错误分析失败：HTTP ${response.status}`,
      502,
    )
  }

  return data
}

function buildAnthropicMessagesUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '')
  if (normalized.endsWith('/v1/messages')) return normalized
  if (normalized.endsWith('/v1')) return `${normalized}/messages`
  return `${normalized}/v1/messages`
}

function buildOpenAIChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '')
  if (normalized.endsWith('/chat/completions')) return normalized
  return `${normalized}/chat/completions`
}

function readMiniMaxErrorMessage(data: AnthropicMessagesResponse | null, status: number): string {
  if (data?.error?.message) return `MiniMax 错误分析失败：${data.error.message}`
  if (data?.base_resp?.status_msg) return `MiniMax 错误分析失败：${data.base_resp.status_msg}`
  return `MiniMax 错误分析失败：HTTP ${status}`
}

function isUnsupportedJsonModeError(data: ChatCompletionResponse | null, status: number): boolean {
  const message = data?.error?.message?.toLowerCase() ?? ''
  return status === 400 && (message.includes('response_format') || message.includes('json_object') || message.includes('json mode'))
}

function parseAnalysis(content: string): CodeErrorAnalysis {
  const parsed = tryParseJsonObject(content)

  if (parsed) {
    return normalizeAnalysis(parsed)
  }

  const rawResponse = content.trim()
  return normalizeAnalysis({
    nonStructured: true,
    rawResponse: rawResponse || 'MiniMax 未返回可读内容。',
    summary: 'MiniMax 返回了非 JSON 内容。',
    whereWrong: rawResponse || 'MiniMax 未返回可读内容。',
    likelyCause: rawResponse || 'MiniMax 未返回可读内容。',
    reasonList: [],
    lineHints: [],
    nextSteps: [],
    fixedConcept: 'MiniMax 原始返回',
  })
}

function tryParseJsonObject(content: string): Record<string, unknown> | null {
  const withoutThink = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fence = withoutThink.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i)
  const candidate = (fence?.[1] ?? withoutThink).trim()
  const jsonStart = candidate.indexOf('{')
  const jsonEnd = candidate.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null

  try {
    const parsed = JSON.parse(candidate.slice(jsonStart, jsonEnd + 1)) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function normalizeAnalysis(value: Record<string, unknown>): CodeErrorAnalysis {
  return {
    rawResponse: readOptionalText(value.rawResponse),
    nonStructured: value.nonStructured === true,
    whereWrong: readText(value.whereWrong, readText(value.summary, '这次提交没有通过，先定位最关键的错误位置。')),
    summary: readText(value.summary, '这次提交没有通过。'),
    likelyCause: readText(value.likelyCause, '需要结合错误信息和题目要求定位原因。'),
    reasonList: readStringArray(value.reasonList).slice(0, 6),
    lineHints: readStringArray(value.lineHints).slice(0, 6),
    nextSteps: readStringArray(value.nextSteps).slice(0, 6),
    fixedConcept: readText(value.fixedConcept, '先修正当前错误，再用公开样例验证。'),
  }
}

function readText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function readOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
}
