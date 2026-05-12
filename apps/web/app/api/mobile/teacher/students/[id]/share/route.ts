import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { ServiceError } from '@/lib/services/errors'
import { shareStudentWithTeacher } from '@/lib/services/teacher-service'

type TeacherStudentShareRouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

type ShareBody = {
  targetTeacherIdentifier?: unknown
}

export async function POST(request: Request, context: TeacherStudentShareRouteContext) {
  try {
    const [{ id }, session, body] = await Promise.all([
      context.params,
      auth(),
      request.json().catch(() => ({})) as Promise<ShareBody>,
    ])
    const targetTeacherIdentifier =
      typeof body.targetTeacherIdentifier === 'string' ? body.targetTeacherIdentifier.trim() : ''
    if (!targetTeacherIdentifier) throw new ServiceError('bad_request', 'targetTeacherIdentifier is required.', 400)

    await shareStudentWithTeacher({
      teacherUserId: session?.user?.id,
      studentUserId: id,
      targetTeacherIdentifier,
    })
    return jsonOk({ shared: true }, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
