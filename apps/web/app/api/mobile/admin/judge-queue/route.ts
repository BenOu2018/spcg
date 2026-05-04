import { jsonError, jsonOk } from '@/lib/services/api-response'
import { getAdminContext } from '@/lib/admin-auth'
import { ServiceError } from '@/lib/services/errors'
import { getJudgeQueueHealth } from '@/lib/services/submission-service'

export async function GET() {
  try {
    const admin = await getAdminContext('support')
    if (!admin) throw new ServiceError('unauthorized', 'Admin access required.', 401)

    const queue = await getJudgeQueueHealth()
    return jsonOk({ queue })
  } catch (error) {
    return jsonError(error)
  }
}
