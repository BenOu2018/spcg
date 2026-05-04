import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { ServiceError } from '@/lib/services/errors'
import { getLevelByIdForUser } from '@/lib/services/level-service'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const [{ id }, session] = await Promise.all([context.params, auth()])
    const level = await getLevelByIdForUser(id, {
      userId: session?.user?.id,
      allowMockFallback: true,
    })

    if (!level) throw new ServiceError('not_found', 'Level not found.', 404)
    return jsonOk({ level })
  } catch (error) {
    return jsonError(error)
  }
}
