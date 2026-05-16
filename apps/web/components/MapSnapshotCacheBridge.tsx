'use client'

import { useEffect } from 'react'
import { type MapSnapshot, writeMapSnapshot } from '@/lib/map-snapshot-cache'

type MapSnapshotCacheBridgeProps = {
  snapshot: Omit<MapSnapshot, 'version' | 'createdAt'>
}

export function MapSnapshotCacheBridge({ snapshot }: MapSnapshotCacheBridgeProps) {
  useEffect(() => {
    writeMapSnapshot(snapshot)
  }, [snapshot])

  return null
}
