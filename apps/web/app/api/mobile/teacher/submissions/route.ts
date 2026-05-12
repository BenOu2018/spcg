import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { getTeacherSubmissionHistory } from '@/lib/services/teacher-service'

export async function GET(request: Request) {
  try {
    const session = await auth()
    const params = new URL(request.url).searchParams
    const spcgLevelValue = params.get('spcgLevel')
    const limitValue = Number(params.get('limit') ?? 100)
    const submissions = await getTeacherSubmissionHistory({
      teacherUserId: session?.user?.id,
      studentUserId: params.get('studentUserId'),
      spcgLevel: spcgLevelValue ? Number(spcgLevelValue) : null,
      levelId: params.get('levelId'),
      result: params.get('result'),
      dateFrom: params.get('dateFrom'),
      dateTo: params.get('dateTo'),
      limit: Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 300) : 100,
    })
    return jsonOk({ submissions })
  } catch (error) {
    return jsonError(error)
  }
}
