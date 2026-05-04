'use client'

import { type ReactNode, useState } from 'react'

type AdminModalProps = {
  title: string
  triggerLabel: string
  children: ReactNode
  disabled?: boolean
  danger?: boolean
}

export function AdminModal({ title, triggerLabel, children, disabled = false, danger = false }: AdminModalProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        className={danger ? 'admin-small-button admin-danger-button' : 'admin-small-button'}
        disabled={disabled}
        onClick={() => setOpen(true)}
        type="button"
      >
        {triggerLabel}
      </button>
      {open ? (
        <div className="admin-modal-backdrop" role="presentation">
          <section
            aria-modal="true"
            className="admin-modal"
            onSubmitCapture={() => {
              window.setTimeout(() => setOpen(false), 0)
            }}
            role="dialog"
          >
            <header className="admin-modal-head">
              <h2>{title}</h2>
              <button aria-label="关闭" className="admin-small-button" onClick={() => setOpen(false)} type="button">
                Close
              </button>
            </header>
            {children}
          </section>
        </div>
      ) : null}
    </>
  )
}
