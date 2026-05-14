'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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
  replaceTabNavigation: boolean
  tabs: SettingsTabItem[]
}

export function SettingsTabs({ activeTab, label, replaceTabNavigation, tabs }: SettingsTabsProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [optimisticTab, setOptimisticTab] = useState(activeTab)

  useEffect(() => {
    setOptimisticTab(activeTab)
  }, [activeTab])

  useEffect(() => {
    tabs.forEach((tab) => router.prefetch(buildTabHref(pathname, searchParams, tab.value)))
  }, [pathname, router, searchParams, tabs])

  return (
    <nav className="settings-tabs" aria-label={label}>
      {tabs.map((tab) => {
        const href = buildTabHref(pathname, searchParams, tab.value)
        const active = tab.value === optimisticTab
        return (
          <Link
            aria-current={tab.value === activeTab ? 'page' : undefined}
            className={active ? 'active' : undefined}
            href={href}
            key={tab.value}
            prefetch
            replace={replaceTabNavigation}
            scroll={false}
            onClick={(event) => handleTabClick(event, tab.value, setOptimisticTab)}
            onMouseEnter={() => router.prefetch(href)}
          >
            <strong>{tab.label}</strong>
            <span>{tab.body}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function handleTabClick(event: MouseEvent<HTMLAnchorElement>, tab: string, setOptimisticTab: (tab: string) => void) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  setOptimisticTab(tab)
}

function buildTabHref(pathname: string, searchParams: { toString(): string }, tab: string) {
  const params = new URLSearchParams(searchParams.toString())
  params.set('tab', tab)
  params.delete('profile')
  params.delete('password')
  params.delete('phone')
  params.delete('phoneNumber')
  params.delete('devCode')
  params.delete('language')
  return `${pathname}?${params.toString()}`
}
