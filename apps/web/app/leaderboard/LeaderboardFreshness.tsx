'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const REFRESH_THROTTLE_MS = 3000

export function LeaderboardFreshness() {
  const router = useRouter()
  const lastRefreshAtRef = useRef(0)

  useEffect(() => {
    function refreshLeaderboard() {
      const now = Date.now()
      if (now - lastRefreshAtRef.current < REFRESH_THROTTLE_MS) return
      lastRefreshAtRef.current = now
      router.refresh()
    }

    refreshLeaderboard()

    function handlePageShow() {
      refreshLeaderboard()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') refreshLeaderboard()
    }

    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [router])

  return null
}
