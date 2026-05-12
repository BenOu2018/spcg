import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { ServiceError } from '@/lib/services/errors'
import { explainSubmissionErrorForTeacher } from '@/lib/services/submission-error-analysis-service'

type TeacherSubmissionAnalysisRouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function POST(_request: Request, context: TeacherSubmissionAnalysisRouteContext) {
  try {
    const [{ id }, session] = await Promise.all([context.params, auth()])
    const result = await explainSubmissionErrorForTeacher({
      teacherUserId: session?.user?.id,
      submissionId: id,
    })
    if (!result.ok) throw new ServiceError('bad_request', result.error, 400)
    return jsonOk(result)
  } catch (error) {
    return jsonError(error)
  }
}
