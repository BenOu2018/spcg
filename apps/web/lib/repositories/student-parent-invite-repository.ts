import type { PoolClient } from 'pg'
import type { StudentParentInviteResetResult, StudentParentInviteSummary } from '@spcg/shared/types'
import { query, queryOne } from '@/lib/db'
import { decryptParentInviteCode, encryptParentInviteCode, generateParentInviteCode } from '@/lib/parent-invite-code'
import { maskPhoneNumber } from '@/lib/user-identity'

type StudentParentInviteRow = {
  student_user_id: string
  phone_number: string | null
  phone_verified_at: Date | string | null
  invite_status: 'active' | 'revoked' | null
  invite_code_encrypted: Record<string, unknown> | null
  code_preview: string | null
  rotated_at: Date | string | null
  invite_created_at: Date | string | null
  invite_updated_at: Date | string | null
  bound_parent_count: string | number
}

type StudentParentInviteLookupRow = {
  student_user_id: string
}

export async function getStudentParentInviteSummaryRecord(
  studentUserId: string,
): Promise<StudentParentInviteSummary | null> {
  let row: StudentParentInviteRow | null
  try {
    row = await queryOne<StudentParentInviteRow>(buildStudentParentInviteSummarySql('spi.invite_code_encrypted'), [studentUserId])
  } catch (error) {
    if (!isUndefinedColumnError(error)) throw error
    row = await queryOne<StudentParentInviteRow>(buildStudentParentInviteSummarySql('NULL::jsonb'), [studentUserId])
  }

  return row ? mapSummaryRow(row) : null
}

export async function createDefaultStudentParentInvite(input: {
  studentUserId: string
  createdBy: string | null
  client?: PoolClient
}): Promise<StudentParentInviteResetResult | null> {
  const invite = generateParentInviteCode()
  const hasEncryptedCodeColumn = await hasInviteCodeEncryptedColumn(input.client)
  if (!hasEncryptedCodeColumn) {
    const row = await createDefaultStudentParentInviteWithoutEncryptedCode(input, invite)
    return row
      ? {
          studentUserId: input.studentUserId,
          inviteCode: invite.code,
          codePreview: invite.preview,
          rotatedAt: toIsoString(row.rotated_at),
        }
      : null
  }

  const inviteCodeEncrypted = encryptParentInviteCode(invite.code)
  const sql = `
    INSERT INTO student_parent_invites (student_user_id, invite_code_hash, invite_code_encrypted, code_preview, status, created_by, rotated_at)
    VALUES ($1, $2, $3, $4, 'active', $5, NOW())
    ON CONFLICT (student_user_id) DO NOTHING
    RETURNING rotated_at
  `
  const values = [input.studentUserId, invite.hash, JSON.stringify(inviteCodeEncrypted), invite.preview, input.createdBy]
  const result = input.client ? await input.client.query<{ rotated_at: Date | string }>(sql, values) : { rows: await query<{ rotated_at: Date | string }>(sql, values) }
  const row = result.rows[0]
  return row
    ? {
        studentUserId: input.studentUserId,
        inviteCode: invite.code,
        codePreview: invite.preview,
        rotatedAt: toIsoString(row.rotated_at),
      }
    : null
}

export async function findActiveStudentByParentInviteHash(inviteCodeHash: string): Promise<string | null> {
  const row = await queryOne<StudentParentInviteLookupRow>(
    `
    SELECT spi.student_user_id
    FROM student_parent_invites spi
    JOIN user_roles ur ON ur.user_id = spi.student_user_id AND ur.role = 'student'
    LEFT JOIN user_admin_states uas ON uas.user_id = spi.student_user_id
    WHERE spi.invite_code_hash = $1
      AND spi.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM parent_students ps
        WHERE ps.student_user_id = spi.student_user_id
          AND ps.status = 'active'
      )
      AND COALESCE(uas.account_status, 'active') = 'active'
    LIMIT 1
    `,
    [inviteCodeHash],
  )
  return row?.student_user_id ?? null
}

export async function resetStudentParentInviteRecord(input: {
  studentUserId: string
  rotatedBy: string | null
}): Promise<StudentParentInviteResetResult> {
  const invite = generateParentInviteCode()
  const inviteCodeEncrypted = encryptParentInviteCode(invite.code)
  let row: { rotated_at: Date | string } | null
  try {
    row = await queryOne<{ rotated_at: Date | string }>(
      `
      INSERT INTO student_parent_invites
        (student_user_id, invite_code_hash, invite_code_encrypted, code_preview, status, created_by, rotated_at)
      VALUES ($1, $2, $3, $4, 'active', $5, NOW())
      ON CONFLICT (student_user_id)
      DO UPDATE SET
        invite_code_hash = EXCLUDED.invite_code_hash,
        invite_code_encrypted = EXCLUDED.invite_code_encrypted,
        code_preview = EXCLUDED.code_preview,
        status = 'active',
        created_by = EXCLUDED.created_by,
        rotated_at = NOW(),
        updated_at = NOW()
      RETURNING rotated_at
      `,
      [input.studentUserId, invite.hash, JSON.stringify(inviteCodeEncrypted), invite.preview, input.rotatedBy],
    )
  } catch (error) {
    if (!isUndefinedColumnError(error)) throw error
    row = await resetStudentParentInviteRecordWithoutEncryptedCode({
      ...input,
      inviteHash: invite.hash,
      codePreview: invite.preview,
    })
  }

  return {
    studentUserId: input.studentUserId,
    inviteCode: invite.code,
    codePreview: invite.preview,
    rotatedAt: row?.rotated_at ? toIsoString(row.rotated_at) : new Date().toISOString(),
  }
}

export async function ensureRevealableStudentParentInviteRecord(input: {
  studentUserId: string
  repairedBy: string | null
}): Promise<StudentParentInviteResetResult | null> {
  const hasEncryptedCodeColumn = await hasInviteCodeEncryptedColumn()
  if (!hasEncryptedCodeColumn) return null

  const invite = generateParentInviteCode()
  const inviteCodeEncrypted = encryptParentInviteCode(invite.code)
  const row = await queryOne<{ rotated_at: Date | string }>(
    `
    UPDATE student_parent_invites spi
    SET invite_code_hash = $2,
        invite_code_encrypted = $3,
        code_preview = $4,
        status = 'active',
        created_by = COALESCE(spi.created_by, $5),
        rotated_at = NOW(),
        updated_at = NOW()
    WHERE spi.student_user_id = $1
      AND spi.status = 'active'
      AND spi.invite_code_encrypted IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM parent_students ps
        WHERE ps.student_user_id = spi.student_user_id
          AND ps.status = 'active'
      )
    RETURNING spi.rotated_at
    `,
    [input.studentUserId, invite.hash, JSON.stringify(inviteCodeEncrypted), invite.preview, input.repairedBy],
  )
  if (!row) return null
  return {
    studentUserId: input.studentUserId,
    inviteCode: invite.code,
    codePreview: invite.preview,
    rotatedAt: toIsoString(row.rotated_at),
  }
}

function buildStudentParentInviteSummarySql(encryptedCodeExpression: string): string {
  return `
    SELECT
      u.id AS student_user_id,
      p.phone_number,
      p.phone_verified_at,
      spi.status AS invite_status,
      ${encryptedCodeExpression} AS invite_code_encrypted,
      spi.code_preview,
      spi.rotated_at,
      spi.created_at AS invite_created_at,
      spi.updated_at AS invite_updated_at,
      (
        SELECT COUNT(*)
        FROM parent_students ps
        WHERE ps.student_user_id = u.id AND ps.status = 'active'
      ) AS bound_parent_count
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN student_parent_invites spi ON spi.student_user_id = u.id
    WHERE u.id = $1
    `
}

async function createDefaultStudentParentInviteWithoutEncryptedCode(
  input: {
    studentUserId: string
    createdBy: string | null
    client?: PoolClient
  },
  invite: { hash: string; preview: string },
): Promise<{ rotated_at: Date | string } | null> {
  const sql = `
    INSERT INTO student_parent_invites (student_user_id, invite_code_hash, code_preview, status, created_by, rotated_at)
    VALUES ($1, $2, $3, 'active', $4, NOW())
    ON CONFLICT (student_user_id) DO NOTHING
    RETURNING rotated_at
  `
  const values = [input.studentUserId, invite.hash, invite.preview, input.createdBy]
  if (input.client) {
    const result = await input.client.query<{ rotated_at: Date | string }>(sql, values)
    return result.rows[0] ?? null
  }
  return queryOne<{ rotated_at: Date | string }>(sql, values)
}

async function hasInviteCodeEncryptedColumn(client?: PoolClient): Promise<boolean> {
  const sql = `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'student_parent_invites'
        AND column_name = 'invite_code_encrypted'
    ) AS exists
  `
  if (client) {
    const result = await client.query<{ exists: boolean }>(sql)
    return Boolean(result.rows[0]?.exists)
  }
  const row = await queryOne<{ exists: boolean }>(sql)
  return Boolean(row?.exists)
}

async function resetStudentParentInviteRecordWithoutEncryptedCode(input: {
  studentUserId: string
  rotatedBy: string | null
  inviteHash: string
  codePreview: string
}): Promise<{ rotated_at: Date | string } | null> {
  return queryOne<{ rotated_at: Date | string }>(
    `
    INSERT INTO student_parent_invites
      (student_user_id, invite_code_hash, code_preview, status, created_by, rotated_at)
    VALUES ($1, $2, $3, 'active', $4, NOW())
    ON CONFLICT (student_user_id)
    DO UPDATE SET
      invite_code_hash = EXCLUDED.invite_code_hash,
      code_preview = EXCLUDED.code_preview,
      status = 'active',
      created_by = EXCLUDED.created_by,
      rotated_at = NOW(),
      updated_at = NOW()
    RETURNING rotated_at
    `,
    [input.studentUserId, input.inviteHash, input.codePreview, input.rotatedBy],
  )
}

function mapSummaryRow(row: StudentParentInviteRow): StudentParentInviteSummary {
  const boundParentCount = Number(row.bound_parent_count ?? 0)
  const inviteStatus = row.invite_status ?? 'missing'
  const rotatedAt = row.rotated_at ?? row.invite_updated_at ?? row.invite_created_at
  const inviteCode = boundParentCount === 0 && inviteStatus === 'active' ? decryptParentInviteCode(row.invite_code_encrypted) : null
  return {
    studentUserId: row.student_user_id,
    studentPhoneNumberMasked: maskPhoneNumber(row.phone_number),
    studentPhoneVerified: Boolean(row.phone_verified_at),
    inviteStatus,
    inviteCode,
    codePreview: row.code_preview,
    rotatedAt: rotatedAt ? toIsoString(rotatedAt) : null,
    canRevealCode: Boolean(inviteCode),
    boundParentCount,
  }
}

function isUndefinedColumnError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42703'
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
