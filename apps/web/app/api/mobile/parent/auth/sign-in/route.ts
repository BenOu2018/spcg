import { jsonError, jsonOk } from '@/lib/services/api-response'
import { signInParentMobile } from '@/lib/services/parent-mobile-service'

type SignInParentBody = {
  email?: unknown
  password?: unknown
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SignInParentBody
    const result = await signInParentMobile({
      email: readString(body.email),
      password: readString(body.password),
      userAgent: request.headers.get('user-agent'),
    })
    return jsonOk(result)
  } catch (error) {
    return jsonError(error)
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
