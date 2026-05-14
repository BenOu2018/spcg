import { jsonError, jsonOk } from '@/lib/services/api-response'
import { bindStudentForParentMobile, readBearerToken } from '@/lib/services/parent-mobile-service'

type BindStudentBody = {
  inviteCode?: unknown
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as BindStudentBody
    const dashboard = await bindStudentForParentMobile({
      token: readBearerToken(request.headers.get('authorization')),
      inviteCode: typeof body.inviteCode === 'string' ? body.inviteCode : '',
    })
    return jsonOk(dashboard)
  } catch (error) {
    return jsonError(error)
  }
}
