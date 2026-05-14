import type { UserRole } from '@spcg/shared/types'
import { query, queryOne, withTransaction } from '@/lib/db'

export type ParentMobileAccountRecord = {
  id: string
  username: string
  email: string | null
  displayName: string | null
  avatarUrl: string | null
}

export type ParentMobileAuthUserRecord = ParentMobileAccountRecord & {
  passwordHash: string
  role: UserRole
  accountStatus: string
}

export type ParentStudentLearningSummaryRecord = {
  studentUserId: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  currentLevelId: string | null
  currentLevelTitle: string | null
  currentSpcgLevel: number | null
  passedCount: number
  submissionCount: number
  activeDaysLast14: number
  learningStreakDays: number
  lastSubmittedAt: string | null
}

type ParentAccountRow = {
  id: string
  username: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
}

type ParentAuthRow = ParentAccountRow & {
  password_hash: string
  role: UserRole | null
  account_status: string | null
}

type StudentSummaryRow = {
  student_user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  current_level_id: string | null
  current_level_title: string | null
  current_spcg_level: string | number | null
  passed_count: string | number | null
  submission_count: string | number | null
  active_days_last_14: string | number | null
  learning_streak_days: string | number | null
  last_submitted_at: Date | string | null
}

export class ParentInviteConsumeError extends Error {
  constructor() {
    super('Parent invite code is no longer active')
    this.name = 'ParentInviteConsumeError'
  }
}

export async function findParentMobileAuthUserByEmail(email: string): Promise<ParentMobileAuthUserRecord | null> {
  const row = await queryOne<ParentAuthRow>(
    `
    SELECT
      u.id,
      u.username,
      u.email,
      u.password_hash,
      COALESCE(p.display_name, u.display_name, u.username) AS display_name,
      p.avatar_url,
      COALESCE(ur.role, 'student') AS role,
      COALESCE(uas.account_status, 'active') AS account_status
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN user_admin_states uas ON uas.user_id = u.id
    WHERE lower(u.email) = lower($1)
    LIMIT 1
    `,
    [email],
  )
  return row ? mapParentAuthRow(row) : null
}

export async function createParentAccountAndBindStudent(input: {
  username: string
  email: string
  displayName: string
  passwordHash: string
  studentUserId: string
  inviteCodeHash: string
}): Promise<ParentMobileAccountRecord> {
  return withTransaction(async (client) => {
    const userResult = await client.query<ParentAccountRow>(
      `
      INSERT INTO users (username, email, password_hash, display_name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, email, display_name, NULL::text AS avatar_url
      `,
      [input.username, input.email, input.passwordHash, input.displayName],
    )
    const user = userResult.rows[0]
    if (!user) throw new Error('Failed to create parent account')

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
      INSERT INTO user_roles (user_id, role, assigned_by)
      VALUES ($1, 'parent', $1)
      ON CONFLICT (user_id)
      DO UPDATE SET
        role = 'parent',
        assigned_by = EXCLUDED.assigned_by
      `,
      [user.id],
    )

    const consumed = await client.query<{ student_user_id: string }>(
      `
      UPDATE student_parent_invites
      SET status = 'revoked',
          updated_at = NOW()
      WHERE student_user_id = $1
        AND invite_code_hash = $2
        AND status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM parent_students ps
          WHERE ps.student_user_id = student_parent_invites.student_user_id
            AND ps.status = 'active'
        )
      RETURNING student_user_id
      `,
      [input.studentUserId, input.inviteCodeHash],
    )
    if (!consumed.rows[0]) throw new ParentInviteConsumeError()

    await client.query(
      `
      INSERT INTO parent_students (parent_user_id, student_user_id, status, created_by)
      VALUES ($1, $2, 'active', $1)
      ON CONFLICT (parent_user_id, student_user_id)
      DO UPDATE SET
        status = 'active',
        created_by = EXCLUDED.created_by,
        updated_at = NOW()
      `,
      [user.id, input.studentUserId],
    )

    return mapParentAccountRow(user)
  })
}

export async function bindParentAccountToStudentWithInvite(input: {
  parentUserId: string
  studentUserId: string
  inviteCodeHash: string
}): Promise<void> {
  await withTransaction(async (client) => {
    const consumed = await client.query<{ student_user_id: string }>(
      `
      UPDATE student_parent_invites
      SET status = 'revoked',
          updated_at = NOW()
      WHERE student_user_id = $1
        AND invite_code_hash = $2
        AND status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM parent_students ps
          WHERE ps.student_user_id = student_parent_invites.student_user_id
            AND ps.status = 'active'
        )
      RETURNING student_user_id
      `,
      [input.studentUserId, input.inviteCodeHash],
    )
    if (!consumed.rows[0]) throw new ParentInviteConsumeError()

    await client.query(
      `
      INSERT INTO parent_students (parent_user_id, student_user_id, status, created_by)
      VALUES ($1, $2, 'active', $1)
      ON CONFLICT (parent_user_id, student_user_id)
      DO UPDATE SET
        status = 'active',
        created_by = EXCLUDED.created_by,
        updated_at = NOW()
      `,
      [input.parentUserId, input.studentUserId],
    )
  })
}

export async function listParentStudentLearningSummaries(parentUserId: string): Promise<ParentStudentLearningSummaryRecord[]> {
  const rows = await query<StudentSummaryRow>(
    `
    SELECT
      u.id AS student_user_id,
      u.username,
      COALESCE(p.display_name, u.display_name, u.username) AS display_name,
      p.avatar_url,
      current_level.level_id AS current_level_id,
      current_level.title AS current_level_title,
      current_level.spcg_level AS current_spcg_level,
      COALESCE(progress_stats.passed_count, 0) AS passed_count,
      COALESCE(submission_stats.submission_count, 0) AS submission_count,
      COALESCE(activity_stats.active_days_last_14, 0) AS active_days_last_14,
      COALESCE(activity_stats.learning_streak_days, 0) AS learning_streak_days,
      submission_stats.last_submitted_at
    FROM parent_students ps
    JOIN users u ON u.id = ps.student_user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(scl.level_id, latest_progress.level_id) AS level_id,
        l.title,
        l.difficulty->>'spcgLevel' AS spcg_level
      FROM (SELECT 1) anchor
      LEFT JOIN student_current_levels scl ON scl.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT pr.level_id
        FROM progress pr
        WHERE pr.user_id = u.id
        ORDER BY pr.updated_at DESC
        LIMIT 1
      ) latest_progress ON TRUE
      LEFT JOIN levels l ON l.id = COALESCE(scl.level_id, latest_progress.level_id)
      LIMIT 1
    ) current_level ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE pr.passed = TRUE) AS passed_count
      FROM progress pr
      WHERE pr.user_id = u.id
    ) progress_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS submission_count, MAX(s.created_at) AS last_submitted_at
      FROM submissions s
      WHERE s.user_id = u.id
    ) submission_stats ON TRUE
    LEFT JOIN LATERAL (
      WITH activity_days AS (
        SELECT DISTINCT s.created_at::date AS day
        FROM submissions s
        WHERE s.user_id = u.id
      ),
      latest AS (
        SELECT MAX(day) AS max_day
        FROM activity_days
      ),
      numbered AS (
        SELECT
          activity_days.day,
          ROW_NUMBER() OVER (ORDER BY activity_days.day DESC) AS row_number
        FROM activity_days
        CROSS JOIN latest
        WHERE latest.max_day IS NOT NULL
          AND activity_days.day <= latest.max_day
      )
      SELECT
        COUNT(*) FILTER (WHERE activity_days.day >= CURRENT_DATE - 13) AS active_days_last_14,
        (
          SELECT COUNT(*)
          FROM numbered
          CROSS JOIN latest
          WHERE numbered.day = latest.max_day - (numbered.row_number::int - 1)
        ) AS learning_streak_days
      FROM activity_days
    ) activity_stats ON TRUE
    WHERE ps.parent_user_id = $1
      AND ps.status = 'active'
    ORDER BY ps.created_at DESC
    `,
    [parentUserId],
  )
  return rows.map(mapStudentSummaryRow)
}

export async function getParentStudentLearningSummary(input: {
  parentUserId: string
  studentUserId: string
}): Promise<ParentStudentLearningSummaryRecord | null> {
  const summaries = await listParentStudentLearningSummaries(input.parentUserId)
  return summaries.find((item) => item.studentUserId === input.studentUserId) ?? null
}

function mapParentAuthRow(row: ParentAuthRow): ParentMobileAuthUserRecord {
  return {
    ...mapParentAccountRow(row),
    passwordHash: row.password_hash,
    role: row.role ?? 'student',
    accountStatus: row.account_status ?? 'active',
  }
}

function mapParentAccountRow(row: ParentAccountRow): ParentMobileAccountRecord {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  }
}

function mapStudentSummaryRow(row: StudentSummaryRow): ParentStudentLearningSummaryRecord {
  return {
    studentUserId: row.student_user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    currentLevelId: row.current_level_id,
    currentLevelTitle: row.current_level_title,
    currentSpcgLevel: row.current_spcg_level == null ? null : toNumber(row.current_spcg_level),
    passedCount: toNumber(row.passed_count),
    submissionCount: toNumber(row.submission_count),
    activeDaysLast14: toNumber(row.active_days_last_14),
    learningStreakDays: toNumber(row.learning_streak_days),
    lastSubmittedAt: row.last_submitted_at ? toIsoString(row.last_submitted_at) : null,
  }
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
