import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { pickChildFriendlyMessage } from '../_shared/child-messages.ts'
import { runJudge0, type TestCase, type Verdict } from '../_shared/judge0.ts'

type SubmitBody = {
  levelId?: unknown
  code?: unknown
}

type LevelRow = {
  id: string
  test_cases: TestCase[]
  time_limit_ms: number
  memory_limit_mb: number
}

const MAX_CODE_LENGTH = 20_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return errorResponse('Unauthorized', 401)

    const supabaseUrl = mustGetEnv('SUPABASE_URL')
    const anonKey = mustGetEnv('SUPABASE_ANON_KEY')
    const serviceRoleKey = mustGetEnv('SUPABASE_SERVICE_ROLE_KEY')

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userError } = await authClient.auth.getUser(token)
    if (userError || !userData.user) return errorResponse('Unauthorized', 401)

    const body = (await req.json()) as SubmitBody
    const levelId = readString(body.levelId)
    const code = readString(body.code)

    if (!levelId) return errorResponse('levelId is required', 400)
    if (!code) return errorResponse('code is required', 400)
    if (code.length > MAX_CODE_LENGTH) return errorResponse('code is too long', 413)

    const { data: level, error: levelError } = await serviceClient
      .from('levels')
      .select('id,test_cases,time_limit_ms,memory_limit_mb')
      .eq('id', levelId)
      .single<LevelRow>()

    if (levelError || !level) return errorResponse('Level not found', 404)

    const { data: submission, error: insertError } = await serviceClient
      .from('submissions')
      .insert({
        user_id: userData.user.id,
        level_id: levelId,
        code,
        language: 'cpp',
        status: 'pending',
      })
      .select('id,status')
      .single()

    if (insertError || !submission) {
      throw new Error(`Failed to create submission: ${insertError?.message ?? 'unknown error'}`)
    }

    const judgePromise = judgeSubmission({
      serviceClient,
      submissionId: submission.id,
      userId: userData.user.id,
      level,
      code,
    })

    const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } })
      .EdgeRuntime
    if (edgeRuntime?.waitUntil) {
      edgeRuntime.waitUntil(judgePromise)
    } else {
      judgePromise.catch((error) => console.error(error))
    }

    return jsonResponse({ id: submission.id, status: submission.status })
  } catch (error) {
    console.error(error)
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', 500)
  }
})

async function judgeSubmission(input: {
  serviceClient: ReturnType<typeof createClient>
  submissionId: string
  userId: string
  level: LevelRow
  code: string
}) {
  const { serviceClient, submissionId, userId, level, code } = input

  await serviceClient.from('submissions').update({ status: 'judging' }).eq('id', submissionId)

  try {
    const verdict = await runJudge0({
      code,
      cases: level.test_cases,
      timeLimitMs: level.time_limit_ms,
      memoryLimitMb: level.memory_limit_mb,
      childMessage: pickChildFriendlyMessage,
    })

    await serviceClient
      .from('submissions')
      .update({ status: 'done', verdict, updated_at: new Date().toISOString() })
      .eq('id', submissionId)

    await updateProgress(serviceClient, userId, level.id, verdict)
  } catch (error) {
    const verdict: Verdict = {
      result: 'RE',
      passedCases: 0,
      totalCases: level.test_cases.length,
      maxRuntimeMs: 0,
      failedCaseIndex: null,
      childFriendlyMessage: '判题服务暂时没有跑完，请稍后再试一次。',
      errorDetail: error instanceof Error ? error.message : String(error),
    }

    await serviceClient
      .from('submissions')
      .update({ status: 'error', verdict, updated_at: new Date().toISOString() })
      .eq('id', submissionId)
  }
}

async function updateProgress(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  levelId: string,
  verdict: Verdict,
) {
  const { data: current } = await serviceClient
    .from('progress')
    .select('attempt_count,best_runtime_ms,passed')
    .eq('user_id', userId)
    .eq('level_id', levelId)
    .maybeSingle()

  const passed = verdict.result === 'AC' || Boolean(current?.passed)
  const bestRuntimeMs =
    verdict.result === 'AC'
      ? Math.min(current?.best_runtime_ms ?? verdict.maxRuntimeMs, verdict.maxRuntimeMs)
      : current?.best_runtime_ms ?? null

  await serviceClient.from('progress').upsert(
    {
      user_id: userId,
      level_id: levelId,
      passed,
      attempt_count: (current?.attempt_count ?? 0) + 1,
      best_runtime_ms: bestRuntimeMs,
      last_submitted_at: new Date().toISOString(),
      passed_out: false,
    },
    { onConflict: 'user_id,level_id' },
  )
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function mustGetEnv(key: string): string {
  const value = Deno.env.get(key)
  if (!value) throw new Error(`${key} is required`)
  return value
}
