'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'

export type TeacherNavItem = {
  href: string
  label: string
  hint?: string
}

type TeacherTopbarCopy = {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}

const defaultTopbarCopy: TeacherTopbarCopy = {
  eyebrow: 'SPCG Teacher Console',
  title: '老师工作台',
}

const TeacherTopbarContext = createContext<Dispatch<SetStateAction<TeacherTopbarCopy>> | null>(null)

export function TeacherShell({
  children,
  navItems,
  userLabel,
  signOutForm,
}: {
  children: ReactNode
  navItems: TeacherNavItem[]
  userLabel: string
  signOutForm: ReactNode
}) {
  const [topbarCopy, setTopbarCopy] = useState<TeacherTopbarCopy>(defaultTopbarCopy)

  return (
    <TeacherTopbarContext.Provider value={setTopbarCopy}>
      <main className="teacher-shell">
        <aside className="teacher-sidebar">
          <Link className="teacher-brand" href="/teacher">
            <span>SPCG</span>
            <strong>Teacher</strong>
          </Link>
          <nav className="teacher-nav" aria-label="Teacher navigation">
            {navItems.map((item) => (
              <Link href={item.href} key={item.href}>
                <strong>{item.label}</strong>
                {item.hint ? <span>{item.hint}</span> : null}
              </Link>
            ))}
          </nav>
          <div className="teacher-account">
            <span>Signed in</span>
            <strong>{userLabel}</strong>
            {signOutForm}
          </div>
        </aside>
        <section className="teacher-main">
          <header className="teacher-topbar">
            <div className="teacher-topbar-copy">
              {topbarCopy.eyebrow ? <span>{topbarCopy.eyebrow}</span> : null}
              <strong>{topbarCopy.title}</strong>
              {topbarCopy.description ? <p>{topbarCopy.description}</p> : null}
            </div>
            <div className="teacher-topbar-right">
              {topbarCopy.actions ? <div className="teacher-topbar-actions">{topbarCopy.actions}</div> : null}
              <div className="teacher-topbar-user">{userLabel}</div>
            </div>
          </header>
          <div className="teacher-content">{children}</div>
        </section>
      </main>
    </TeacherTopbarContext.Provider>
  )
}

export function TeacherPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  const topbar = useContext(TeacherTopbarContext)

  useEffect(() => {
    topbar?.({ eyebrow, title, description, actions })
  }, [actions, description, eyebrow, title, topbar])

  return null
}

export function TeacherStatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <article className="teacher-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  )
}

export function TeacherPanel({
  title,
  meta,
  action,
  className,
  hideHeader = false,
  children,
}: {
  title: string
  meta?: string
  action?: ReactNode
  className?: string
  hideHeader?: boolean
  children: ReactNode
}) {
  return (
    <section className={className ? `teacher-panel ${className}` : 'teacher-panel'}>
      {hideHeader ? null : (
        <div className="teacher-panel-head">
          <div>
            <h2>{title}</h2>
            {meta ? <span>{meta}</span> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function TeacherTabs({
  tabs,
}: {
  tabs: Array<{ href: string; label: string; active?: boolean; count?: number | string }>
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const routeKey = `${pathname}?${searchParams.toString()}`

  useEffect(() => {
    setPendingHref(null)
  }, [routeKey])

  return (
    <nav className="teacher-tabs" aria-label="Teacher section tabs">
      {tabs.map((tab) => {
        const isPending = pendingHref === tab.href
        const className = [tab.active ? 'active' : null, isPending ? 'pending' : null].filter(Boolean).join(' ') || undefined
        return (
          <Link
            aria-busy={isPending || undefined}
            className={className}
            href={tab.href}
            key={tab.href}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || tab.active) return
              setPendingHref(tab.href)
            }}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined ? <strong>{tab.count}</strong> : null}
            {isPending ? <em className="teacher-tab-spinner" aria-hidden="true" /> : null}
          </Link>
        )
      })}
    </nav>
  )
}

export function TeacherDrawer({
  title,
  description,
  closeHref,
  children,
}: {
  title: string
  description?: string
  closeHref: string
  children: ReactNode
}) {
  return (
    <aside className="teacher-drawer-backdrop" aria-label={title}>
      <Link className="teacher-drawer-scrim" href={closeHref} aria-label="Close drawer" />
      <section className="teacher-drawer">
        <header>
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <Link href={closeHref}>关闭</Link>
        </header>
        {children}
      </section>
    </aside>
  )
}

export function TeacherEmpty({ children }: { children: ReactNode }) {
  return <p className="teacher-empty">{children}</p>
}

export function TeacherStatusBadge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return <em className={`teacher-badge teacher-badge-${tone}`}>{children}</em>
}
