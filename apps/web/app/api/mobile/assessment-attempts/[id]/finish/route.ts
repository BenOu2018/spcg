import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { finishUserAssessmentAttempt } from '@/lib/services/assessment-service'

type RouteContext = {
  params: Promise<{ id: string }>
}

type FinishBody = {
  totalCount?: unknown
  expired?: unknown
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const [{ id }, session, body] = await Promise.all([
      context.params,
      auth(),
      request.json().catch(() => ({})) as Promise<FinishBody>,
    ])
    const totalCount = typeof body.totalCount === 'number' ? body.totalCount : 0
    const attempt = await finishUserAssessmentAttempt({
      userId: session?.user?.id,
      attemptId: id,
      totalCount,
      expired: body.expired === true,
    })

    return jsonOk({ attempt })
  } catch (error) {
    return jsonError(error)
  }
}
