'use client'

import type { ButtonHTMLAttributes, FormEvent, ReactNode } from 'react'
import { createContext, useContext, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildSettingsActionHref, type SettingsActionResult } from '@/lib/settings-url'

type SettingsActionFormProps = {
  action: (formData: FormData) => Promise<SettingsActionResult>
  fallbackAction: (formData: FormData) => Promise<void> | void
  children: ReactNode
  className?: string
}

type SettingsActionMessageProps = {
  code?: string
  fallbackMessage: string
  messages: Record<string, string>
  statusKey: NonNullable<SettingsActionResult['statusKey']>
  successCodes?: string[]
  visibleCodes?: string[]
}

type SettingsActionSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel: string
}

type SettingsActionContextValue = {
  lastResult: SettingsActionResult | null
  pending: boolean
}

const SettingsActionResultContext = createContext<SettingsActionContextValue>({ lastResult: null, pending: false })
export const SETTINGS_ACTION_RESULT_EVENT = 'settings-action-result'

export function SettingsActionForm({ action, fallbackAction, children, className }: SettingsActionFormProps) {
  const router = useRouter()
  const [lastResult, setLastResult] = useState<SettingsActionResult | null>(null)
  const [pending, setPending] = useState(false)

  async function submitWithoutNavigation(event: FormEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault()
      return
    }

    event.preventDefault()
    setLastResult(null)
    setPending(true)

    try {
      const result = await action(new FormData(event.currentTarget))
      setLastResult(result)
      window.dispatchEvent(new CustomEvent<SettingsActionResult>(SETTINGS_ACTION_RESULT_EVENT, { detail: result }))
      router.replace(buildSettingsActionHref(window.location.search, result), { scroll: false })
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <SettingsActionResultContext.Provider value={{ lastResult, pending }}>
      <form className={className} action={fallbackAction} aria-busy={pending} onSubmit={submitWithoutNavigation}>
        {children}
      </form>
    </SettingsActionResultContext.Provider>
  )
}

export function SettingsActionMessage({
  code,
  fallbackMessage,
  messages,
  statusKey,
  successCodes = ['saved'],
  visibleCodes,
}: SettingsActionMessageProps) {
  const { lastResult } = useContext(SettingsActionResultContext)
  const latestCode = lastResult?.statusKey === statusKey ? lastResult.statusCode : undefined
  const displayCode = latestCode ?? code

  if (!displayCode) return null
  if (visibleCodes && !visibleCodes.includes(displayCode)) return null

  const isSuccess = successCodes.includes(displayCode)
  return (
    <p className={isSuccess ? 'settings-message' : 'settings-error'} aria-live="polite">
      {messages[displayCode] ?? fallbackMessage}
    </p>
  )
}

export function SettingsActionSubmitButton({
  children,
  disabled,
  pendingLabel,
  type = 'submit',
  ...buttonProps
}: SettingsActionSubmitButtonProps) {
  const { pending } = useContext(SettingsActionResultContext)

  return (
    <button {...buttonProps} disabled={disabled || pending} type={type}>
      {pending ? pendingLabel : children}
    </button>
  )
}
