import type { PoolClient } from 'pg'
import { queryOne, withTransaction } from '@/lib/db'

export type PublicAuthUserRecord = {
  id: string
  username: string
  email: string
  displayName: string
}

export async function createStudentUserRecord(input: {
  username: string
  email: string
  displayName: string
  passwordHash: string
}): Promise<PublicAuthUserRecord> {
  return withTransaction(async (client) => {
    const result = await client.query<{
      id: string
      username: string
      email: string
      display_name: string
    }>(
      `
      INSERT INTO users (username, email, password_hash, display_name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, email, display_name
      `,
      [input.username, input.email, input.passwordHash, input.displayName],
    )
    const user = result.rows[0]
    if (!user) throw new Error('Failed to create user')

    await client.query(
      `
      INSERT INTO profiles (user_id, display_name)
      VALUES ($1, $2)
      ON CONFLICT (user_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        updated_at = NOW()
      `,
      [user.id, input.displayName],
    )
    await client.query(
      `
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'student')
      ON CONFLICT (user_id) DO NOTHING
      `,
      [user.id],
    )

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
    }
  })
}

export async function usernameExists(username: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>('SELECT id FROM users WHERE lower(username) = lower($1) LIMIT 1', [username])
  return Boolean(row)
}

export async function emailExists(email: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1 LIMIT 1', [email])
  return Boolean(row)
}

export async function updateUserPasswordHashInClient(input: {
  client: PoolClient
  userId: string
  passwordHash: string
}): Promise<void> {
  await input.client.query(
    `
    UPDATE users
    SET password_hash = $2, updated_at = NOW()
    WHERE id = $1
    `,
    [input.userId, input.passwordHash],
  )
}
