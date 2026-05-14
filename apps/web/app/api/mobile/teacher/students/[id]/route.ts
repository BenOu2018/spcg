import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { removeStudentFromTeacher, updateTeacherStudentLearningProfile } from '@/lib/services/teacher-service'
import { isStudentUserType, setStudentUserType } from '@/lib/services/entitlement-service'
import { isStudentEnrollmentType } from '@/lib/student-enrollment'

type StudentRouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

type UpdateStudentBody = {
  displayName?: unknown
  age?: unknown
  realName?: unknown
  idCardNumber?: unknown
  parentEmail?: unknown
  studentEnrollmentType?: unknown
  teacherNote?: unknown
  userType?: unknown
  userTypeNote?: unknown
}

export async function PATCH(request: Request, context: StudentRouteContext) {
  try {
    const [{ id }, session, body] = await Promise.all([
      context.params,
      auth(),
      request.json().catch(() => ({})) as Promise<UpdateStudentBody>,
    ])
    const age = typeof body.age === 'number' ? body.age : Number(body.age ?? '')
    const student = await updateTeacherStudentLearningProfile({
      teacherUserId: session?.user?.id,
      studentUserId: id,
      displayName: typeof body.displayName === 'string' ? body.displayName : '',
      age: Number.isInteger(age) ? age : null,
      realName: typeof body.realName === 'string' ? body.realName : null,
      idCardNumber: typeof body.idCardNumber === 'string' ? body.idCardNumber : null,
      parentEmail: typeof body.parentEmail === 'string' ? body.parentEmail : null,
      studentEnrollmentType: isStudentEnrollmentType(body.studentEnrollmentType) ? body.studentEnrollmentType : null,
      teacherNote: typeof body.teacherNote === 'string' ? body.teacherNote : null,
    })
    const entitlement =
      typeof body.userType === 'string' && isStudentUserType(body.userType)
        ? await setStudentUserType({
            actorUserId: session?.user?.id,
            studentUserId: id,
            userType: body.userType,
            note: typeof body.userTypeNote === 'string' ? body.userTypeNote : null,
          })
        : null
    return jsonOk({ student, entitlement })
  } catch (error) {
    return jsonError(error)
  }
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
