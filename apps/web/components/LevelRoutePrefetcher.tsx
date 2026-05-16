'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { prewarmMonacoEditor } from '@/lib/monaco-prewarm'

type LevelRoutePrefetcherProps = {
  hrefs: string[]
}

export function LevelRoutePrefetcher({ hrefs }: LevelRoutePrefetcherProps) {
  const router = useRouter()

  useEffect(() => {
    const uniqueHrefs = Array.from(new Set(hrefs)).filter(Boolean)
    if (uniqueHrefs.length === 0) return undefined

    const prefetchTimer = window.setTimeout(() => {
      uniqueHrefs.forEach((href) => router.prefetch(href))
    }, 80)
    const editorTimer = window.setTimeout(() => {
      void prewarmMonacoEditor()
    }, 900)

    return () => {
      window.clearTimeout(prefetchTimer)
      window.clearTimeout(editorTimer)
    }
  }, [hrefs, router])

  return null
}
