import { jsonError, jsonOk } from '@/lib/services/api-response'
import { getParentMobileReportDetail, readBearerToken } from '@/lib/services/parent-mobile-service'

type ParentStudentReportDetailRouteContext = {
  params: Promise<{ id: string; reportId: string }> | { id: string; reportId: string }
}

export async function GET(request: Request, context: ParentStudentReportDetailRouteContext) {
  try {
    const { id, reportId } = await context.params
    const report = await getParentMobileReportDetail({
      token: readBearerToken(request.headers.get('authorization')),
      studentUserId: id,
      reportId,
    })
    return jsonOk({ report })
  } catch (error) {
    return jsonError(error)
  }
}
