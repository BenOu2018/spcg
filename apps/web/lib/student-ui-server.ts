import type { UiLocale } from '@spcg/shared/types'
import { cookies } from 'next/headers'
import { getAccountSettings } from '@/lib/services/account-settings-service'
import { DEFAULT_UI_LOCALE, UI_LOCALE_COOKIE, normalizeUiLocale } from '@/lib/student-ui'

export async function getRequestUiLocale(userId?: string | null): Promise<UiLocale> {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(UI_LOCALE_COOKIE)?.value
  if (cookieLocale) return normalizeUiLocale(cookieLocale)

  if (userId) {
    const account = await getAccountSettings(userId).catch(() => null)
    if (account?.uiLocale) return normalizeUiLocale(account.uiLocale)
  }

  return DEFAULT_UI_LOCALE
}
