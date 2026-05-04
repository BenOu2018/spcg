'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { updateAdminSystemBug } from '@/lib/services/system-bug-service'

export async function updateSystemBugAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')
  const adminNote = String(formData.get('adminNote') ?? '').trim() || null
  const context = await requireAdmin('support')

  if (context.preview) {
    revalidateSystemBugPaths(id)
    return
  }

  await updateAdminSystemBug({
    id,
    status,
    adminNote,
    admin: {
      userId: context.userId,
      role: context.role,
    },
  })

  revalidateSystemBugPaths(id)
}

function revalidateSystemBugPaths(id: string) {
  revalidatePath('/admin')
  revalidatePath('/admin/system-bugs')
  if (id) revalidatePath(`/admin/system-bugs/${id}`)
  revalidatePath('/admin/audit-logs')
}
