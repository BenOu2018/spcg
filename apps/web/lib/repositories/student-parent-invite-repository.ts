import type { PoolClient } from 'pg'
import type { StudentParentInviteResetResult, StudentParentInviteSummary } from '@spcg/shared/types'
import { query, queryOne } from '@/lib/db'
import { generateParentInviteCode } from '@/lib/parent-invite-code'
import { maskPhoneNumber } from '@/lib/user-identity'

type StudentParentInviteRow = {
  student_user_id: string
  phone_number: string | null
  phone_verified_at: Date | string | null
  invite_status: 'active' | 'revoked' | null
  code_preview: string | null
  rotated_at: Date | string | null
  invite_created_at: Date | string | null
  invite_updated_at: Date | string | null
  bound_parent_count: string | number
}

export async function getStudentParentInviteSummaryRecord(
  studentUserId: string,
): Promise<StudentParentInviteSummary | null> {
  const row = await queryOne<StudentParentInviteRow>(
    `
    SELECT
      u.id AS student_user_id,
      p.phone_number,
      p.phone_verified_at,
      spi.status AS invite_status,
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
    `,
    [studentUserId],
  )

  return row ? mapSummaryRow(row) : null
}

export async function createDefaultStudentParentInvite(input: {
  studentUserId: string
  createdBy: string | null
  client?: PoolClient
}): Promise<void> {
  const invite = generateParentInviteCode()
  const sql = `
    INSERT INTO student_parent_invites (student_user_id, invite_code_hash, code_preview, status, created_by, rotated_at)
    VALUES ($1, $2, $3, 'active', $4, NOW())
    ON CONFLICT (student_user_id) DO NOTHING
  `
  const values = [input.studentUserId, invite.hash, invite.preview, input.createdBy]
  if (input.client) {
    await input.client.query(sql, values)
    return
  }
  await query(sql, values)
}

export async function resetStudentParentInviteRecord(input: {
  studentUserId: string
  rotatedBy: string | null
}): Promise<StudentParentInviteResetResult> {
  const invite = generateParentInviteCode()
  const row = await queryOne<{ rotated_at: Date | string }>(
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
    [input.studentUserId, invite.hash, invite.preview, input.rotatedBy],
  )

  return {
    studentUserId: input.studentUserId,
    inviteCode: invite.code,
    codePreview: invite.preview,
    rotatedAt: row?.rotated_at ? toIsoString(row.rotated_at) : new Date().toISOString(),
  }
}

function mapSummaryRow(row: StudentParentInviteRow): StudentParentInviteSummary {
  const inviteStatus = row.invite_status ?? 'missing'
  const rotatedAt = row.rotated_at ?? row.invite_updated_at ?? row.invite_created_at
  return {
    studentUserId: row.student_user_id,
    studentPhoneNumberMasked: maskPhoneNumber(row.phone_number),
    studentPhoneVerified: Boolean(row.phone_verified_at),
    inviteStatus,
    codePreview: row.code_preview,
    rotatedAt: rotatedAt ? toIsoString(rotatedAt) : null,
    canRevealCode: false,
    boundParentCount: Number(row.bound_parent_count ?? 0),
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
