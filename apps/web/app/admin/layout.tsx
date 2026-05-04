import Link from 'next/link'
import type { ReactNode } from 'react'
import { signOutAction } from '@/app/auth/actions'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

type AdminLayoutProps = {
  children: ReactNode
}

const navItems = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/curriculum', label: 'Curriculum' },
  { href: '/admin/levels', label: 'Levels' },
  { href: '/admin/problem-sets', label: 'Problem Sets (Legacy)' },
  { href: '/admin/submissions', label: 'Submissions' },
  { href: '/admin/system-bugs', label: 'System Bugs' },
  { href: '/admin/imports', label: 'Imports' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/audit-logs', label: 'Audit Logs' },
]

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const admin = await requireAdmin('support')

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin">
          SPCG Admin
        </Link>
        <nav>
          {navItems.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="admin-user">
          <span>{admin.preview ? 'Preview Mode' : admin.role}</span>
          <strong>{admin.email ?? admin.userId}</strong>
          {admin.preview ? null : (
            <form action={signOutAction}>
              <button className="admin-logout" type="submit">
                Sign out
              </button>
            </form>
          )}
        </div>
      </aside>
      <section className="admin-content">{children}</section>
    </main>
  )
}
