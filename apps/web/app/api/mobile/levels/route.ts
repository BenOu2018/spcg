import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { getMainlineLevelsForUser } from '@/lib/services/level-service'

export async function GET() {
  try {
    const session = await auth()
    const levels = await getMainlineLevelsForUser({
      userId: session?.user?.id,
      allowMockFallback: true,
    })

    return jsonOk({ levels })
  } catch (error) {
    return jsonError(error)
  }
}
