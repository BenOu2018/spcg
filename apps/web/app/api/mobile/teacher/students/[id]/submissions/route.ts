import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { getTeacherStudentSubmissions } from '@/lib/services/teacher-service'

type StudentSubmissionsRouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function GET(request: Request, context: StudentSubmissionsRouteContext) {
  try {
    const [{ id }, session] = await Promise.all([context.params, auth()])
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 50)
    const submissions = await getTeacherStudentSubmissions({
      teacherUserId: session?.user?.id,
      studentUserId: id,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50,
    })
    return jsonOk({ submissions })
  } catch (error) {
    return jsonError(error)
  }
}
