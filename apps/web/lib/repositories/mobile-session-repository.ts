import type { UserRole } from '@spcg/shared/types'
import { query, queryOne } from '@/lib/db'

export type MobileSessionAccount = {
  sessionId: string
  userId: string
  username: string
  email: string | null
  displayName: string | null
  avatarUrl: string | null
  role: UserRole
  accountStatus: string
  expiresAt: string
}

type MobileSessionAccountRow = {
  session_id: string
  user_id: string
  username: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  role: UserRole | null
  account_status: string | null
  expires_at: Date | string
}

export async function createMobileSessionRecord(input: {
  userId: string
  tokenHash: string
  expiresAt: string
  deviceLabel?: string | null
  userAgent?: string | null
}): Promise<{ id: string; expiresAt: string }> {
  const row = await queryOne<{ id: string; expires_at: Date | string }>(
    `
    INSERT INTO mobile_sessions (user_id, token_hash, expires_at, device_label, client_user_agent, last_used_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING id, expires_at
    `,
    [input.userId, input.tokenHash, input.expiresAt, input.deviceLabel ?? null, input.userAgent ?? null],
  )
  if (!row) throw new Error('Failed to create mobile session')
  return { id: row.id, expiresAt: toIsoString(row.expires_at) }
}

export async function getActiveMobileSessionAccount(tokenHash: string): Promise<MobileSessionAccount | null> {
  const row = await queryOne<MobileSessionAccountRow>(
    `
    SELECT
      ms.id AS session_id,
      ms.user_id,
      u.username,
      u.email,
      COALESCE(p.display_name, u.display_name, u.username) AS display_name,
      p.avatar_url,
      COALESCE(ur.role, 'student') AS role,
      COALESCE(uas.account_status, 'active') AS account_status,
      ms.expires_at
    FROM mobile_sessions ms
    JOIN users u ON u.id = ms.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN user_admin_states uas ON uas.user_id = u.id
    WHERE ms.token_hash = $1
      AND ms.revoked_at IS NULL
      AND ms.expires_at > NOW()
    `,
    [tokenHash],
  )
  return row ? mapSessionAccountRow(row) : null
}

export async function touchMobileSession(sessionId: string): Promise<void> {
  await query('UPDATE mobile_sessions SET last_used_at = NOW() WHERE id = $1', [sessionId])
}

export async function revokeMobileSessionByTokenHash(tokenHash: string): Promise<void> {
  await query(
    `
    UPDATE mobile_sessions
    SET revoked_at = COALESCE(revoked_at, NOW())
    WHERE token_hash = $1
    `,
    [tokenHash],
  )
}

function mapSessionAccountRow(row: MobileSessionAccountRow): MobileSessionAccount {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role ?? 'student',
    accountStatus: row.account_status ?? 'active',
    expiresAt: toIsoString(row.expires_at),
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
