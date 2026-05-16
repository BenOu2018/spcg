import type {
  Language,
  ResolvedLanguage,
  StudentEnrollmentType,
  SubmissionErrorAnalysis,
  UserRole,
  Verdict,
} from '@spcg/shared/types'
import type { PoolClient } from 'pg'
import { query, queryOne, withTransaction } from '@/lib/db'
import { createDefaultStudentParentInvite } from '@/lib/repositories/student-parent-invite-repository'
import { getStudentEnrollmentLabel } from '@/lib/student-enrollment'

export type TeacherAccessLevel = 'owner' | 'viewer'

export type TeacherStudentRelation = {
  teacherUserId: string
  studentUserId: string
  accessLevel: TeacherAccessLevel
  status: 'active' | 'removed'
  teacherNote: string | null
  createdAt: string
  updatedAt: string
}

export type TeacherStudentSummary = {
  id: string
  username: string
  email: string | null
  displayName: string | null
  avatarUrl: string | null
  age: number | null
  realName: string | null
  idCardNumber: string | null
  parentEmail: string | null
  phoneNumberMasked: string | null
  phoneVerified: boolean
  studentEnrollmentType: StudentEnrollmentType
  studentEnrollmentLabel: string
  role: UserRole
  accountStatus: string
  accessLevel: TeacherAccessLevel
  teacherNote: string | null
  passedCount: number
  submissionCount: number
  todaySubmissionCount: number
  todayAcceptedCount: number
  todayCoinDelta: number
  pendingRepairCount: number
  repairedSuccessCount: number
  parentCount: number
  isOnline: boolean
  linkedAt: string
  sharedBy: string | null
  sharedAt: string | null
}

export type TeacherStudentProfileInput = {
  studentUserId: string
  displayName: string
  age: number | null
  realName: string | null
  idCardNumber: string | null
  parentEmail: string | null
  studentEnrollmentType: StudentEnrollmentType | null
  teacherNote: string | null
}

export type TeacherSharedTeacher = {
  teacherUserId: string
  username: string
  displayName: string | null
  sharedAt: string | null
  sharedBy: string | null
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
  spcgLevel: number
  status: string
  result: string | null
  language: string
  createdAt: string
  updatedAt: string
}

export type TeacherSubmissionHistoryItem = {
  id: string
  status: 'pending' | 'judging' | 'done' | 'error'
  verdict: Verdict | null
  code: string
  language: Language
  resolvedLanguage: ResolvedLanguage | null
  errorAnalysis: SubmissionErrorAnalysis | null
  createdAt: string
  updatedAt: string
  userId: string
  userEmail: string | null
  userDisplayName: string | null
  levelId: string
  levelTitle: string
  chapterId: string
  levelOrder: number
  spcgLevel: number
}

export type TeacherSubmissionFilters = {
  teacherUserId: string
  studentUserId?: string | null
  spcgLevel?: number | null
  levelId?: string | null
  result?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  limit?: number
}

export type TeacherOverviewVerdictCounts = Record<'AC' | 'WA' | 'CE' | 'TLE' | 'MLE' | 'RE' | 'PE' | 'Judge Error' | 'Other', number>

export type TeacherStuckProblem = {
  userId: string
  userDisplayName: string | null
  levelId: string
  levelTitle: string
  spcgLevel: number
  nonAcceptedCount: number
  latestResult: string
  latestSubmittedAt: string
}

export type TeacherOverviewStats = {
  totalStudents: number
  ownerStudents: number
  sharedStudents: number
  onlineStudents: number
  activeStudentsToday: number
  submissionsToday: number
  pendingCount: number
  judgingCount: number
  pendingRepairCount: number
  verdictCounts: TeacherOverviewVerdictCounts
  stuckProblems: TeacherStuckProblem[]
}

type RelationRow = {
  teacher_user_id: string
  student_user_id: string
  access_level: TeacherAccessLevel
  status: 'active' | 'removed'
  teacher_note: string | null
  created_at: Date | string
  updated_at: Date | string
}

type TeacherStudentRow = {
  id: string
  username: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  age: number | null
  real_name: string | null
  id_card_number: string | null
  parent_email: string | null
  phone_number: string | null
  phone_verified_at: Date | string | null
  student_enrollment_type: StudentEnrollmentType | null
  role: UserRole | null
  account_status: string | null
  access_level: TeacherAccessLevel
  teacher_note: string | null
  passed_count: string | number
  submission_count: string | number
  today_submission_count: string | number
  today_accepted_count: string | number
  today_coin_delta: string | number
  pending_repair_count: string | number
  repaired_success_count: string | number
  parent_count: string | number
  is_online: boolean
  linked_at: Date | string
  shared_by: string | null
  shared_at: Date | string | null
}

type SharedTeacherRow = {
  teacher_user_id: string
  username: string
  display_name: string | null
  shared_at: Date | string | null
  shared_by: string | null
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
  spcg_level: string | number | null
  status: string
  result: string | null
  language: string
  created_at: Date | string
  updated_at: Date | string
}

type TeacherSubmissionRow = {
  id: string
  status: TeacherSubmissionHistoryItem['status']
  verdict: Verdict | null
  code: string
  language: Language
  resolved_language: ResolvedLanguage | null
  error_analysis: SubmissionErrorAnalysis | null
  created_at: Date | string
  updated_at: Date | string
  user_id: string
  user_email: string | null
  user_display_name: string | null
  level_id: string
  level_title: string | null
  chapter_id: string | null
  level_order: number | null
  spcg_level: string | number | null
}

type OverviewStatsRow = {
  total_students: string | number
  owner_students: string | number
  shared_students: string | number
  online_students: string | number
  active_students_today: string | number
  submissions_today: string | number
  pending_count: string | number
  judging_count: string | number
  pending_repair_count: string | number
}

type VerdictCountRow = {
  result: string | null
  count: string | number
}

type StuckProblemRow = {
  user_id: string
  user_display_name: string | null
  level_id: string
  level_title: string | null
  spcg_level: string | number | null
  non_accepted_count: string | number
  latest_result: string | null
  latest_submitted_at: Date | string
}

export async function getTeacherStudentRelation(input: {
  teacherUserId: string
  studentUserId: string
}): Promise<TeacherStudentRelation | null> {
  const row = await queryOne<RelationRow>(
    `
    SELECT teacher_user_id, student_user_id, access_level, status, teacher_note, created_at, updated_at
    FROM teacher_students
    WHERE teacher_user_id = $1 AND student_user_id = $2 AND status = 'active'
    `,
    [input.teacherUserId, input.studentUserId],
  )
  return row ? mapRelationRow(row) : null
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

export async function teacherHasOwnerAccess(teacherUserId: string, studentUserId: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM teacher_students
      WHERE teacher_user_id = $1
        AND student_user_id = $2
        AND status = 'active'
        AND access_level = 'owner'
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
  INSERT INTO teacher_students (teacher_user_id, student_user_id, status, access_level, created_by, shared_by, shared_at)
  VALUES ($1, $2, 'active', 'owner', $3, NULL, NULL)
  ON CONFLICT (teacher_user_id, student_user_id)
  DO UPDATE SET
    status = 'active',
    access_level = 'owner',
    created_by = EXCLUDED.created_by,
    shared_by = NULL,
    shared_at = NULL
  `
  const values = [input.teacherUserId, input.studentUserId, input.createdBy]
  if (input.client) {
    await input.client.query(sql, values)
    await markStudentAsOffline(input.client, input.studentUserId)
    return
  }
  await withTransaction(async (client) => {
    await client.query(sql, values)
    await markStudentAsOffline(client, input.studentUserId)
  })
}

export async function createStudentAccountForTeacher(input: {
  teacherUserId: string
  username: string
  email?: string | null
  passwordHash: string
  displayName: string
  parentEmail?: string | null
  age?: number | null
  studentEnrollmentType?: StudentEnrollmentType
}): Promise<string> {
  return withTransaction(async (client) => {
    const user = await client.query<{ id: string }>(
      `
      INSERT INTO users (username, email, password_hash, display_name)
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
      [input.username, input.email ?? null, input.passwordHash, input.displayName],
    )
    const studentUserId = user.rows[0]?.id
    if (!studentUserId) throw new Error('Failed to create student account')

    await client.query(
      `
      INSERT INTO profiles (user_id, display_name, parent_email, age, student_enrollment_type)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        parent_email = EXCLUDED.parent_email,
        age = EXCLUDED.age,
        student_enrollment_type = EXCLUDED.student_enrollment_type
      `,
      [studentUserId, input.displayName, input.parentEmail ?? null, input.age ?? null, input.studentEnrollmentType ?? 'offline'],
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

    await createDefaultStudentParentInvite({
      studentUserId,
      createdBy: input.teacherUserId,
      client,
    })

    return studentUserId
  })
}

export async function updateTeacherStudentProfile(input: {
  teacherUserId: string
  profile: TeacherStudentProfileInput
}): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `
      UPDATE users
      SET display_name = $2
      WHERE id = $1
      `,
      [input.profile.studentUserId, input.profile.displayName],
    )
    await client.query(
      `
      INSERT INTO profiles (user_id, display_name, parent_email, age, real_name, id_card_number, student_enrollment_type)
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'online'))
      ON CONFLICT (user_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        parent_email = EXCLUDED.parent_email,
        age = EXCLUDED.age,
        real_name = EXCLUDED.real_name,
        id_card_number = EXCLUDED.id_card_number,
        student_enrollment_type = COALESCE($7, profiles.student_enrollment_type, 'online')
      `,
      [
        input.profile.studentUserId,
        input.profile.displayName,
        input.profile.parentEmail,
        input.profile.age,
        input.profile.realName,
        input.profile.idCardNumber,
        input.profile.studentEnrollmentType,
      ],
    )
    await client.query(
      `
      UPDATE teacher_students
      SET teacher_note = $3
      WHERE teacher_user_id = $1 AND student_user_id = $2 AND status = 'active'
      `,
      [input.teacherUserId, input.profile.studentUserId, input.profile.teacherNote],
    )
  })
}

async function markStudentAsOffline(client: PoolClient, studentUserId: string): Promise<void> {
  await client.query(
    `
    INSERT INTO profiles (user_id, student_enrollment_type)
    VALUES ($1, 'offline')
    ON CONFLICT (user_id)
    DO UPDATE SET
      student_enrollment_type = 'offline',
      updated_at = NOW()
    `,
    [studentUserId],
  )
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

export async function shareTeacherStudent(input: {
  ownerTeacherUserId: string
  targetTeacherUserId: string
  studentUserId: string
}): Promise<void> {
  await query(
    `
    INSERT INTO teacher_students (teacher_user_id, student_user_id, status, access_level, created_by, shared_by, shared_at)
    VALUES ($1, $2, 'active', 'viewer', $3, $3, NOW())
    ON CONFLICT (teacher_user_id, student_user_id)
    DO UPDATE SET
      status = 'active',
      access_level = 'viewer',
      created_by = EXCLUDED.created_by,
      shared_by = EXCLUDED.shared_by,
      shared_at = NOW()
    `,
    [input.targetTeacherUserId, input.studentUserId, input.ownerTeacherUserId],
  )
}

export async function revokeTeacherStudentViewer(input: {
  targetTeacherUserId: string
  studentUserId: string
}): Promise<void> {
  await query(
    `
    UPDATE teacher_students
    SET status = 'removed'
    WHERE teacher_user_id = $1
      AND student_user_id = $2
      AND access_level = 'viewer'
    `,
    [input.targetTeacherUserId, input.studentUserId],
  )
}

export async function listStudentSharedTeachers(studentUserId: string): Promise<TeacherSharedTeacher[]> {
  const rows = await query<SharedTeacherRow>(
    `
    SELECT
      ts.teacher_user_id,
      u.username,
      COALESCE(p.display_name, u.display_name, u.username) AS display_name,
      ts.shared_at,
      ts.shared_by
    FROM teacher_students ts
    JOIN users u ON u.id = ts.teacher_user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE ts.student_user_id = $1
      AND ts.status = 'active'
      AND ts.access_level = 'viewer'
    ORDER BY ts.shared_at DESC NULLS LAST, ts.created_at DESC
    `,
    [studentUserId],
  )
  return rows.map((row) => ({
    teacherUserId: row.teacher_user_id,
    username: row.username,
    displayName: row.display_name,
    sharedAt: row.shared_at ? toIsoString(row.shared_at) : null,
    sharedBy: row.shared_by,
  }))
}

export async function listTeacherStudents(teacherUserId: string): Promise<TeacherStudentSummary[]> {
  const rows = await query<TeacherStudentRow>(
    `
    SELECT
      u.id,
      u.username,
      u.email,
      COALESCE(p.display_name, u.display_name, u.username) AS display_name,
      p.avatar_url,
      p.age,
      p.real_name,
      p.id_card_number,
      p.parent_email,
      p.phone_number,
      p.phone_verified_at,
      COALESCE(p.student_enrollment_type, 'online') AS student_enrollment_type,
      COALESCE(ur.role, 'student') AS role,
      COALESCE(uas.account_status, 'active') AS account_status,
      ts.access_level,
      ts.teacher_note,
      COALESCE(progress_stats.passed_count, 0) AS passed_count,
      COALESCE(submission_stats.submission_count, 0) AS submission_count,
      COALESCE(submission_stats.today_submission_count, 0) AS today_submission_count,
      COALESCE(submission_stats.today_accepted_count, 0) AS today_accepted_count,
      COALESCE(reward_stats.today_coin_delta, 0) AS today_coin_delta,
      COALESCE(progress_stats.pending_repair_count, 0) AS pending_repair_count,
      COALESCE(progress_stats.repaired_success_count, 0) AS repaired_success_count,
      COALESCE(parent_stats.parent_count, 0) AS parent_count,
      (
        u.last_sign_in_at >= NOW() - INTERVAL '15 minutes'
        OR EXISTS (
          SELECT 1
          FROM submissions recent_s
          WHERE recent_s.user_id = u.id
            AND recent_s.created_at >= NOW() - INTERVAL '15 minutes'
        )
      ) AS is_online,
      ts.created_at AS linked_at,
      ts.shared_by,
      ts.shared_at
    FROM teacher_students ts
    JOIN users u ON u.id = ts.student_user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN user_admin_states uas ON uas.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE pr.passed = TRUE) AS passed_count,
        COUNT(*) FILTER (WHERE pr.passed = FALSE AND pr.attempt_count > 0) AS pending_repair_count,
        COUNT(*) FILTER (WHERE pr.passed = TRUE AND pr.attempt_count > 1) AS repaired_success_count
      FROM progress pr
      WHERE pr.user_id = u.id
    ) progress_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS submission_count,
        COUNT(*) FILTER (WHERE s.created_at >= date_trunc('day', NOW())) AS today_submission_count,
        COUNT(DISTINCT s.level_id) FILTER (
          WHERE s.created_at >= date_trunc('day', NOW())
            AND s.verdict->>'result' = 'AC'
        ) AS today_accepted_count
      FROM submissions s
      WHERE s.user_id = u.id
    ) submission_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(rl.coin_delta) FILTER (WHERE rl.coin_delta > 0), 0) AS today_coin_delta
      FROM reward_ledger rl
      WHERE rl.user_id = u.id
        AND rl.created_at >= date_trunc('day', NOW())
    ) reward_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS parent_count
      FROM parent_students ps
      WHERE ps.student_user_id = u.id AND ps.status = 'active'
    ) parent_stats ON TRUE
    WHERE ts.teacher_user_id = $1 AND ts.status = 'active'
    ORDER BY ts.access_level ASC, ts.created_at DESC
    `,
    [teacherUserId],
  )

  return rows.map(mapTeacherStudentRow)
}

export async function getTeacherStudentSummary(input: {
  teacherUserId: string
  studentUserId: string
  allowAdminAccess?: boolean
}): Promise<TeacherStudentSummary | null> {
  const row = await queryOne<TeacherStudentRow>(
    `
    SELECT
      u.id,
      u.username,
      u.email,
      COALESCE(p.display_name, u.display_name, u.username) AS display_name,
      p.avatar_url,
      p.age,
      p.real_name,
      p.id_card_number,
      p.parent_email,
      p.phone_number,
      p.phone_verified_at,
      COALESCE(p.student_enrollment_type, 'online') AS student_enrollment_type,
      COALESCE(ur.role, 'student') AS role,
      COALESCE(uas.account_status, 'active') AS account_status,
      COALESCE(relation.access_level, 'owner') AS access_level,
      relation.teacher_note,
      COALESCE(progress_stats.passed_count, 0) AS passed_count,
      COALESCE(submission_stats.submission_count, 0) AS submission_count,
      COALESCE(submission_stats.today_submission_count, 0) AS today_submission_count,
      COALESCE(submission_stats.today_accepted_count, 0) AS today_accepted_count,
      COALESCE(reward_stats.today_coin_delta, 0) AS today_coin_delta,
      COALESCE(progress_stats.pending_repair_count, 0) AS pending_repair_count,
      COALESCE(progress_stats.repaired_success_count, 0) AS repaired_success_count,
      COALESCE(parent_stats.parent_count, 0) AS parent_count,
      (
        u.last_sign_in_at >= NOW() - INTERVAL '15 minutes'
        OR EXISTS (
          SELECT 1
          FROM submissions recent_s
          WHERE recent_s.user_id = u.id
            AND recent_s.created_at >= NOW() - INTERVAL '15 minutes'
        )
      ) AS is_online,
      COALESCE(relation.created_at, u.created_at) AS linked_at,
      relation.shared_by,
      relation.shared_at
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN user_admin_states uas ON uas.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT ts.access_level, ts.teacher_note, ts.created_at, ts.shared_by, ts.shared_at
      FROM teacher_students ts
      WHERE ts.student_user_id = u.id
        AND ts.status = 'active'
        AND ($3::boolean OR ts.teacher_user_id = $1)
      ORDER BY
        CASE
          WHEN ts.teacher_user_id = $1 THEN 0
          WHEN ts.access_level = 'owner' THEN 1
          ELSE 2
        END,
        ts.created_at DESC
      LIMIT 1
    ) relation ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE pr.passed = TRUE) AS passed_count,
        COUNT(*) FILTER (WHERE pr.passed = FALSE AND pr.attempt_count > 0) AS pending_repair_count,
        COUNT(*) FILTER (WHERE pr.passed = TRUE AND pr.attempt_count > 1) AS repaired_success_count
      FROM progress pr
      WHERE pr.user_id = u.id
    ) progress_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS submission_count,
        COUNT(*) FILTER (WHERE s.created_at >= date_trunc('day', NOW())) AS today_submission_count,
        COUNT(DISTINCT s.level_id) FILTER (
          WHERE s.created_at >= date_trunc('day', NOW())
            AND s.verdict->>'result' = 'AC'
        ) AS today_accepted_count
      FROM submissions s
      WHERE s.user_id = u.id
    ) submission_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(rl.coin_delta) FILTER (WHERE rl.coin_delta > 0), 0) AS today_coin_delta
      FROM reward_ledger rl
      WHERE rl.user_id = u.id
        AND rl.created_at >= date_trunc('day', NOW())
    ) reward_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS parent_count
      FROM parent_students ps
      WHERE ps.student_user_id = u.id AND ps.status = 'active'
    ) parent_stats ON TRUE
    WHERE u.id = $2
      AND COALESCE(ur.role, 'student') = 'student'
      AND ($3::boolean OR relation.access_level IS NOT NULL)
    `,
    [input.teacherUserId, input.studentUserId, Boolean(input.allowAdminAccess)],
  )

  return row ? mapTeacherStudentRow(row) : null
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
      l.difficulty->>'spcgLevel' AS spcg_level,
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
    [input.teacherUserId, input.studentUserId, Math.max(1, Math.min(input.limit ?? 50, 200))],
  )

  return rows.map((row) => ({
    id: row.id,
    levelId: row.level_id,
    levelTitle: row.level_title ?? row.level_id,
    spcgLevel: Number(row.spcg_level ?? 0),
    status: row.status,
    result: row.result,
    language: row.language,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }))
}

export async function listTeacherSubmissionHistory(input: TeacherSubmissionFilters): Promise<TeacherSubmissionHistoryItem[]> {
  const values: unknown[] = [input.teacherUserId]
  const filters = ['ts.teacher_user_id = $1', "ts.status = 'active'"]

  if (input.studentUserId) {
    values.push(input.studentUserId)
    filters.push(`s.user_id = $${values.length}`)
  }
  if (input.spcgLevel) {
    values.push(input.spcgLevel)
    filters.push(`(l.difficulty->>'spcgLevel')::int = $${values.length}`)
  }
  if (input.levelId) {
    values.push(input.levelId)
    filters.push(`s.level_id = $${values.length}`)
  }
  if (input.result) {
    values.push(input.result)
    filters.push(`COALESCE(s.verdict->>'result', CASE WHEN s.status = 'error' THEN 'Judge Error' ELSE s.status END) = $${values.length}`)
  }
  if (input.dateFrom) {
    values.push(input.dateFrom)
    filters.push(`s.created_at >= $${values.length}::timestamptz`)
  }
  if (input.dateTo) {
    values.push(input.dateTo)
    filters.push(`s.created_at < ($${values.length}::date + INTERVAL '1 day')`)
  }

  const limit = Math.max(1, Math.min(input.limit ?? 100, 300))
  values.push(limit)

  const rows = await query<TeacherSubmissionRow>(
    `
    SELECT
      s.id,
      s.status,
      s.verdict,
      s.code,
      s.language,
      s.resolved_language,
      latest_analysis.error_analysis,
      s.created_at,
      s.updated_at,
      s.user_id,
      u.email AS user_email,
      COALESCE(p.display_name, u.display_name, u.username) AS user_display_name,
      s.level_id,
      l.title AS level_title,
      l.chapter_id,
      l."order" AS level_order,
      l.difficulty->>'spcgLevel' AS spcg_level
    FROM teacher_students ts
    JOIN submissions s ON s.user_id = ts.student_user_id
    JOIN users u ON u.id = s.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN levels l ON l.id = s.level_id
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'id', sea.id,
        'submissionId', sea.submission_id,
        'provider', sea.provider,
        'model', sea.model,
        'verdictResult', sea.verdict_result,
        'analysis', sea.analysis,
        'rawError', sea.raw_error,
        'promptHash', sea.prompt_hash,
        'createdAt', sea.created_at
      ) AS error_analysis
      FROM submission_error_analyses sea
      WHERE sea.submission_id = s.id
      ORDER BY sea.created_at DESC
      LIMIT 1
    ) latest_analysis ON TRUE
    WHERE ${filters.join(' AND ')}
    ORDER BY s.created_at DESC
    LIMIT $${values.length}
    `,
    values,
  )

  return rows.map(mapTeacherSubmissionRow)
}

export async function getTeacherOverviewStats(teacherUserId: string): Promise<TeacherOverviewStats> {
  const [statsRow, verdictRows, stuckRows] = await Promise.all([
    queryOne<OverviewStatsRow>(
      `
      WITH accessible AS (
        SELECT DISTINCT ts.student_user_id, ts.access_level
        FROM teacher_students ts
        WHERE ts.teacher_user_id = $1 AND ts.status = 'active'
      )
      SELECT
        COUNT(*) AS total_students,
        COUNT(*) FILTER (WHERE a.access_level = 'owner') AS owner_students,
        COUNT(*) FILTER (WHERE a.access_level = 'viewer') AS shared_students,
        COUNT(*) FILTER (
          WHERE u.last_sign_in_at >= NOW() - INTERVAL '15 minutes'
            OR EXISTS (
              SELECT 1
              FROM submissions online_s
              WHERE online_s.user_id = a.student_user_id
                AND online_s.created_at >= NOW() - INTERVAL '15 minutes'
            )
        ) AS online_students,
        COUNT(*) FILTER (
          WHERE u.last_sign_in_at >= date_trunc('day', NOW())
            OR EXISTS (
              SELECT 1
              FROM submissions active_s
              WHERE active_s.user_id = a.student_user_id
                AND active_s.created_at >= date_trunc('day', NOW())
            )
        ) AS active_students_today,
        COALESCE((
          SELECT COUNT(*)
          FROM submissions s
          JOIN accessible a2 ON a2.student_user_id = s.user_id
          WHERE s.created_at >= date_trunc('day', NOW())
        ), 0) AS submissions_today,
        COALESCE((
          SELECT COUNT(*)
          FROM submissions s
          JOIN accessible a2 ON a2.student_user_id = s.user_id
          WHERE s.status = 'pending'
        ), 0) AS pending_count,
        COALESCE((
          SELECT COUNT(*)
          FROM submissions s
          JOIN accessible a2 ON a2.student_user_id = s.user_id
          WHERE s.status = 'judging'
        ), 0) AS judging_count,
        COALESCE((
          SELECT COUNT(*)
          FROM progress pr
          JOIN accessible a2 ON a2.student_user_id = pr.user_id
          WHERE pr.passed = FALSE AND pr.attempt_count > 0
        ), 0) AS pending_repair_count
      FROM accessible a
      JOIN users u ON u.id = a.student_user_id
      `,
      [teacherUserId],
    ),
    query<VerdictCountRow>(
      `
      WITH accessible AS (
        SELECT DISTINCT ts.student_user_id
        FROM teacher_students ts
        WHERE ts.teacher_user_id = $1 AND ts.status = 'active'
      )
      SELECT
        CASE
          WHEN s.verdict->>'result' IN ('AC','WA','CE','TLE','MLE','RE','PE','Judge Error')
            THEN s.verdict->>'result'
          WHEN s.status = 'error'
            THEN 'Judge Error'
          ELSE 'Other'
        END AS result,
        COUNT(*) AS count
      FROM submissions s
      JOIN accessible a ON a.student_user_id = s.user_id
      WHERE s.created_at >= date_trunc('day', NOW())
        AND s.status IN ('done', 'error')
      GROUP BY result
      `,
      [teacherUserId],
    ),
    query<StuckProblemRow>(
      `
      WITH accessible AS (
        SELECT DISTINCT ts.student_user_id
        FROM teacher_students ts
        WHERE ts.teacher_user_id = $1 AND ts.status = 'active'
      ),
      recent_failures AS (
        SELECT
          s.user_id,
          s.level_id,
          COUNT(*) AS non_accepted_count,
          MAX(s.created_at) AS latest_submitted_at,
          (ARRAY_AGG(
            COALESCE(
              s.verdict->>'result',
              CASE WHEN s.status = 'error' THEN 'Judge Error' ELSE s.status END
            )
            ORDER BY s.created_at DESC
          ))[1] AS latest_result
        FROM submissions s
        JOIN accessible a ON a.student_user_id = s.user_id
        WHERE s.created_at >= NOW() - INTERVAL '7 days'
          AND s.assessment_attempt_id IS NULL
          AND (
            s.status = 'error'
            OR (
              s.status = 'done'
              AND COALESCE(s.verdict->>'result', '') <> 'AC'
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM submissions ac
            WHERE ac.user_id = s.user_id
              AND ac.level_id = s.level_id
              AND ac.status = 'done'
              AND ac.verdict->>'result' = 'AC'
              AND ac.assessment_attempt_id IS NULL
          )
        GROUP BY s.user_id, s.level_id
      )
      SELECT
        rf.user_id,
        COALESCE(p.display_name, u.display_name, u.username) AS user_display_name,
        rf.level_id,
        l.title AS level_title,
        l.difficulty->>'spcgLevel' AS spcg_level,
        rf.non_accepted_count,
        rf.latest_result,
        rf.latest_submitted_at
      FROM recent_failures rf
      JOIN users u ON u.id = rf.user_id
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN levels l ON l.id = rf.level_id
      LEFT JOIN progress pr ON pr.user_id = rf.user_id AND pr.level_id = rf.level_id
      WHERE COALESCE(pr.passed, FALSE) = FALSE
      ORDER BY rf.non_accepted_count DESC, rf.latest_submitted_at DESC
      LIMIT 10
      `,
      [teacherUserId],
    ),
  ])

  const verdictCounts = emptyVerdictCounts()
  for (const row of verdictRows) {
    verdictCounts[normalizeVerdictResult(row.result)] += toNumber(row.count)
  }

  return {
    totalStudents: toNumber(statsRow?.total_students),
    ownerStudents: toNumber(statsRow?.owner_students),
    sharedStudents: toNumber(statsRow?.shared_students),
    onlineStudents: toNumber(statsRow?.online_students),
    activeStudentsToday: toNumber(statsRow?.active_students_today),
    submissionsToday: toNumber(statsRow?.submissions_today),
    pendingCount: toNumber(statsRow?.pending_count),
    judgingCount: toNumber(statsRow?.judging_count),
    pendingRepairCount: toNumber(statsRow?.pending_repair_count),
    verdictCounts,
    stuckProblems: stuckRows.map((row) => ({
      userId: row.user_id,
      userDisplayName: row.user_display_name,
      levelId: row.level_id,
      levelTitle: row.level_title ?? row.level_id,
      spcgLevel: Number(row.spcg_level ?? 0),
      nonAcceptedCount: toNumber(row.non_accepted_count),
      latestResult: row.latest_result ?? 'Other',
      latestSubmittedAt: toIsoString(row.latest_submitted_at),
    })),
  }
}

function mapTeacherStudentRow(row: TeacherStudentRow): TeacherStudentSummary {
  const studentEnrollmentType = row.student_enrollment_type === 'offline' ? 'offline' : 'online'
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    age: row.age,
    realName: row.real_name,
    idCardNumber: row.id_card_number,
    parentEmail: row.parent_email,
    phoneNumberMasked: maskPhone(row.phone_number),
    phoneVerified: Boolean(row.phone_verified_at),
    studentEnrollmentType,
    studentEnrollmentLabel: getStudentEnrollmentLabel(studentEnrollmentType),
    role: row.role ?? 'student',
    accountStatus: row.account_status ?? 'active',
    accessLevel: row.access_level,
    teacherNote: row.teacher_note,
    passedCount: toNumber(row.passed_count),
    submissionCount: toNumber(row.submission_count),
    todaySubmissionCount: toNumber(row.today_submission_count),
    todayAcceptedCount: toNumber(row.today_accepted_count),
    todayCoinDelta: toNumber(row.today_coin_delta),
    pendingRepairCount: toNumber(row.pending_repair_count),
    repairedSuccessCount: toNumber(row.repaired_success_count),
    parentCount: toNumber(row.parent_count),
    isOnline: Boolean(row.is_online),
    linkedAt: toIsoString(row.linked_at),
    sharedBy: row.shared_by,
    sharedAt: row.shared_at ? toIsoString(row.shared_at) : null,
  }
}

function mapRelationRow(row: RelationRow): TeacherStudentRelation {
  return {
    teacherUserId: row.teacher_user_id,
    studentUserId: row.student_user_id,
    accessLevel: row.access_level,
    status: row.status,
    teacherNote: row.teacher_note,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }
}

function mapTeacherSubmissionRow(row: TeacherSubmissionRow): TeacherSubmissionHistoryItem {
  return {
    id: row.id,
    status: row.status,
    verdict: row.verdict,
    code: row.code,
    language: row.language,
    resolvedLanguage: row.resolved_language,
    errorAnalysis: row.error_analysis ? normalizeSubmissionErrorAnalysis(row.error_analysis) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    userId: row.user_id,
    userEmail: row.user_email,
    userDisplayName: row.user_display_name,
    levelId: row.level_id,
    levelTitle: row.level_title ?? row.level_id,
    chapterId: row.chapter_id ?? '',
    levelOrder: row.level_order ?? 0,
    spcgLevel: Number(row.spcg_level ?? 0),
  }
}

function normalizeSubmissionErrorAnalysis(value: SubmissionErrorAnalysis): SubmissionErrorAnalysis {
  return {
    ...value,
    createdAt: toIsoString(value.createdAt),
  }
}

function emptyVerdictCounts(): TeacherOverviewVerdictCounts {
  return {
    AC: 0,
    WA: 0,
    CE: 0,
    TLE: 0,
    MLE: 0,
    RE: 0,
    PE: 0,
    'Judge Error': 0,
    Other: 0,
  }
}

function normalizeVerdictResult(result: string | null): keyof TeacherOverviewVerdictCounts {
  return result === 'AC' ||
    result === 'WA' ||
    result === 'CE' ||
    result === 'TLE' ||
    result === 'MLE' ||
    result === 'RE' ||
    result === 'PE' ||
    result === 'Judge Error'
    ? result
    : 'Other'
}

function maskPhone(value: string | null): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length < 7) return '已绑定'
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
