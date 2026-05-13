'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { generateBehaviorAnalysisForAdmin } from '@/lib/services/behavior-analytics-service'
import { toServiceError } from '@/lib/services/errors'

export async function generateAdminBehaviorAnalysisAction(formData: FormData) {
  const admin = await requireAdmin('support')
  const targetUserId = String(formData.get('targetUserId') ?? formData.get('studentUserId') ?? '').trim()
  const userRole = normalizeBehaviorUserRole(String(formData.get('userRole') ?? '').trim())
  const periodStart = String(formData.get('periodStart') ?? '').trim()
  const periodEnd = String(formData.get('periodEnd') ?? '').trim()
  const periodDaysValue = Number(formData.get('periodDays') ?? 7)
  const periodDays = Number.isInteger(periodDaysValue) ? periodDaysValue : 7
  if (!targetUserId) throw new Error('User id is required')

  let result: Awaited<ReturnType<typeof generateBehaviorAnalysisForAdmin>>
  try {
    result = await generateBehaviorAnalysisForAdmin({
      adminUserId: admin.userId,
      studentUserId: targetUserId,
      periodStart: periodStart || null,
      periodEnd: periodEnd || null,
      periodDays,
    })
  } catch (error) {
    const serviceError = toServiceError(error)
    redirect(
      `/admin/behavior-analyses?userId=${encodeURIComponent(targetUserId)}${userRole ? `&userRole=${userRole}` : ''}&behaviorError=${encodeURIComponent(serviceError.message)}`,
    )
  }

  revalidatePath('/admin/behavior-analyses')
  redirect(
    `/admin/behavior-analyses?userId=${encodeURIComponent(targetUserId)}${userRole ? `&userRole=${userRole}` : ''}&behaviorReportId=${encodeURIComponent(result.id)}&behaviorMessage=${encodeURIComponent(
      '行为分析已生成。',
    )}`,
  )
}

function normalizeBehaviorUserRole(value: string): 'student' | 'teacher' | null {
  return value === 'student' || value === 'teacher' ? value : null
}
