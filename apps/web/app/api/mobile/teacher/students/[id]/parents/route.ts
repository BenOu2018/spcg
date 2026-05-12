import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { ServiceError } from '@/lib/services/errors'
import {
  bindExistingParentToTeacherStudent,
  createParentForTeacherStudent,
  getParentsForTeacherStudent,
} from '@/lib/services/parent-service'

type TeacherStudentParentsRouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

type ParentBody = {
  username?: unknown
  displayName?: unknown
  password?: unknown
  email?: unknown
  phoneNumber?: unknown
  parentIdentifier?: unknown
  note?: unknown
}

export async function GET(_request: Request, context: TeacherStudentParentsRouteContext) {
  try {
    const [{ id }, session] = await Promise.all([context.params, auth()])
    const parents = await getParentsForTeacherStudent({
      teacherUserId: session?.user?.id,
      studentUserId: id,
    })
    return jsonOk({ parents })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request, context: TeacherStudentParentsRouteContext) {
  try {
    const [{ id }, session, body] = await Promise.all([
      context.params,
      auth(),
      request.json().catch(() => ({})) as Promise<ParentBody>,
    ])

    const username = typeof body.username === 'string' ? body.username.trim() : ''
    if (username) {
      const parents = await createParentForTeacherStudent({
        teacherUserId: session?.user?.id,
        studentUserId: id,
        username,
        displayName: typeof body.displayName === 'string' ? body.displayName : '',
        password: typeof body.password === 'string' ? body.password : '',
        email: typeof body.email === 'string' ? body.email : null,
        phoneNumber: typeof body.phoneNumber === 'string' ? body.phoneNumber : null,
        note: typeof body.note === 'string' ? body.note : null,
      })
      return jsonOk({ parents }, { status: 201 })
    }

    const parentIdentifier = typeof body.parentIdentifier === 'string' ? body.parentIdentifier.trim() : ''
    if (!parentIdentifier) throw new ServiceError('bad_request', 'username or parentIdentifier is required.', 400)

    const parents = await bindExistingParentToTeacherStudent({
      teacherUserId: session?.user?.id,
      studentUserId: id,
      parentIdentifier,
      note: typeof body.note === 'string' ? body.note : null,
    })
    return jsonOk({ parents }, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
