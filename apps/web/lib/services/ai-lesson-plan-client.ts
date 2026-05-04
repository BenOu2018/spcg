import { ServiceError } from '@/lib/services/errors'

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

export type AiLessonPlanConfig = {
  configured: boolean
  model: string | null
  baseUrl: string | null
}

export function getAiLessonPlanConfig(): AiLessonPlanConfig {
  return {
    configured: Boolean(
      process.env.LESSON_PLAN_AI_BASE_URL &&
        process.env.LESSON_PLAN_AI_API_KEY &&
        process.env.LESSON_PLAN_AI_MODEL,
    ),
    model: process.env.LESSON_PLAN_AI_MODEL ?? null,
    baseUrl: process.env.LESSON_PLAN_AI_BASE_URL ?? null,
  }
}

export async function generateLessonPlanMarkdownWithAi(input: {
  systemPrompt: string
  userPrompt: string
}): Promise<{ markdown: string; model: string }> {
  const baseUrl = process.env.LESSON_PLAN_AI_BASE_URL?.replace(/\/+$/, '')
  const apiKey = process.env.LESSON_PLAN_AI_API_KEY
  const model = process.env.LESSON_PLAN_AI_MODEL

  if (!baseUrl || !apiKey || !model) {
    throw new ServiceError(
      'bad_request',
      'AI 教案环境变量未配置：需要 LESSON_PLAN_AI_BASE_URL、LESSON_PLAN_AI_API_KEY、LESSON_PLAN_AI_MODEL。',
      400,
    )
  }

  const timeoutMs = Number(process.env.LESSON_PLAN_AI_TIMEOUT_MS ?? 60_000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 60_000)

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userPrompt },
        ],
      }),
      signal: controller.signal,
    })

    const data = (await response.json().catch(() => null)) as ChatCompletionResponse | null

    if (!response.ok) {
      throw new ServiceError(
        'internal_error',
        data?.error?.message ? `AI 教案生成失败：${data.error.message}` : `AI 教案生成失败：HTTP ${response.status}`,
        502,
      )
    }

    const markdown = cleanMarkdown(data?.choices?.[0]?.message?.content ?? '')
    if (!markdown.trim()) {
      throw new ServiceError('internal_error', 'AI 教案生成失败：模型未返回 Markdown 内容。', 502)
    }

    return { markdown, model }
  } catch (error) {
    if (error instanceof ServiceError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServiceError('internal_error', 'AI 教案生成超时，请稍后重试。', 504)
    }
    throw new ServiceError(
      'internal_error',
      error instanceof Error ? `AI 教案生成失败：${error.message}` : 'AI 教案生成失败。',
      502,
    )
  } finally {
    clearTimeout(timer)
  }
}

function cleanMarkdown(value: string): string {
  const trimmed = value.trim()
  const fence = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i)
  return (fence?.[1] ?? trimmed).trim()
}
