import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { recordUserBehaviorEventBatch } from '@/lib/services/behavior-analytics-service'

export async function POST(request: Request) {
  try {
    const [session, body] = await Promise.all([
      auth(),
      request.json().catch(() => ({})) as Promise<Record<string, unknown>>,
    ])
    const result = await recordUserBehaviorEventBatch({
      userId: session?.user?.id,
      clientSessionId: body.clientSessionId,
      pageViewId: body.pageViewId,
      userAgent: request.headers.get('user-agent'),
      events: body.events,
    })

    return jsonOk(result, { status: 202 })
  } catch (error) {
    return jsonError(error)
  }
}
