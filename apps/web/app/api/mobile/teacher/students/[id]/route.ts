import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { removeStudentFromTeacher } from '@/lib/services/teacher-service'

type StudentRouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function DELETE(_request: Request, context: StudentRouteContext) {
  try {
    const [{ id }, session] = await Promise.all([context.params, auth()])
    await removeStudentFromTeacher({
      teacherUserId: session?.user?.id,
      studentUserId: id,
    })
    return jsonOk({ removed: true })
  } catch (error) {
    return jsonError(error)
  }
}
