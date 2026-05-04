'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { explainSubmissionErrorForAdmin } from '@/lib/services/submission-error-analysis-service'

export async function explainAdminSubmissionErrorAction(input: { submissionId: string }) {
  await requireAdmin('support')
  const result = await explainSubmissionErrorForAdmin({ submissionId: input.submissionId })

  if (result.ok) {
    revalidatePath('/admin/submissions')
    revalidatePath('/admin/users')
    revalidatePath('/admin/levels')
  }

  return result
}
