import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { ServiceError } from '@/lib/services/errors'
import { getProgressForUser } from '@/lib/services/progress-service'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new ServiceError('unauthorized', '当前未登录。', 401)

    const progress = await getProgressForUser({
      userId: session.user.id,
      allowMockFallback: false,
    })

    return jsonOk({ progress })
  } catch (error) {
    return jsonError(error)
  }
}
