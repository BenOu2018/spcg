import type { ReactNode } from 'react'
import { signOutAction } from '@/app/auth/actions'
import { TeacherShell } from './components/TeacherChrome'

export const dynamic = 'force-dynamic'

type TeacherLayoutProps = {
  children: ReactNode
}

const navItems = [
  { href: '/teacher', label: 'Overview', hint: 'Dashboard' },
  { href: '/teacher/students', label: 'Students', hint: 'Roster' },
  { href: '/teacher/submissions', label: 'Submissions', hint: 'Code review' },
  { href: '/teacher/students?access=owner', label: 'Reports', hint: 'Growth' },
  { href: '/teacher/settings', label: 'Settings', hint: 'Teacher account' },
]

export default async function TeacherLayout({ children }: TeacherLayoutProps) {
  return (
    <TeacherShell
      navItems={navItems}
      userLabel="Teacher Console"
      signOutForm={
        <form action={signOutAction}>
          <button className="teacher-logout" type="submit">
            Sign out
          </button>
        </form>
      }
    >
      {children}
    </TeacherShell>
  )
}
