import { jsonError, jsonOk } from '@/lib/services/api-response'
import { readBearerToken, signOutParentMobile } from '@/lib/services/parent-mobile-service'

export async function POST(request: Request) {
  try {
    await signOutParentMobile(readBearerToken(request.headers.get('authorization')))
    return jsonOk({ signedOut: true })
  } catch (error) {
    return jsonError(error)
  }
}
