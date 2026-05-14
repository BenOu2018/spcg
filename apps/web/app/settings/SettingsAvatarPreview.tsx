'use client'

import { useEffect, useState } from 'react'
import { SETTINGS_ACTION_RESULT_EVENT } from '@/app/settings/SettingsActionForm'
import type { SettingsActionResult } from '@/lib/settings-url'

type SettingsAvatarPreviewProps = {
  avatarUrl: string
  displayName: string
}

export function SettingsAvatarPreview({ avatarUrl, displayName }: SettingsAvatarPreviewProps) {
  const currentAvatarUrl = useSettingsAvatarUrl(avatarUrl)

  return (
    <div className="settings-avatar-preview" aria-label="当前头像">
      {currentAvatarUrl ? <img src={currentAvatarUrl} alt="" /> : <span>{displayName.slice(0, 1).toUpperCase()}</span>}
    </div>
  )
}

export function SettingsCurrentAvatarInput({ avatarUrl }: { avatarUrl: string }) {
  const currentAvatarUrl = useSettingsAvatarUrl(avatarUrl)

  return <input name="currentAvatarUrl" type="hidden" value={currentAvatarUrl} readOnly />
}

function useSettingsAvatarUrl(avatarUrl: string) {
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(avatarUrl)

  useEffect(() => {
    setCurrentAvatarUrl(avatarUrl)
  }, [avatarUrl])

  useEffect(() => {
    function handleSettingsActionResult(event: Event) {
      const result = (event as CustomEvent<SettingsActionResult>).detail
      const nextAvatarUrl = result.clientState?.avatarUrl
      if (result.statusKey !== 'profile' || result.statusCode !== 'saved' || nextAvatarUrl === undefined) return
      setCurrentAvatarUrl(nextAvatarUrl ?? '')
    }

    window.addEventListener(SETTINGS_ACTION_RESULT_EVENT, handleSettingsActionResult)
    return () => window.removeEventListener(SETTINGS_ACTION_RESULT_EVENT, handleSettingsActionResult)
  }, [])

  return currentAvatarUrl
}
