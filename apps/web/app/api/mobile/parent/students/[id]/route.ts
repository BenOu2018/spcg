import { jsonError, jsonOk } from '@/lib/services/api-response'
import { getParentMobileStudent, readBearerToken } from '@/lib/services/parent-mobile-service'

type ParentStudentRouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function GET(request: Request, context: ParentStudentRouteContext) {
  try {
    const { id } = await context.params
    const student = await getParentMobileStudent({
      token: readBearerToken(request.headers.get('authorization')),
      studentUserId: id,
    })
    return jsonOk({ student })
  } catch (error) {
    return jsonError(error)
  }
}
