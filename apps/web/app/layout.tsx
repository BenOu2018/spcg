import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import 'katex/dist/katex.min.css'
import { auth } from '@/auth'
import { BehaviorTracker } from '@/components/BehaviorTracker'
import { BugReportWidget } from '@/components/BugReportWidget'
import { LoggedInUserBadge } from '@/components/LoggedInUserBadge'
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
  const locale = await getRequestUiLocale(session?.user?.id)
  const messages = getStudentUiMessages(locale)

  return (
    <html lang={locale}>
      <body>
        {children}
        {settingsModal}
        <BehaviorTracker userId={session?.user?.id ?? null} />
        <LoggedInUserBadge session={session} />
        <BugReportWidget enabled={bugReportSettings.enabled} messages={messages.bug} />
      </body>
    </html>
  )
}
