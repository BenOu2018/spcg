import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { requireUserInventory } from '@/lib/services/inventory-service'

export async function GET() {
  try {
    const session = await auth()
    const inventory = await requireUserInventory(session?.user?.id)
    return jsonOk({ inventory })
  } catch (error) {
    return jsonError(error)
  }
}
