import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import {
  generateBehaviorAnalysisForTeacherStudent,
  getTeacherStudentBehaviorAnalyses,
} from '@/lib/services/behavior-analytics-service'

type TeacherStudentBehaviorAnalysesRouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

type BehaviorAnalysisBody = {
  periodStart?: unknown
  periodEnd?: unknown
  periodDays?: unknown
}

export async function GET(request: Request, context: TeacherStudentBehaviorAnalysesRouteContext) {
  try {
    const [{ id }, session] = await Promise.all([context.params, auth()])
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 10)
    const analyses = await getTeacherStudentBehaviorAnalyses({
      teacherUserId: session?.user?.id,
      studentUserId: id,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 10,
    })
    return jsonOk({ analyses })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request, context: TeacherStudentBehaviorAnalysesRouteContext) {
  try {
    const [{ id }, session, body] = await Promise.all([
      context.params,
      auth(),
      request.json().catch(() => ({})) as Promise<BehaviorAnalysisBody>,
    ])
    const analysis = await generateBehaviorAnalysisForTeacherStudent({
      teacherUserId: session?.user?.id,
      studentUserId: id,
      periodStart: typeof body.periodStart === 'string' ? body.periodStart : null,
      periodEnd: typeof body.periodEnd === 'string' ? body.periodEnd : null,
      periodDays: typeof body.periodDays === 'number' ? body.periodDays : Number(body.periodDays ?? 7),
    })
    return jsonOk({ analysis }, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
