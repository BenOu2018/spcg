import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { ServiceError } from '@/lib/services/errors'
import { getMePagePayloadForSession } from '@/lib/services/me-page-payload-service'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new ServiceError('unauthorized', '当前未登录。', 401)

    const result = await getMePagePayloadForSession(session)
    return jsonOk({ payload: result.cachePayload })
  } catch (error) {
    return jsonError(error)
  }
}
