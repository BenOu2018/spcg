import type { ReactNode } from 'react'
import { signOutAction } from '@/app/auth/actions'
import { requireAdmin } from '@/lib/admin-auth'
import { AdminShell, type AdminNavItem } from './components/AdminChrome'

export const dynamic = 'force-dynamic'

type AdminLayoutProps = {
  children: ReactNode
}

const navItems: AdminNavItem[] = [
  { href: '/admin', label: 'Overview', hint: '资源与运营监控' },
  { href: '/admin/users', label: 'Users', hint: '账号、角色、归属' },
  { href: '/admin/launch-readiness', label: 'Launch', hint: '1-3级上线清单' },
  { href: '/admin/curriculum', label: 'Curriculum', hint: '关卡和课程主线' },
  { href: '/admin/levels', label: 'Levels', hint: '题目库与发布状态' },
  { href: '/admin/knowledge-points', label: 'Knowledge', hint: '知识点图谱' },
  { href: '/admin/problem-sets', label: 'Problem Sets', hint: '题单与教案' },
  { href: '/admin/submissions', label: 'Submissions', hint: '判题和源码检索' },
  { href: '/admin/system-bugs', label: 'Bugs', hint: '用户反馈' },
  { href: '/admin/imports', label: 'Imports', hint: '题库导入批次' },
  { href: '/admin/settings', label: 'Settings', hint: '系统配置' },
  { href: '/admin/audit-logs', label: 'Audit', hint: '管理操作记录' },
]

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const admin = await requireAdmin('support')

  return (
    <AdminShell
      navItems={navItems}
      roleLabel={admin.preview ? 'Preview Mode' : admin.role}
      signOut={
        admin.preview ? null : (
          <form action={signOutAction}>
            <button className="admin-logout" type="submit">
              Sign out
            </button>
          </form>
        )
      }
      userLabel={admin.username ?? admin.email ?? admin.userId}
    >
      {children}
    </AdminShell>
  )
}
