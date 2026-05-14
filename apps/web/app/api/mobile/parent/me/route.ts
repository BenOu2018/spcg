import { jsonError, jsonOk } from '@/lib/services/api-response'
import { getParentMobileDashboard, readBearerToken } from '@/lib/services/parent-mobile-service'

export async function GET(request: Request) {
  try {
    const dashboard = await getParentMobileDashboard(readBearerToken(request.headers.get('authorization')))
    return jsonOk(dashboard)
  } catch (error) {
    return jsonError(error)
  }
}
