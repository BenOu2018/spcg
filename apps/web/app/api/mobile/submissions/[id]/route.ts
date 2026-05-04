import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { requireUserSubmissionVerdict } from '@/lib/services/submission-service'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const [{ id }, session] = await Promise.all([context.params, auth()])
    const submission = await requireUserSubmissionVerdict({
      userId: session?.user?.id,
      submissionId: id,
    })

    return jsonOk({ submission })
  } catch (error) {
    return jsonError(error)
  }
}
