import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { ServiceError } from '@/lib/services/errors'
import { getLevelAccessForUser } from '@/lib/services/level-access-service'
import { getLevelByIdForUser } from '@/lib/services/level-service'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const [{ id }, session] = await Promise.all([context.params, auth()])
    if (!session?.user?.id) throw new ServiceError('unauthorized', '当前未登录。', 401)
    const level = await getLevelByIdForUser(id, {
      userId: session.user.id,
      allowMockFallback: true,
    })

    if (!level) throw new ServiceError('not_found', 'Level not found.', 404)
    const access = await getLevelAccessForUser({
      userId: session.user.id,
      levelId: level.id,
    })
    if (!access.allowed) throw new ServiceError('forbidden', access.reason ?? '当前关卡尚未解锁。', 403)
    return jsonOk({ level })
  } catch (error) {
    return jsonError(error)
  }
}
