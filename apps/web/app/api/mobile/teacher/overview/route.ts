import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { getTeacherDashboard } from '@/lib/services/teacher-service'

export async function GET() {
  try {
    const session = await auth()
    const dashboard = await getTeacherDashboard(session?.user?.id)
    return jsonOk({
      overview: dashboard.overview,
      students: dashboard.students,
    })
  } catch (error) {
    return jsonError(error)
  }
}
