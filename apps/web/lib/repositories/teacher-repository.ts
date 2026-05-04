import type { UserRole } from '@spcg/shared/types'
import type { PoolClient } from 'pg'
import { query, queryOne, withTransaction } from '@/lib/db'

export type TeacherStudentSummary = {
  id: string
  email: string | null
  displayName: string | null
  role: UserRole
  accountStatus: string
  passedCount: number
  submissionCount: number
  linkedAt: string
}

export type StudentProgressSummary = {
  levelId: string
  levelTitle: string
  chapterId: string
  spcgLevel: number
  passed: boolean
  attemptCount: number
  bestRuntimeMs: number | null
  lastSubmittedAt: string | null
}

export type StudentSubmissionSummary = {
  id: string
  levelId: string
  levelTitle: string
  status: string
  result: string | null
  language: string
  createdAt: string
  updatedAt: string
}

type TeacherStudentRow = {
  id: string
  email: string | null
  display_name: string | null
  role: UserRole | null
  account_status: string | null
  passed_count: string | number
  submission_count: string | number
  linked_at: Date | string
}

type StudentProgressRow = {
  level_id: string
  level_title: string | null
  chapter_id: string | null
  spcg_level: string | number | null
  passed: boolean
  attempt_count: number
  best_runtime_ms: number | null
  last_submitted_at: Date | string | null
}

type StudentSubmissionRow = {
  id: string
  level_id: string
  level_title: string | null
  status: string
  result: string | null
  language: string
  created_at: Date | string
  updated_at: Date | string
}

export async function teacherOwnsStudent(teacherUserId: string, studentUserId: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM teacher_students
      WHERE teacher_user_id = $1 AND student_user_id = $2 AND status = 'active'
    ) AS exists
    `,
    [teacherUserId, studentUserId],
  )
  return Boolean(row?.exists)
}

export async function addTeacherStudent(input: {
  teacherUserId: string
  studentUserId: string
  createdBy: string
  client?: PoolClient
}): Promise<void> {
  const sql = `
  INSERT INTO teacher_students (teacher_user_id, student_user_id, status, created_by)
  VALUES ($1, $2, 'active', $3)
  ON CONFLICT (teacher_user_id, student_user_id)
  DO UPDATE SET
    status = 'active',
    created_by = EXCLUDED.created_by
  `
  const values = [input.teacherUserId, input.studentUserId, input.createdBy]
  if (input.client) {
    await input.client.query(sql, values)
    return
  }
  await query(sql, values)
}

export async function createStudentAccountForTeacher(input: {
  teacherUserId: string
  email: string
  passwordHash: string
  displayName: string
  parentEmail?: string | null
  age?: number | null
}): Promise<string> {
  return withTransaction(async (client) => {
    const user = await client.query<{ id: string }>(
      `
      INSERT INTO users (email, password_hash, display_name)
      VALUES ($1, $2, $3)
      RETURNING id
      `,
      [input.email, input.passwordHash, input.displayName],
    )
    const studentUserId = user.rows[0]?.id
    if (!studentUserId) throw new Error('Failed to create student account')

    await client.query(
      `
      INSERT INTO profiles (user_id, display_name, parent_email, age)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        parent_email = EXCLUDED.parent_email,
        age = EXCLUDED.age
      `,
      [studentUserId, input.displayName, input.parentEmail ?? null, input.age ?? null],
    )

    await client.query(
      `
      INSERT INTO user_roles (user_id, role, assigned_by)
      VALUES ($1, 'student', $2)
      ON CONFLICT (user_id)
      DO UPDATE SET
        role = 'student',
        assigned_by = EXCLUDED.assigned_by
      `,
      [studentUserId, input.teacherUserId],
    )

    await addTeacherStudent({
      teacherUserId: input.teacherUserId,
      studentUserId,
      createdBy: input.teacherUserId,
      client,
    })

    return studentUserId
  })
}

export async function removeTeacherStudent(input: { teacherUserId: string; studentUserId: string }): Promise<void> {
  await query(
    `
    UPDATE teacher_students
    SET status = 'removed'
    WHERE teacher_user_id = $1 AND student_user_id = $2
    `,
    [input.teacherUserId, input.studentUserId],
  )
}

export async function listTeacherStudents(teacherUserId: string): Promise<TeacherStudentSummary[]> {
  const rows = await query<TeacherStudentRow>(
    `
    SELECT
      u.id,
      u.email,
      COALESCE(p.display_name, u.display_name) AS display_name,
      COALESCE(ur.role, 'student') AS role,
      COALESCE(uas.account_status, 'active') AS account_status,
      COUNT(DISTINCT pr.level_id) FILTER (WHERE pr.passed = TRUE) AS passed_count,
      COUNT(DISTINCT s.id) AS submission_count,
      ts.created_at AS linked_at
    FROM teacher_students ts
    JOIN users u ON u.id = ts.student_user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN user_admin_states uas ON uas.user_id = u.id
    LEFT JOIN progress pr ON pr.user_id = u.id
    LEFT JOIN submissions s ON s.user_id = u.id
    WHERE ts.teacher_user_id = $1 AND ts.status = 'active'
    GROUP BY u.id, p.display_name, ur.role, uas.account_status, ts.created_at
    ORDER BY ts.created_at DESC
    `,
    [teacherUserId],
  )

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role ?? 'student',
    accountStatus: row.account_status ?? 'active',
    passedCount: Number(row.passed_count),
    submissionCount: Number(row.submission_count),
    linkedAt: toIsoString(row.linked_at),
  }))
}

export async function listStudentProgressForTeacher(input: {
  teacherUserId: string
  studentUserId: string
}): Promise<StudentProgressSummary[]> {
  const rows = await query<StudentProgressRow>(
    `
    SELECT
      pr.level_id,
      l.title AS level_title,
      l.chapter_id,
      l.difficulty->>'spcgLevel' AS spcg_level,
      pr.passed,
      pr.attempt_count,
      pr.best_runtime_ms,
      pr.last_submitted_at
    FROM teacher_students ts
    JOIN progress pr ON pr.user_id = ts.student_user_id
    LEFT JOIN levels l ON l.id = pr.level_id
    WHERE ts.teacher_user_id = $1
      AND ts.student_user_id = $2
      AND ts.status = 'active'
    ORDER BY pr.updated_at DESC
    `,
    [input.teacherUserId, input.studentUserId],
  )

  return rows.map((row) => ({
    levelId: row.level_id,
    levelTitle: row.level_title ?? row.level_id,
    chapterId: row.chapter_id ?? '',
    spcgLevel: Number(row.spcg_level ?? 0),
    passed: row.passed,
    attemptCount: row.attempt_count,
    bestRuntimeMs: row.best_runtime_ms,
    lastSubmittedAt: row.last_submitted_at ? toIsoString(row.last_submitted_at) : null,
  }))
}

export async function listStudentSubmissionsForTeacher(input: {
  teacherUserId: string
  studentUserId: string
  limit?: number
}): Promise<StudentSubmissionSummary[]> {
  const rows = await query<StudentSubmissionRow>(
    `
    SELECT
      s.id,
      s.level_id,
      l.title AS level_title,
      s.status,
      s.verdict->>'result' AS result,
      s.language,
      s.created_at,
      s.updated_at
    FROM teacher_students ts
    JOIN submissions s ON s.user_id = ts.student_user_id
    LEFT JOIN levels l ON l.id = s.level_id
    WHERE ts.teacher_user_id = $1
      AND ts.student_user_id = $2
      AND ts.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT $3
    `,
    [input.teacherUserId, input.studentUserId, input.limit ?? 50],
  )

  return rows.map((row) => ({
    id: row.id,
    levelId: row.level_id,
    levelTitle: row.level_title ?? row.level_id,
    status: row.status,
    result: row.result,
    language: row.language,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }))
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
