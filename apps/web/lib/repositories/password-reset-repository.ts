import { queryOne, withTransaction } from '@/lib/db'
import { updateUserPasswordHashInClient } from '@/lib/repositories/auth-account-repository'

export type PasswordResetUserRecord = {
  id: string
  email: string
  displayName: string | null
  username: string
  accountStatus: string
}

export type PasswordResetTokenRecord = {
  id: string
  userId: string
  email: string
  expiresAt: string
  consumedAt: string | null
}

export async function findPasswordResetUserByEmail(email: string): Promise<PasswordResetUserRecord | null> {
  const row = await queryOne<{
    id: string
    email: string
    display_name: string | null
    username: string
    account_status: string | null
  }>(
    `
    SELECT
      u.id,
      u.email,
      COALESCE(p.display_name, u.display_name) AS display_name,
      u.username,
      COALESCE(uas.account_status, 'active') AS account_status
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_admin_states uas ON uas.user_id = u.id
    WHERE u.email = $1
    `,
    [email],
  )
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    username: row.username,
    accountStatus: row.account_status ?? 'active',
  }
}

export async function createPasswordResetTokenRecord(input: {
  userId: string
  email: string
  tokenHash: string
  expiresAt: Date
}): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `
      UPDATE password_reset_tokens
      SET consumed_at = NOW()
      WHERE user_id = $1 AND consumed_at IS NULL
      `,
      [input.userId],
    )
    await client.query(
      `
      INSERT INTO password_reset_tokens (user_id, email, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
      `,
      [input.userId, input.email, input.tokenHash, input.expiresAt],
    )
  })
}

export async function getActivePasswordResetToken(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
  const row = await queryOne<{
    id: string
    user_id: string
    email: string
    expires_at: string
    consumed_at: string | null
  }>(
    `
    SELECT id, user_id, email, expires_at, consumed_at
    FROM password_reset_tokens
    WHERE token_hash = $1
      AND consumed_at IS NULL
    LIMIT 1
    `,
    [tokenHash],
  )
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  }
}

export async function consumePasswordResetTokenAndUpdatePassword(input: {
  tokenId: string
  userId: string
  passwordHash: string
}): Promise<boolean> {
  return withTransaction(async (client) => {
    const consumed = await client.query<{ id: string }>(
      `
      UPDATE password_reset_tokens
      SET consumed_at = NOW()
      WHERE id = $1
        AND user_id = $2
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING id
      `,
      [input.tokenId, input.userId],
    )
    if (!consumed.rows[0]) return false
    await updateUserPasswordHashInClient({
      client,
      userId: input.userId,
      passwordHash: input.passwordHash,
    })
    return true
  })
}
