'use client'

import { useEffect } from 'react'
import { writeLevelPagePayload } from '@/lib/level-page-payload-cache'
import type { LevelPagePayload } from '@/lib/level-page-payload'

type LevelPageCacheBridgeProps = {
  payload: LevelPagePayload
}

export function LevelPageCacheBridge({ payload }: LevelPageCacheBridgeProps) {
  useEffect(() => {
    writeLevelPagePayload(payload)
  }, [payload])

  return null
}
