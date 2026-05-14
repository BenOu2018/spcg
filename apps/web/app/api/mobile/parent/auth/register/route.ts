import { jsonError, jsonOk } from '@/lib/services/api-response'
import { registerParentMobile } from '@/lib/services/parent-mobile-service'

type RegisterParentBody = {
  email?: unknown
  displayName?: unknown
  password?: unknown
  confirmPassword?: unknown
  inviteCode?: unknown
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RegisterParentBody
    const result = await registerParentMobile({
      email: readString(body.email),
      displayName: readString(body.displayName),
      password: readString(body.password),
      confirmPassword: readString(body.confirmPassword),
      inviteCode: readString(body.inviteCode),
      userAgent: request.headers.get('user-agent'),
    })
    return jsonOk(result, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
