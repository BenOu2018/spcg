import type { UserRole } from '@spcg/shared/types'
import type { PoolClient } from 'pg'
import { query, queryOne } from '@/lib/db'

export type UserAccountSummary = {
  id: string
  username: string
  email: string | null
  displayName: string | null
  role: UserRole
  accountStatus: string
}

type UserRoleRow = {
  role: UserRole
}

type UserSummaryRow = {
  id: string
  username: string
  email: string | null
  display_name: string | null
  role: UserRole | null
  account_status: string | null
}

export async function getUserRole(userId: string): Promise<UserRole> {
  const row = await queryOne<UserRoleRow>('SELECT role FROM user_roles WHERE user_id = $1', [userId])
  return row?.role ?? 'student'
}

export async function upsertUserRole(input: {
  userId: string
  role: UserRole
  assignedBy?: string | null
  client?: PoolClient
}): Promise<void> {
  const sql = `
  INSERT INTO user_roles (user_id, role, assigned_by)
  VALUES ($1, $2, $3)
  ON CONFLICT (user_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    assigned_by = EXCLUDED.assigned_by
  `
  const values = [input.userId, input.role, input.assignedBy ?? null]
  if (input.client) {
    await input.client.query(sql, values)
    return
  }
  await query(sql, values)
}

export async function findUserByIdentifier(identifier: string): Promise<UserAccountSummary | null> {
  const normalized = identifier.trim().toLowerCase()
  if (!normalized) return null

  const row = await queryOne<UserSummaryRow>(
    `
    SELECT
      u.id,
      u.username,
      u.email,
      COALESCE(p.display_name, u.display_name, u.username) AS display_name,
      COALESCE(ur.role, 'student') AS role,
      COALESCE(uas.account_status, 'active') AS account_status
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN user_admin_states uas ON uas.user_id = u.id
    WHERE u.username = $1 OR u.email = $1 OR u.id::text = $1
    `,
    [normalized],
  )

  return row ? mapUserSummary(row) : null
}

function mapUserSummary(row: UserSummaryRow): UserAccountSummary {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    role: row.role ?? 'student',
    accountStatus: row.account_status ?? 'active',
  }
}
