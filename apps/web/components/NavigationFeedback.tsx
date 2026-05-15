'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const NAVIGATION_FEEDBACK_TIMEOUT_MS = 10_000

export function NavigationFeedback() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
  const [active, setActive] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  const pendingAnchorRef = useRef<HTMLAnchorElement | null>(null)

  useEffect(() => {
    stopFeedback()
  }, [routeKey])

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) return

      const anchor = target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (!shouldShowNavigationFeedback(anchor)) return

      startFeedback(anchor)
    }

    document.addEventListener('click', handleClick, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      clearPendingAnchor()
    }
  }, [])

  function startFeedback(anchor: HTMLAnchorElement) {
    clearPendingAnchor()
    pendingAnchorRef.current = anchor
    anchor.dataset.navigationPending = 'true'
    anchor.setAttribute('aria-busy', 'true')
    setActive(true)

    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(stopFeedback, NAVIGATION_FEEDBACK_TIMEOUT_MS)
  }

  function stopFeedback() {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    clearPendingAnchor()
    setActive(false)
  }

  function clearPendingAnchor() {
    const anchor = pendingAnchorRef.current
    if (!anchor) return
    delete anchor.dataset.navigationPending
    anchor.removeAttribute('aria-busy')
    pendingAnchorRef.current = null
  }

  return (
    <div className={`navigation-feedback ${active ? 'active' : ''}`} aria-hidden="true">
      <span />
    </div>
  )
}

function shouldShowNavigationFeedback(anchor: HTMLAnchorElement) {
  if (anchor.hasAttribute('download')) return false
  if (anchor.target && anchor.target !== '_self') return false
  if (anchor.dataset.navigationFeedback === 'false') return false

  const href = anchor.getAttribute('href')
  if (!href || href.startsWith('#')) return false

  const url = new URL(anchor.href, window.location.href)
  if (url.origin !== window.location.origin) return false

  const current = new URL(window.location.href)
  const samePathAndSearch = url.pathname === current.pathname && url.search === current.search
  if (samePathAndSearch && url.hash) return false
  if (url.href === current.href) return false

  return true
}
