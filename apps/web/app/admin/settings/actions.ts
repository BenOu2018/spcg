'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { updateBugReportAdminSettings, updateMiniMaxCodeHelpAdminSettings } from '@/lib/services/system-settings-service'

export async function updateMiniMaxCodeHelpSettingsAction(formData: FormData) {
  const context = await requireAdmin('admin')
  if (context.preview) {
    revalidatePath('/admin/settings')
    return
  }

  await updateMiniMaxCodeHelpAdminSettings(
    {
      enabled: String(formData.get('enabled') ?? '') === 'true',
      apiMode: String(formData.get('apiMode') ?? ''),
      baseUrl: String(formData.get('baseUrl') ?? ''),
      model: String(formData.get('model') ?? ''),
      timeoutMs: Number(formData.get('timeoutMs') ?? 120_000),
      apiKey: String(formData.get('apiKey') ?? ''),
      clearApiKey: String(formData.get('clearApiKey') ?? '') === 'true',
    },
    {
      userId: context.userId,
      role: context.role,
    },
  )

  revalidatePath('/admin/settings')
  revalidatePath('/admin/audit-logs')
}

export async function updateBugReportSettingsAction(formData: FormData) {
  const context = await requireAdmin('admin')
  if (context.preview) {
    revalidatePath('/admin/settings')
    return
  }

  await updateBugReportAdminSettings(
    {
      enabled: String(formData.get('enabled') ?? '') === 'true',
    },
    {
      userId: context.userId,
      role: context.role,
    },
  )

  revalidatePath('/', 'layout')
  revalidatePath('/admin/settings')
  revalidatePath('/admin/audit-logs')
}
