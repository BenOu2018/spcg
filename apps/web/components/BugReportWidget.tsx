'use client'

import { useEffect, useRef, useState } from 'react'
import { Bug, Send, X } from 'lucide-react'
import { submitSystemBugAction } from '@/app/system-bugs/actions'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'

type BugReportWidgetProps = {
  enabled: boolean
  messages?: StudentUiMessages['bug']
}

type IdeBugContext = {
  levelId: string
  levelTitle: string
  language: string
  resolvedLanguage: string
  code: string
}

declare global {
  interface Window {
    __spcgCurrentIdeContext?: IdeBugContext
  }
}

const fallbackMessages = getStudentUiMessages('zh-CN').bug

export function BugReportWidget({ enabled, messages = fallbackMessages }: BugReportWidgetProps) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const widgetRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node) || widgetRef.current?.contains(target)) return

      setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  if (!enabled) return null

  async function submitBugReport() {
    const trimmed = description.trim()
    if (!trimmed) {
      setStatus('error')
      setMessage(messages.failed)
      return
    }

    setStatus('submitting')
    setMessage('')

    try {
      const result = await submitSystemBugAction({
        url: window.location.href,
        pathname: window.location.pathname,
        description: trimmed,
        ideContext: window.__spcgCurrentIdeContext ?? null,
        userAgent: window.navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        metadata: {
          language: window.navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screen: {
            width: window.screen.width,
            height: window.screen.height,
          },
        },
      })

      if (!result.ok) {
        setStatus('error')
        setMessage(result.error)
        return
      }

      setDescription('')
      setStatus('success')
      setMessage(messages.submitted)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : messages.failed)
    }
  }

  return (
    <div className="bug-report-widget" ref={widgetRef}>
      {open ? (
        <section className="bug-report-panel" aria-label={messages.title}>
          <div className="bug-report-head">
            <strong>{messages.title}</strong>
            <button type="button" aria-label={messages.close} onClick={() => setOpen(false)}>
              <X size={15} strokeWidth={2.4} />
            </button>
          </div>
          <textarea
            value={description}
            maxLength={2000}
            placeholder={messages.placeholder}
            onChange={(event) => {
              setDescription(event.target.value)
              if (status !== 'submitting') {
                setStatus('idle')
                setMessage('')
              }
            }}
          />
          <div className="bug-report-foot">
            <span>{description.trim().length}/2000</span>
            <button type="button" disabled={status === 'submitting'} onClick={submitBugReport}>
              <Send size={14} strokeWidth={2.4} />
              {status === 'submitting' ? messages.submitting : messages.submit}
            </button>
          </div>
          {message ? <p className={`bug-report-message ${status}`}>{message}</p> : null}
        </section>
      ) : null}

      <button
        className="bug-report-toggle"
        type="button"
        aria-label={messages.title}
        title={messages.title}
        onClick={() => setOpen((value) => !value)}
      >
        <Bug size={15} strokeWidth={2.6} />
        Bug
      </button>
    </div>
  )
}
