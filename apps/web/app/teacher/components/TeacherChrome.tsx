import Link from 'next/link'
import type { ReactNode } from 'react'

export type TeacherNavItem = {
  href: string
  label: string
  hint?: string
}

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
  return (
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
          <div>
            <span>SPCG Teacher Console</span>
            <strong>学习管理后台</strong>
          </div>
          <div className="teacher-topbar-user">{userLabel}</div>
        </header>
        <div className="teacher-content">{children}</div>
      </section>
    </main>
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
  return (
    <header className="teacher-page-header">
      <div>
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="teacher-page-actions">{actions}</div> : null}
    </header>
  )
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
  children,
}: {
  title: string
  meta?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="teacher-panel">
      <div className="teacher-panel-head">
        <div>
          <h2>{title}</h2>
          {meta ? <span>{meta}</span> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function TeacherTabs({
  tabs,
}: {
  tabs: Array<{ href: string; label: string; active?: boolean; count?: number | string }>
}) {
  return (
    <nav className="teacher-tabs" aria-label="Teacher section tabs">
      {tabs.map((tab) => (
        <Link className={tab.active ? 'active' : undefined} href={tab.href} key={tab.href}>
          <span>{tab.label}</span>
          {tab.count !== undefined ? <strong>{tab.count}</strong> : null}
        </Link>
      ))}
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
