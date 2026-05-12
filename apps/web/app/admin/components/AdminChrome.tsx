import Link from 'next/link'
import type { ReactNode } from 'react'

export type AdminNavItem = {
  href: string
  label: string
  hint?: string
}

export type AdminTabItem = {
  href: string
  label: string
  active?: boolean
  count?: number | string
}

export type AdminDrawerProps = {
  title: string
  description?: string
  closeHref: string
  children: ReactNode
  width?: 'md' | 'lg' | 'xl'
}

export type AdminStatCardProps = {
  label: string
  value: ReactNode
  detail?: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'danger'
}

export function AdminShell({
  children,
  navItems,
  userLabel,
  roleLabel,
  signOut,
}: {
  children: ReactNode
  navItems: AdminNavItem[]
  userLabel: string
  roleLabel: string
  signOut?: ReactNode
}) {
  return (
    <main className="admin-shell admin-shell-modern">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin">
          <span>SPCG</span>
          <strong>Admin</strong>
        </Link>
        <nav className="admin-nav" aria-label="Admin navigation">
          {navItems.map((item) => (
            <Link href={item.href} key={item.href}>
              <strong>{item.label}</strong>
              {item.hint ? <span>{item.hint}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="admin-account admin-user">
          <span>{roleLabel}</span>
          <strong>{userLabel}</strong>
          {signOut}
        </div>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="admin-eyebrow">Control center</span>
            <strong>深色管理后台</strong>
          </div>
          <div className="admin-topbar-actions">
            <Link className="admin-secondary-link" href="/map">
              Student App
            </Link>
            <Link className="admin-secondary-link" href="/teacher">
              Teacher
            </Link>
          </div>
        </header>
        <section className="admin-content">{children}</section>
      </section>
    </main>
  )
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  meta?: ReactNode
}) {
  return (
    <header className="admin-page-head admin-page-head-modern">
      <div>
        {eyebrow ? <span className="admin-eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p className="admin-page-description">{description}</p> : null}
      </div>
      <div className="admin-page-actions">
        {meta}
        {actions}
      </div>
    </header>
  )
}

export function AdminStatCard({ label, value, detail, tone = 'default' }: AdminStatCardProps) {
  return (
    <article className={`admin-metric admin-stat-card admin-stat-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  )
}

export function AdminPanel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className ? `admin-panel ${className}` : 'admin-panel'}>
      {title || description || actions ? (
        <div className="admin-panel-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p className="admin-muted">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function AdminFilterBar({ children }: { children: ReactNode }) {
  return <div className="admin-filter-bar">{children}</div>
}

export function AdminTabs({ items }: { items: AdminTabItem[] }) {
  return (
    <nav className="admin-tabs" aria-label="Admin sections">
      {items.map((item) => (
        <Link className={item.active ? 'active' : undefined} href={item.href} key={item.href}>
          <span>{item.label}</span>
          {item.count !== undefined ? <strong>{item.count}</strong> : null}
        </Link>
      ))}
    </nav>
  )
}

export function AdminDrawer({ title, description, closeHref, children, width = 'lg' }: AdminDrawerProps) {
  return (
    <div className="admin-drawer-layer" role="presentation">
      <Link aria-label="Close drawer" className="admin-drawer-scrim" href={closeHref} />
      <aside aria-label={title} className={`admin-drawer admin-drawer-${width}`}>
        <header className="admin-drawer-head">
          <div>
            <span className="admin-eyebrow">Workspace drawer</span>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <Link className="admin-small-button" href={closeHref}>
            Close
          </Link>
        </header>
        <div className="admin-drawer-body">{children}</div>
      </aside>
    </div>
  )
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return <p className="admin-empty admin-empty-modern">{children}</p>
}
