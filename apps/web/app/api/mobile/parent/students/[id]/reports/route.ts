import { after } from 'next/server'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import {
  getParentMobileReports,
  readBearerToken,
  requestParentMobileReport,
} from '@/lib/services/parent-mobile-service'
import { completeGrowthReportGeneration } from '@/lib/services/growth-report-service'

type ParentStudentReportsRouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function GET(request: Request, context: ParentStudentReportsRouteContext) {
  try {
    const { id } = await context.params
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 10)
    const result = await getParentMobileReports({
      token: readBearerToken(request.headers.get('authorization')),
      studentUserId: id,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 10,
    })
    return jsonOk(result)
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request, context: ParentStudentReportsRouteContext) {
  try {
    const { id } = await context.params
    const result = await requestParentMobileReport({
      token: readBearerToken(request.headers.get('authorization')),
      studentUserId: id,
    })
    after(() => completeGrowthReportGeneration(result.report.id))
    return jsonOk(result, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
