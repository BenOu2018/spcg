import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isDbConfigured, queryOne } from '@/lib/db'

export type AdminRole = 'owner' | 'admin' | 'editor' | 'reviewer' | 'support'

export type AdminContext = {
  userId: string
  role: AdminRole
  username: string | null
  email: string | null
  preview: boolean
  accessToken: null
}

const roleRank: Record<AdminRole, number> = {
  support: 10,
  reviewer: 20,
  editor: 30,
  admin: 40,
  owner: 50,
}

type AdminRoleRow = {
  role: AdminRole
  username: string | null
  email: string | null
}

export async function requireAdmin(minRole: AdminRole = 'support'): Promise<AdminContext> {
  const admin = await getAdminContext(minRole)
  if (admin) return admin

  if (!isDbConfigured()) {
    redirect('/auth/sign-in?next=/admin')
  }

  const session = await auth()
  if (!session?.user?.id) {
    redirect('/auth/sign-in?next=/admin')
  }

  redirect('/map')
}

export async function getAdminContext(minRole: AdminRole = 'support'): Promise<AdminContext | null> {
  if (process.env.SPCG_ADMIN_PREVIEW === 'true') {
    return {
      userId: 'admin-preview',
      role: 'owner',
      username: 'admin-preview',
      email: process.env.SPCG_ADMIN_PREVIEW_EMAIL ?? 'admin-preview@spcg.local',
      preview: true,
      accessToken: null,
    }
  }

  if (!isDbConfigured()) {
    return null
  }

  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return null
  }

  const role = await queryOne<AdminRoleRow>(
    `
    SELECT ar.role, u.username, u.email
    FROM admin_roles ar
    JOIN users u ON u.id = ar.user_id
    LEFT JOIN user_admin_states uas ON uas.user_id = u.id
    WHERE ar.user_id = $1 AND ar.active = TRUE
      AND COALESCE(uas.account_status, 'active') = 'active'
    `,
    [userId],
  )

  if (!role || roleRank[role.role] < roleRank[minRole]) {
    return null
  }

  return {
    userId,
    role: role.role,
    username: role.username,
    email: role.email,
    preview: false,
    accessToken: null,
  }
}
