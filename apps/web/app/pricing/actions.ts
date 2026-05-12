'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { createUpgradeRequest, isStudentUserType } from '@/lib/services/entitlement-service'

export async function requestUpgradeAction(formData: FormData) {
  const session = await auth()
  const targetPlan = String(formData.get('targetPlan') ?? '').trim()
  const message = String(formData.get('message') ?? '').trim()
  if (!isStudentUserType(targetPlan) || targetPlan === 'experience') {
    throw new Error('升级方案不正确。')
  }

  await createUpgradeRequest({
    userId: session?.user?.id,
    targetPlan,
    message: message || null,
  })

  revalidatePath('/pricing')
}
