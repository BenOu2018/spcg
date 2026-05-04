import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { startAssessmentAttempt } from '@/lib/services/assessment-service'

type RouteContext = {
  params: Promise<{ id: string }>
}

type StartBody = {
  totalCount?: unknown
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const [{ id }, session, body] = await Promise.all([
      context.params,
      auth(),
      request.json().catch(() => ({})) as Promise<StartBody>,
    ])
    const totalCount = typeof body.totalCount === 'number' ? body.totalCount : 0
    const attempt = await startAssessmentAttempt({
      userId: session?.user?.id,
      sessionId: id,
      totalCount,
    })

    return jsonOk({ attempt }, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
