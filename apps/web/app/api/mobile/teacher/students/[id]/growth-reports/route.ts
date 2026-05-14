import { auth } from '@/auth'
import { after } from 'next/server'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import {
  completeGrowthReportGeneration,
  generateGrowthReportForTeacherStudent,
  getTeacherStudentGrowthReports,
} from '@/lib/services/growth-report-service'

type TeacherStudentGrowthReportsRouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

type GrowthReportBody = {
  periodStart?: unknown
  periodEnd?: unknown
}

export async function GET(request: Request, context: TeacherStudentGrowthReportsRouteContext) {
  try {
    const [{ id }, session] = await Promise.all([context.params, auth()])
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 10)
    const reports = await getTeacherStudentGrowthReports({
      teacherUserId: session?.user?.id,
      studentUserId: id,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 10,
    })
    return jsonOk({ reports })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request, context: TeacherStudentGrowthReportsRouteContext) {
  try {
    const [{ id }, session, body] = await Promise.all([
      context.params,
      auth(),
      request.json().catch(() => ({})) as Promise<GrowthReportBody>,
    ])
    const result = await generateGrowthReportForTeacherStudent({
      teacherUserId: session?.user?.id,
      studentUserId: id,
      periodStart: typeof body.periodStart === 'string' ? body.periodStart : null,
      periodEnd: typeof body.periodEnd === 'string' ? body.periodEnd : null,
    })
    after(() => completeGrowthReportGeneration(result.report.id))
    return jsonOk(result, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
