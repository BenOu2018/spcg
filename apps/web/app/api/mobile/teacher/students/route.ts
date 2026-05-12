import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { ServiceError } from '@/lib/services/errors'
import { addStudentToTeacher, createStudentForTeacher, getTeacherStudents } from '@/lib/services/teacher-service'

type AddStudentBody = {
  studentIdentifier?: unknown
  username?: unknown
  email?: unknown
  password?: unknown
  displayName?: unknown
  parentEmail?: unknown
  age?: unknown
}

export async function GET() {
  try {
    const session = await auth()
    const students = await getTeacherStudents(session?.user?.id)
    return jsonOk({ students })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    const body = (await request.json()) as AddStudentBody
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    if (username) {
      const age = typeof body.age === 'number' ? body.age : Number(body.age ?? '')
      const student = await createStudentForTeacher({
        teacherUserId: session?.user?.id,
        username,
        email: typeof body.email === 'string' ? body.email.trim() : null,
        password: typeof body.password === 'string' ? body.password : '',
        displayName: typeof body.displayName === 'string' ? body.displayName : '',
        parentEmail: typeof body.parentEmail === 'string' ? body.parentEmail : null,
        age: Number.isInteger(age) ? age : null,
      })
      return jsonOk({ student }, { status: 201 })
    }

    const studentIdentifier = typeof body.studentIdentifier === 'string' ? body.studentIdentifier.trim() : ''
    if (!studentIdentifier) throw new ServiceError('bad_request', 'studentIdentifier is required.', 400)

    const student = await addStudentToTeacher({
      teacherUserId: session?.user?.id,
      studentIdentifier,
    })
    return jsonOk({ student }, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
