import type { EntitlementSummary, StudentEnrollmentType, StudentUserType } from '@spcg/shared/types'
import type { PoolClient } from 'pg'
import { query, queryOne, withTransaction } from '@/lib/db'

type EntitlementRow = {
  user_id: string
  user_type: StudentUserType
  note: string | null
  expires_at: Date | string | null
  updated_at: Date | string | null
}

export type EntitlementAuditInput = {
  actorUserId: string
  actorRole: string
  studentUserId: string
  previousUserType: StudentUserType
  nextUserType: StudentUserType
  note: string | null
}

export type UpgradeRequestRecord = {
  id: string
  userId: string
  targetUserType: StudentUserType
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  message: string | null
  createdAt: string
}

type StudentEnrollmentRow = {
  student_enrollment_type: StudentEnrollmentType | null
}

type UpgradeRequestRow = {
  id: string
  user_id: string
  target_user_type: StudentUserType
  status: UpgradeRequestRecord['status']
  message: string | null
  created_at: Date | string
}

export async function getUserEntitlementRecord(userId: string): Promise<EntitlementSummary | null> {
  try {
    const row = await queryOne<EntitlementRow>(
      `
      SELECT user_id, user_type, note, expires_at, updated_at
      FROM user_entitlements
      WHERE user_id = $1
      `,
      [userId],
    )

    return row ? mapEntitlementRow(row) : null
  } catch (error) {
    if (isUndefinedTable(error)) return null
    throw error
  }
}

export async function getStudentEnrollmentTypeRecord(userId: string): Promise<StudentEnrollmentType> {
  try {
    const row = await queryOne<StudentEnrollmentRow>(
      `
      SELECT COALESCE(p.student_enrollment_type, 'online') AS student_enrollment_type
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = $1
      `,
      [userId],
    )

    return row?.student_enrollment_type === 'offline' ? 'offline' : 'online'
  } catch (error) {
    if (isUndefinedTable(error) || isUndefinedColumn(error)) return 'online'
    throw error
  }
}

export async function setUserEntitlementRecord(input: {
  actorUserId: string
  actorRole: string
  studentUserId: string
  userType: StudentUserType
  note?: string | null
}): Promise<EntitlementSummary> {
  try {
    return await withTransaction(async (client) => {
      const before = await getEntitlementSnapshot(client, input.studentUserId)
      const previousUserType = (before?.user_type ?? 'experience') as StudentUserType
      const rows = await client.query<EntitlementRow>(
        `
        INSERT INTO user_entitlements (user_id, user_type, note, updated_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id)
        DO UPDATE SET
          user_type = EXCLUDED.user_type,
          note = EXCLUDED.note,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING user_id, user_type, note, expires_at, updated_at
        `,
        [input.studentUserId, input.userType, input.note ?? null, input.actorUserId],
      )
      const row = rows.rows[0]
      if (!row) throw new Error('Failed to set user entitlement.')

      await insertEntitlementAudit(client, {
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        studentUserId: input.studentUserId,
        previousUserType,
        nextUserType: input.userType,
        note: input.note ?? null,
      })

      return mapEntitlementRow(row)
    })
  } catch (error) {
    if (isUndefinedTable(error)) {
      throw new Error('user_entitlements table is missing. Run npm run db:migrate before setting user types.')
    }
    throw error
  }
}

export async function createUpgradeRequestRecord(input: {
  userId: string
  targetUserType: Exclude<StudentUserType, 'experience'>
  message?: string | null
}): Promise<UpgradeRequestRecord> {
  try {
    const rows = await query<UpgradeRequestRow>(
      `
      INSERT INTO upgrade_requests (user_id, target_user_type, message)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, target_user_type, status, message, created_at
      `,
      [input.userId, input.targetUserType, input.message ?? null],
    )
    const row = rows[0]
    if (!row) throw new Error('Failed to create upgrade request.')
    return mapUpgradeRequestRow(row)
  } catch (error) {
    if (isUndefinedTable(error)) {
      throw new Error('upgrade_requests table is missing. Run npm run db:migrate before requesting upgrades.')
    }
    throw error
  }
}

async function getEntitlementSnapshot(client: PoolClient, userId: string): Promise<EntitlementRow | null> {
  const rows = await client.query<EntitlementRow>(
    `
    SELECT user_id, user_type, note, expires_at, updated_at
    FROM user_entitlements
    WHERE user_id = $1
    FOR UPDATE
    `,
    [userId],
  )
  return rows.rows[0] ?? null
}

async function insertEntitlementAudit(client: PoolClient, input: EntitlementAuditInput) {
  await client.query(
    `
    INSERT INTO admin_audit_logs
      (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
    VALUES ($1, $2, 'user_entitlement.set', 'user_entitlement', $3, $4, $5, $6)
    `,
    [
      input.actorUserId,
      input.actorRole,
      input.studentUserId,
      { userType: input.previousUserType },
      { userType: input.nextUserType },
      { note: input.note },
    ],
  )
}

function mapEntitlementRow(row: EntitlementRow): EntitlementSummary {
  return {
    userId: row.user_id,
    userType: row.user_type,
    storedUserType: row.user_type,
    effectiveUserType: row.user_type,
    entitlementSource: 'stored',
    studentEnrollmentType: 'online',
    label: getEntitlementLabel(row.user_type),
    note: row.note,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }
}

function mapUpgradeRequestRow(row: UpgradeRequestRow): UpgradeRequestRecord {
  return {
    id: row.id,
    userId: row.user_id,
    targetUserType: row.target_user_type,
    status: row.status,
    message: row.message,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

function getEntitlementLabel(userType: StudentUserType): string {
  const labels: Record<StudentUserType, string> = {
    experience: '体验用户',
    invite_test: '邀请测试用户',
    paid_49: '完整课程',
    paid_99: '高级学习',
  }
  return labels[userType]
}

function isUndefinedTable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42P01'
}

function isUndefinedColumn(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42703'
}
