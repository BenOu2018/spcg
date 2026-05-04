'use client'

import { useEffect, useRef, useState } from 'react'
import { Bug, Send, X } from 'lucide-react'
import { submitSystemBugAction } from '@/app/system-bugs/actions'

type BugReportWidgetProps = {
  enabled: boolean
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

export function BugReportWidget({ enabled }: BugReportWidgetProps) {
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
      setMessage('请先描述你看到的问题。')
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
      setMessage('已提交，感谢反馈。')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '提交失败，请稍后再试。')
    }
  }

  return (
    <div className="bug-report-widget" ref={widgetRef}>
      {open ? (
        <section className="bug-report-panel" aria-label="提交疑似 Bug">
          <div className="bug-report-head">
            <strong>提交 Bug 线索</strong>
            <button type="button" aria-label="关闭 Bug 提交" onClick={() => setOpen(false)}>
              <X size={15} strokeWidth={2.4} />
            </button>
          </div>
          <textarea
            value={description}
            maxLength={2000}
            placeholder="请描述你发现的问题，例如：点了 Run 后没有输出，或某个按钮消失。"
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
              {status === 'submitting' ? '提交中' : '提交'}
            </button>
          </div>
          {message ? <p className={`bug-report-message ${status}`}>{message}</p> : null}
        </section>
      ) : null}

      <button
        className="bug-report-toggle"
        type="button"
        aria-label="提交疑似 Bug"
        title="提交疑似 Bug"
        onClick={() => setOpen((value) => !value)}
      >
        <Bug size={15} strokeWidth={2.6} />
        Bug
      </button>
    </div>
  )
}
