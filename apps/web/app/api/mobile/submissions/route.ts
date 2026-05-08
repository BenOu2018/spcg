import { auth } from '@/auth'
import { wakeJudgeWorker } from '@/lib/judge-worker-autostart'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { ServiceError } from '@/lib/services/errors'
import { createUserSubmission, requireUserSubmissionHistory } from '@/lib/services/submission-service'

type SubmitBody = {
  levelId?: unknown
  code?: unknown
}

export async function GET(request: Request) {
  try {
    const session = await auth()
    const levelId = new URL(request.url).searchParams.get('levelId') ?? ''
    const result = await requireUserSubmissionHistory({
      userId: session?.user?.id,
      levelId,
    })

    return jsonOk(result)
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    const body = (await request.json()) as SubmitBody
    const levelId = typeof body.levelId === 'string' ? body.levelId : ''
    const code = typeof body.code === 'string' ? body.code : ''

    const result = await createUserSubmission({
      userId: session?.user?.id,
      levelId,
      code,
    })

    if (!result.ok) {
      const status =
        result.code === 'unauthorized' ? 401 : result.code === 'forbidden' ? 403 : result.code === 'rate_limited' ? 429 : 400
      const code = result.code === 'empty' ? 'bad_request' : result.code
      throw new ServiceError(code, result.reason, status, result.retryAfterSeconds)
    }

    wakeJudgeWorker()
    return jsonOk(
      {
        submissionId: result.submissionId,
        status: result.status,
      },
      { status: 201 },
    )
  } catch (error) {
    return jsonError(error)
  }
}
