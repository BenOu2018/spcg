import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import 'katex/dist/katex.min.css'
import { BugReportWidget } from '@/components/BugReportWidget'
import { getBugReportRuntimeSettings } from '@/lib/services/system-settings-service'
import './globals.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'SPCG',
  description: 'Small Programmer Coding Game',
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const bugReportSettings = await getBugReportRuntimeSettings()

  return (
    <html lang="zh-CN">
      <body>
        {children}
        <BugReportWidget enabled={bugReportSettings.enabled} />
      </body>
    </html>
  )
}
