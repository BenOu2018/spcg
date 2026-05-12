import type { ParentAccountSummary, ParentStudentBinding } from '@spcg/shared/types'
import { query, queryOne, withTransaction } from '@/lib/db'

type ParentBindingRow = {
  parent_user_id: string
  student_user_id: string
  status: 'active' | 'removed'
  note: string | null
  created_at: Date | string
  updated_at: Date | string
  username: string
  email: string | null
  display_name: string | null
  phone_number: string | null
  phone_verified_at: Date | string | null
}

export async function parentOwnsStudent(parentUserId: string, studentUserId: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM parent_students
      WHERE parent_user_id = $1
        AND student_user_id = $2
        AND status = 'active'
    ) AS exists
    `,
    [parentUserId, studentUserId],
  )
  return Boolean(row?.exists)
}

export async function listParentsForStudent(studentUserId: string): Promise<ParentStudentBinding[]> {
  const rows = await query<ParentBindingRow>(
    `
    SELECT
      ps.parent_user_id,
      ps.student_user_id,
      ps.status,
      ps.note,
      ps.created_at,
      ps.updated_at,
      u.username,
      u.email,
      COALESCE(p.display_name, u.display_name, u.username) AS display_name,
      p.phone_number,
      p.phone_verified_at
    FROM parent_students ps
    JOIN users u ON u.id = ps.parent_user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE ps.student_user_id = $1 AND ps.status = 'active'
    ORDER BY ps.created_at DESC
    `,
    [studentUserId],
  )
  return rows.map(mapParentBindingRow)
}

export async function createParentAccountForStudent(input: {
  teacherUserId: string
  studentUserId: string
  username: string
  email: string | null
  phoneNumber: string | null
  passwordHash: string
  displayName: string
  note: string | null
}): Promise<string> {
  return withTransaction(async (client) => {
    const user = await client.query<{ id: string }>(
      `
      INSERT INTO users (username, email, password_hash, display_name)
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
      [input.username, input.email, input.passwordHash, input.displayName],
    )
    const parentUserId = user.rows[0]?.id
    if (!parentUserId) throw new Error('Failed to create parent account')

    await client.query(
      `
      INSERT INTO profiles (user_id, display_name, phone_number)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        phone_number = EXCLUDED.phone_number
      `,
      [parentUserId, input.displayName, input.phoneNumber],
    )

    await client.query(
      `
      INSERT INTO user_roles (user_id, role, assigned_by)
      VALUES ($1, 'parent', $2)
      ON CONFLICT (user_id)
      DO UPDATE SET
        role = 'parent',
        assigned_by = EXCLUDED.assigned_by
      `,
      [parentUserId, input.teacherUserId],
    )

    await client.query(
      `
      INSERT INTO parent_students (parent_user_id, student_user_id, status, note, created_by)
      VALUES ($1, $2, 'active', $3, $4)
      ON CONFLICT (parent_user_id, student_user_id)
      DO UPDATE SET
        status = 'active',
        note = EXCLUDED.note,
        created_by = EXCLUDED.created_by
      `,
      [parentUserId, input.studentUserId, input.note, input.teacherUserId],
    )

    return parentUserId
  })
}

export async function bindParentToStudent(input: {
  parentUserId: string
  studentUserId: string
  createdBy: string
  note: string | null
}): Promise<void> {
  await query(
    `
    INSERT INTO parent_students (parent_user_id, student_user_id, status, note, created_by)
    VALUES ($1, $2, 'active', $3, $4)
    ON CONFLICT (parent_user_id, student_user_id)
    DO UPDATE SET
      status = 'active',
      note = EXCLUDED.note,
      created_by = EXCLUDED.created_by
    `,
    [input.parentUserId, input.studentUserId, input.note, input.createdBy],
  )
}

export async function removeParentStudentBinding(input: {
  parentUserId: string
  studentUserId: string
}): Promise<void> {
  await query(
    `
    UPDATE parent_students
    SET status = 'removed'
    WHERE parent_user_id = $1 AND student_user_id = $2
    `,
    [input.parentUserId, input.studentUserId],
  )
}

function mapParentBindingRow(row: ParentBindingRow): ParentStudentBinding {
  return {
    parentUserId: row.parent_user_id,
    studentUserId: row.student_user_id,
    status: row.status,
    note: row.note,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    parent: {
      id: row.parent_user_id,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      phoneNumberMasked: maskPhone(row.phone_number),
      phoneVerified: Boolean(row.phone_verified_at),
    },
  }
}

function maskPhone(value: string | null): string | null {
  if (!value) return null
  if (value.length <= 7) return value
  return `${value.slice(0, 3)}****${value.slice(-4)}`
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
