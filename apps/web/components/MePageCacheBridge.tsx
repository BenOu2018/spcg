'use client'

import { useEffect } from 'react'
import type { MePagePayload } from '@/lib/me-page-payload'
import { writeMePagePayload } from '@/lib/me-page-payload-cache'

type MePageCacheBridgeProps = {
  payload: MePagePayload
}

export function MePageCacheBridge({ payload }: MePageCacheBridgeProps) {
  useEffect(() => {
    writeMePagePayload(payload)
  }, [payload])

  return null
}
