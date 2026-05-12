import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { revokeStudentTeacherShare } from '@/lib/services/teacher-service'

type TeacherStudentShareTeacherRouteContext = {
  params: Promise<{ id: string; teacherId: string }> | { id: string; teacherId: string }
}

export async function DELETE(_request: Request, context: TeacherStudentShareTeacherRouteContext) {
  try {
    const [{ id, teacherId }, session] = await Promise.all([context.params, auth()])
    await revokeStudentTeacherShare({
      teacherUserId: session?.user?.id,
      studentUserId: id,
      targetTeacherUserId: teacherId,
    })
    return jsonOk({ revoked: true })
  } catch (error) {
    return jsonError(error)
  }
}
