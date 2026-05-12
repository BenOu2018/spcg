import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { removeParentFromTeacherStudent } from '@/lib/services/parent-service'

type TeacherStudentParentRouteContext = {
  params: Promise<{ id: string; parentId: string }> | { id: string; parentId: string }
}

export async function DELETE(_request: Request, context: TeacherStudentParentRouteContext) {
  try {
    const [{ id, parentId }, session] = await Promise.all([context.params, auth()])
    await removeParentFromTeacherStudent({
      teacherUserId: session?.user?.id,
      studentUserId: id,
      parentUserId: parentId,
    })
    return jsonOk({ removed: true })
  } catch (error) {
    return jsonError(error)
  }
}
