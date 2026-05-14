'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { SettingsTabs, type SettingsTabItem } from '@/components/SettingsTabs'

type SettingsTabFrameProps = {
  initialTab: string
  label: string
  replaceTabNavigation: boolean
  tabs: SettingsTabItem[]
  children: ReactNode
}

export function SettingsTabFrame({ children, initialTab, label, replaceTabNavigation, tabs }: SettingsTabFrameProps) {
  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  return (
    <div className="settings-tab-frame" data-active-tab={activeTab}>
      <SettingsTabs
        activeTab={activeTab}
        label={label}
        navigationMode={replaceTabNavigation ? 'state' : 'link'}
        onTabChange={setActiveTab}
        tabs={tabs}
      />
      <section
        className={activeTab === 'security' ? 'settings-tab-content settings-tab-content-security' : 'settings-tab-content'}
      >
        {children}
      </section>
    </div>
  )
}
