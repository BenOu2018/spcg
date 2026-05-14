import { getUserRole } from '@/lib/repositories/user-repository'
import { getUserEntitlement } from '@/lib/services/entitlement-service'

export async function getCanShowPricingMenu(userId?: string | null): Promise<boolean> {
  if (!userId) return false

  const role = await getUserRole(userId)
  if (role !== 'student') return false

  const entitlement = await getUserEntitlement(userId)
  return entitlement.studentEnrollmentType === 'online'
}
