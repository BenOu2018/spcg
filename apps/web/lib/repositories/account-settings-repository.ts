import type { UiLocale } from '@spcg/shared/types'
import { queryOne, withTransaction } from '@/lib/db'

export type AccountSettingsRecord = {
  username: string
  email: string | null
  displayName: string | null
  avatarUrl: string | null
  phoneNumber: string | null
  phoneVerifiedAt: string | null
  uiLocale: UiLocale
}

export async function getAccountSettingsRecord(userId: string): Promise<AccountSettingsRecord | null> {
  const row = await queryOne<{
    username: string
    email: string | null
    display_name: string | null
    avatar_url: string | null
    phone_number: string | null
    phone_verified_at: string | null
    ui_locale: UiLocale | null
  }>(
    `
    SELECT
      u.username,
      u.email,
      COALESCE(p.display_name, u.display_name, u.username) AS display_name,
      p.avatar_url,
      p.phone_number,
      p.phone_verified_at,
      COALESCE(p.ui_locale, 'zh-CN') AS ui_locale
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.id = $1
    `,
    [userId],
  )

  if (!row) return null
  return {
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    phoneNumber: row.phone_number,
    phoneVerifiedAt: row.phone_verified_at,
    uiLocale: row.ui_locale ?? 'zh-CN',
  }
}

export async function updateAccountProfileRecord(input: {
  userId: string
  displayName: string
  avatarUrl: string | null
}): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `
      UPDATE users
      SET display_name = $2, updated_at = NOW()
      WHERE id = $1
      `,
      [input.userId, input.displayName],
    )
    await client.query(
      `
      INSERT INTO profiles (user_id, display_name, avatar_url)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = NOW()
      `,
      [input.userId, input.displayName, input.avatarUrl],
    )
  })
}

export async function updateAccountUiLocaleRecord(input: {
  userId: string
  uiLocale: UiLocale
}): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `
      INSERT INTO profiles (user_id, ui_locale)
      VALUES ($1, $2)
      ON CONFLICT (user_id)
      DO UPDATE SET
        ui_locale = EXCLUDED.ui_locale,
        updated_at = NOW()
      `,
      [input.userId, input.uiLocale],
    )
  })
}

export async function getUserPasswordHash(userId: string): Promise<string | null> {
  const row = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [userId])
  return row?.password_hash ?? null
}

export async function updateUserPasswordHash(input: { userId: string; passwordHash: string }): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `
      UPDATE users
      SET password_hash = $2, updated_at = NOW()
      WHERE id = $1
      `,
      [input.userId, input.passwordHash],
    )
  })
}

export type PhoneVerificationCodeRecord = {
  id: string
  codeHash: string
  attemptCount: number
  expiresAt: string
}

export async function findVerifiedPhoneOwner(phoneNumber: string): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    `
    SELECT user_id
    FROM profiles
    WHERE phone_number = $1 AND phone_verified_at IS NOT NULL
    `,
    [phoneNumber],
  )
  return row?.user_id ?? null
}

export async function createPhoneVerificationCodeRecord(input: {
  userId: string
  phoneNumber: string
  codeHash: string
  expiresAt: Date
}): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `
      UPDATE phone_verification_codes
      SET consumed_at = NOW()
      WHERE user_id = $1 AND phone_number = $2 AND consumed_at IS NULL
      `,
      [input.userId, input.phoneNumber],
    )
    await client.query(
      `
      INSERT INTO phone_verification_codes (user_id, phone_number, code_hash, expires_at)
      VALUES ($1, $2, $3, $4)
      `,
      [input.userId, input.phoneNumber, input.codeHash, input.expiresAt],
    )
  })
}

export async function getLatestActivePhoneVerificationCode(input: {
  userId: string
  phoneNumber: string
}): Promise<PhoneVerificationCodeRecord | null> {
  const row = await queryOne<{
    id: string
    code_hash: string
    attempt_count: number
    expires_at: string
  }>(
    `
    SELECT id, code_hash, attempt_count, expires_at
    FROM phone_verification_codes
    WHERE user_id = $1
      AND phone_number = $2
      AND consumed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [input.userId, input.phoneNumber],
  )

  return row
    ? {
        id: row.id,
        codeHash: row.code_hash,
        attemptCount: Number(row.attempt_count),
        expiresAt: row.expires_at,
      }
    : null
}

export async function incrementPhoneVerificationAttempt(id: string): Promise<void> {
  await queryOne(
    `
    UPDATE phone_verification_codes
    SET attempt_count = attempt_count + 1
    WHERE id = $1
    RETURNING id
    `,
    [id],
  )
}

export async function verifyPhoneNumberRecord(input: {
  userId: string
  phoneNumber: string
  codeId: string
}): Promise<void> {
  await withTransaction(async (client) => {
    const owner = await client.query<{ user_id: string }>(
      `
      SELECT user_id
      FROM profiles
      WHERE phone_number = $1 AND phone_verified_at IS NOT NULL AND user_id <> $2
      `,
      [input.phoneNumber, input.userId],
    )
    if (owner.rows[0]) {
      const error = new Error('Phone number is already verified by another account.')
      ;(error as Error & { code?: string }).code = 'PHONE_TAKEN'
      throw error
    }

    await client.query(
      `
      UPDATE phone_verification_codes
      SET consumed_at = NOW()
      WHERE id = $1 AND user_id = $2
      `,
      [input.codeId, input.userId],
    )
    await client.query(
      `
      INSERT INTO profiles (user_id, phone_number, phone_verified_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        phone_number = EXCLUDED.phone_number,
        phone_verified_at = EXCLUDED.phone_verified_at,
        updated_at = NOW()
      `,
      [input.userId, input.phoneNumber],
    )
  })
}
