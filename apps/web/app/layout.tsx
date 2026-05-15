import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import 'katex/dist/katex.min.css'
import { auth } from '@/auth'
import { BehaviorTracker } from '@/components/BehaviorTracker'
import { BugReportWidget } from '@/components/BugReportWidget'
import { LoggedInUserBadge } from '@/components/LoggedInUserBadge'
import { NavigationFeedback } from '@/components/NavigationFeedback'
import { getCanShowPricingMenu } from '@/lib/services/account-menu-service'
import { getBugReportRuntimeSettings } from '@/lib/services/system-settings-service'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'
import './globals.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'SPCG',
  description: 'Small Programmer Coding Game',
}

export default async function RootLayout({
  children,
  settingsModal,
}: Readonly<{ children: ReactNode; settingsModal: ReactNode }>) {
  const [bugReportSettings, session] = await Promise.all([getBugReportRuntimeSettings(), auth()])
  const [locale, canShowPricingMenu] = await Promise.all([
    getRequestUiLocale(session?.user?.id),
    getCanShowPricingMenu(session?.user?.id),
  ])
  const messages = getStudentUiMessages(locale)

  return (
    <html lang={locale}>
      <body>
        {children}
        {settingsModal}
        <NavigationFeedback />
        <BehaviorTracker userId={session?.user?.id ?? null} />
        <LoggedInUserBadge session={session} canShowPricingMenu={canShowPricingMenu} />
        <BugReportWidget enabled={bugReportSettings.enabled} messages={messages.bug} />
      </body>
    </html>
  )
}
