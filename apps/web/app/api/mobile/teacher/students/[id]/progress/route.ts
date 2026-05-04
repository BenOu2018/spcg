import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { getTeacherStudentProgress } from '@/lib/services/teacher-service'

type StudentProgressRouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function GET(_request: Request, context: StudentProgressRouteContext) {
  try {
    const [{ id }, session] = await Promise.all([context.params, auth()])
    const progress = await getTeacherStudentProgress({
      teacherUserId: session?.user?.id,
      studentUserId: id,
    })
    return jsonOk({ progress })
  } catch (error) {
    return jsonError(error)
  }
}
