'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { MouseEvent } from 'react'
import { useEffect, useState } from 'react'

export type SettingsTabItem = {
  value: string
  label: string
  body: string
}

type SettingsTabsProps = {
  activeTab: string
  label: string
  navigationMode?: 'link' | 'state'
  onTabChange?: (tab: string) => void
  tabs: SettingsTabItem[]
}

export function SettingsTabs({ activeTab, label, navigationMode = 'link', onTabChange, tabs }: SettingsTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [optimisticTab, setOptimisticTab] = useState(activeTab)
  const shouldNavigate = navigationMode === 'link'

  useEffect(() => {
    setOptimisticTab(activeTab)
  }, [activeTab])

  useEffect(() => {
    if (!shouldNavigate) return
    tabs.forEach((tab) => router.prefetch(buildSettingsTabHref(searchParams, tab.value)))
  }, [router, searchParams, shouldNavigate, tabs])

  return (
    <nav className="settings-tabs" aria-label={label}>
      {tabs.map((tab) => {
        const href = buildSettingsTabHref(searchParams, tab.value)
        const active = tab.value === optimisticTab
        return (
          <Link
            aria-current={tab.value === activeTab ? 'page' : undefined}
            className={active ? 'active' : undefined}
            href={href}
            key={tab.value}
            prefetch
            scroll={false}
            onClick={(event) => {
              if (!shouldHandleTabClick(event)) return
              event.preventDefault()
              setOptimisticTab(tab.value)
              onTabChange?.(tab.value)
              if (!shouldNavigate) {
                window.history.replaceState(window.history.state, '', href)
                return
              }
              router.push(href, { scroll: false })
            }}
            onMouseEnter={() => {
              if (shouldNavigate) router.prefetch(href)
            }}
          >
            <strong>{tab.label}</strong>
            <span>{tab.body}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function shouldHandleTabClick(event: MouseEvent<HTMLAnchorElement>) {
  return !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0
}

function buildSettingsTabHref(searchParams: { toString(): string }, tab: string) {
  const params = new URLSearchParams(searchParams.toString())
  params.set('tab', tab)
  params.delete('profile')
  params.delete('password')
  params.delete('phone')
  params.delete('phoneNumber')
  params.delete('devCode')
  params.delete('language')
  return `/settings?${params.toString()}`
}
