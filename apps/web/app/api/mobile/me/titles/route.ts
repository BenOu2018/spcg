import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { requireTitleHistory } from '@/lib/services/wallet-service'

export async function GET() {
  try {
    const session = await auth()
    const titles = await requireTitleHistory(session?.user?.id)
    return jsonOk({ titles })
  } catch (error) {
    return jsonError(error)
  }
}
