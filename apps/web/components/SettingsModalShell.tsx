'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

type SettingsModalShellProps = {
  children: ReactNode
}

export function SettingsModalShell({ children }: SettingsModalShellProps) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') router.back()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [router])

  return (
    <div
      className="settings-modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) router.back()
      }}
    >
      <div
        aria-label="用户设置"
        aria-modal="true"
        className="settings-modal-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <button className="settings-modal-close" type="button" aria-label="关闭设置" onClick={() => router.back()}>
          <X size={18} strokeWidth={2.4} />
        </button>
        <div className="settings-modal-body">{children}</div>
      </div>
    </div>
  )
}
