import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { requireWalletSummary } from '@/lib/services/wallet-service'

export async function GET() {
  try {
    const session = await auth()
    const wallet = await requireWalletSummary(session?.user?.id)
    return jsonOk({ wallet })
  } catch (error) {
    return jsonError(error)
  }
}
