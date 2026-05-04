import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { requireRewardHistory } from '@/lib/services/wallet-service'

export async function GET() {
  try {
    const session = await auth()
    const rewards = await requireRewardHistory(session?.user?.id)
    return jsonOk({ rewards })
  } catch (error) {
    return jsonError(error)
  }
}
