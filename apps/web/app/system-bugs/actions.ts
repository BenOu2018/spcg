'use server'

import { auth } from '@/auth'
import { submitSystemBugReport, type SystemBugIdeContext } from '@/lib/services/system-bug-service'

export async function submitSystemBugAction(input: {
  url: string
  pathname: string
  description: string
  ideContext?: SystemBugIdeContext | null
  userAgent?: string | null
  viewport?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}) {
  const session = await auth()

  return submitSystemBugReport({
    userId: session?.user?.id,
    url: input.url,
    pathname: input.pathname,
    description: input.description,
    ideContext: input.ideContext,
    userAgent: input.userAgent,
    viewport: input.viewport,
    metadata: input.metadata,
  })
}
