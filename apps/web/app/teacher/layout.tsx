import Link from 'next/link'
import type { ReactNode } from 'react'
import { signOutAction } from '@/app/auth/actions'
import { requireTeacherSession } from '@/lib/teacher-auth'

export const dynamic = 'force-dynamic'

type TeacherLayoutProps = {
  children: ReactNode
}

const navItems = [
  { href: '/teacher', label: 'Overview' },
  { href: '/teacher/students', label: 'Students' },
]

export default async function TeacherLayout({ children }: TeacherLayoutProps) {
  const session = await requireTeacherSession('/teacher')

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/teacher">
          SPCG Teacher
        </Link>
        <nav>
          {navItems.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="admin-user">
          <span>Teacher</span>
          <strong>{session.user.email ?? session.user.id}</strong>
          <form action={signOutAction}>
            <button className="admin-logout" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <section className="admin-content">{children}</section>
    </main>
  )
}
