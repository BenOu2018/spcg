import type { StudentEnrollmentType, UserRole } from '@spcg/shared/types'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  addTeacherStudent,
  createStudentAccountForTeacher,
  getTeacherOverviewStats,
  getTeacherStudentRelation,
  listStudentProgressForTeacher,
  listStudentSharedTeachers,
  listStudentSubmissionsForTeacher,
  listTeacherSubmissionHistory,
  listTeacherStudents,
  removeTeacherStudent,
  revokeTeacherStudentViewer,
  shareTeacherStudent,
  teacherOwnsStudent,
  updateTeacherStudentProfile,
  type StudentProgressSummary,
  type StudentSubmissionSummary,
  type TeacherAccessLevel,
  type TeacherOverviewStats,
  type TeacherSharedTeacher,
  type TeacherStudentProfileInput,
  type TeacherStudentRelation,
  type TeacherStudentSummary,
  type TeacherSubmissionFilters,
  type TeacherSubmissionHistoryItem,
} from '@/lib/repositories/teacher-repository'
import { listPublishedLessonStageProblemMenus } from '@/lib/repositories/problem-set-repository'
import { findUserByIdentifier, getUserRole } from '@/lib/repositories/user-repository'
import { hashPassword } from '@/lib/password'
import { isValidUsername, normalizeUsername } from '@/lib/user-identity'
import {
  getStudentCurrentLevelSummary,
  setStudentCurrentLevel,
  type StudentCurrentLevelSummary,
} from '@/lib/services/level-access-service'
import { ServiceError } from '@/lib/services/errors'

export type { TeacherSubmissionHistoryItem }

export type TeacherDashboard = {
  students: TeacherStudentSummary[]
  overview: TeacherOverviewStats
  totalPassed: number
  totalSubmissions: number
}

export type TeacherStudentAccess = {
  teacherUserId: string
  role: UserRole
  accessLevel: TeacherAccessLevel
  canManage: boolean
}

export type TeacherStudentProfileUpdateInput = Omit<TeacherStudentProfileInput, 'studentUserId' | 'studentEnrollmentType'> & {
  teacherUserId?: string | null
  studentUserId: string
  studentEnrollmentType?: StudentEnrollmentType | null
}

export async function requireTeacher(userId?: string | null): Promise<{ userId: string; role: UserRole }> {
  if (!userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)

  const role = await getUserRole(userId)
  if (role !== 'teacher' && role !== 'admin') {
    throw new ServiceError('forbidden', '需要老师或管理员权限。', 403)
  }
  return { userId, role }
}

export async function getTeacherDashboard(userId?: string | null): Promise<TeacherDashboard> {
  const teacher = await requireTeacher(userId)
  const [students, overview] = await Promise.all([
    listTeacherStudents(teacher.userId),
    getTeacherOverviewStats(teacher.userId),
  ])
  return {
    students,
    overview,
    totalPassed: students.reduce((sum, student) => sum + student.passedCount, 0),
    totalSubmissions: students.reduce((sum, student) => sum + student.submissionCount, 0),
  }
}

export async function getTeacherStudents(userId?: string | null): Promise<TeacherStudentSummary[]> {
  const teacher = await requireTeacher(userId)
  return listTeacherStudents(teacher.userId)
}

export async function getTeacherLessonStageMenus(userId?: string | null) {
  await requireTeacher(userId)
  return listPublishedLessonStageProblemMenus({ track: 'A' })
}

export async function addStudentToTeacher(input: {
  teacherUserId?: string | null
  studentIdentifier: string
}): Promise<TeacherStudentSummary> {
  const teacher = await requireTeacher(input.teacherUserId)
  const student = await findUserByIdentifier(input.studentIdentifier)
  if (!student) throw new ServiceError('not_found', '没有找到这个学生账号。', 404)
  if (student.accountStatus !== 'active') throw new ServiceError('bad_request', '只能添加 active 状态的学生。', 400)
  if (student.role !== 'student') throw new ServiceError('bad_request', '只能添加学生角色的账号。', 400)
  if (student.id === teacher.userId) throw new ServiceError('bad_request', '老师不能添加自己为学生。', 400)

  try {
    await addTeacherStudent({
      teacherUserId: teacher.userId,
      studentUserId: student.id,
      createdBy: teacher.userId,
    })
  } catch (error) {
    if (isUniqueTeacherConflict(error)) {
      throw new ServiceError('conflict', '该学生已经有主老师，可由主老师共享给你查看。', 409)
    }
    throw error
  }

  const students = await listTeacherStudents(teacher.userId)
  const linked = students.find((item) => item.id === student.id)
  if (!linked) throw new ServiceError('internal_error', '学生已添加，但读取关系失败。', 500)
  return linked
}

export async function createStudentForTeacher(input: {
  teacherUserId?: string | null
  username: string
  email?: string | null
  password: string
  displayName: string
  parentEmail?: string | null
  age?: number | null
  studentEnrollmentType?: StudentEnrollmentType | null
}): Promise<TeacherStudentSummary> {
  const teacher = await requireTeacher(input.teacherUserId)
  const username = normalizeUsername(input.username)
  const displayName = input.displayName.trim()
  if (!isValidUsername(username) || displayName.length === 0 || input.password.length < 8) {
    throw new ServiceError('bad_request', '学生用户名、姓名或密码不合法。', 400)
  }

  const passwordHash = await hashPassword(input.password)
  let studentUserId = ''
  try {
    studentUserId = await createStudentAccountForTeacher({
      teacherUserId: teacher.userId,
      username,
      email: input.email?.trim().toLowerCase() || null,
      passwordHash,
      displayName,
      parentEmail: input.parentEmail ?? null,
      age: input.age ?? null,
      studentEnrollmentType: input.studentEnrollmentType ?? 'offline',
    })
  } catch (error) {
    if (isUniqueTeacherConflict(error)) {
      throw new ServiceError('conflict', '这个用户名已经注册。', 409)
    }
    throw error
  }

  const students = await listTeacherStudents(teacher.userId)
  const student = students.find((item) => item.id === studentUserId)
  if (!student) throw new ServiceError('internal_error', '学生账号已创建，但绑定关系读取失败。', 500)
  return student
}

export async function updateTeacherStudentLearningProfile(input: TeacherStudentProfileUpdateInput): Promise<TeacherStudentSummary> {
  const teacher = await requireTeacher(input.teacherUserId)
  await requireTeacherManagesStudent({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })

  const displayName = input.displayName.trim()
  if (!displayName) throw new ServiceError('bad_request', '学生姓名不能为空。', 400)
  if (input.age !== null && (!Number.isInteger(input.age) || input.age < 0 || input.age > 120)) {
    throw new ServiceError('bad_request', '年龄不合法。', 400)
  }
  const idCardNumber = normalizeIdCardNumber(input.idCardNumber)

  await updateTeacherStudentProfile({
    teacherUserId: teacher.userId,
    profile: {
      studentUserId: input.studentUserId,
      displayName,
      age: input.age,
      realName: normalizeNullableText(input.realName),
      idCardNumber,
      parentEmail: normalizeNullableText(input.parentEmail),
      studentEnrollmentType: input.studentEnrollmentType ?? null,
      teacherNote: normalizeNullableText(input.teacherNote),
    },
  })

  const students = await listTeacherStudents(teacher.userId)
  const student = students.find((item) => item.id === input.studentUserId)
  if (!student) throw new ServiceError('internal_error', '学生资料已保存，但读取失败。', 500)
  return student
}

export async function removeStudentFromTeacher(input: {
  teacherUserId?: string | null
  studentUserId: string
}): Promise<void> {
  const teacher = await requireTeacher(input.teacherUserId)
  await requireTeacherCanAccessStudent({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })
  await removeTeacherStudent({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })
}

export async function shareStudentWithTeacher(input: {
  teacherUserId?: string | null
  studentUserId: string
  targetTeacherIdentifier: string
}): Promise<void> {
  const teacher = await requireTeacher(input.teacherUserId)
  await requireTeacherManagesStudent({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })

  const target = await findUserByIdentifier(input.targetTeacherIdentifier)
  if (!target) throw new ServiceError('not_found', '没有找到这个老师账号。', 404)
  if (target.id === teacher.userId) throw new ServiceError('bad_request', '不能共享给自己。', 400)
  if (target.role !== 'teacher') throw new ServiceError('bad_request', '只能共享给老师账号。', 400)
  if (target.accountStatus !== 'active') throw new ServiceError('bad_request', '只能共享给 active 状态的老师。', 400)

  await shareTeacherStudent({
    ownerTeacherUserId: teacher.userId,
    targetTeacherUserId: target.id,
    studentUserId: input.studentUserId,
  })
}

export async function revokeStudentTeacherShare(input: {
  teacherUserId?: string | null
  studentUserId: string
  targetTeacherUserId: string
}): Promise<void> {
  const teacher = await requireTeacher(input.teacherUserId)
  await requireTeacherManagesStudent({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })
  if (input.targetTeacherUserId === teacher.userId) {
    throw new ServiceError('bad_request', '不能在共享列表中移除主老师。', 400)
  }
  await revokeTeacherStudentViewer({
    targetTeacherUserId: input.targetTeacherUserId,
    studentUserId: input.studentUserId,
  })
}

export async function getTeacherStudentSharedTeachers(input: {
  teacherUserId?: string | null
  studentUserId: string
}): Promise<TeacherSharedTeacher[]> {
  const teacher = await requireTeacher(input.teacherUserId)
  await requireTeacherCanAccessStudent({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })
  return listStudentSharedTeachers(input.studentUserId)
}

export async function requireTeacherCanAccessStudent(input: {
  teacherUserId?: string | null
  studentUserId: string
}): Promise<TeacherStudentAccess> {
  const teacher = await requireTeacher(input.teacherUserId)
  if (teacher.role === 'admin') {
    return {
      teacherUserId: teacher.userId,
      role: teacher.role,
      accessLevel: 'owner',
      canManage: true,
    }
  }
  const relation = await getTeacherStudentRelation({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })
  if (!relation) throw new ServiceError('forbidden', '不能访问不属于你的学生。', 403)
  return relationToAccess(teacher, relation)
}

export async function requireTeacherManagesStudent(input: {
  teacherUserId?: string | null
  studentUserId: string
}): Promise<TeacherStudentAccess> {
  const access = await requireTeacherCanAccessStudent(input)
  if (!access.canManage) {
    throw new ServiceError('forbidden', '共享老师只能查看学生信息，不能修改。', 403)
  }
  return access
}

export async function requireTeacherOwnsStudent(input: {
  teacherUserId?: string | null
  studentUserId: string
}): Promise<void> {
  await requireTeacherCanAccessStudent(input)
}

export async function getTeacherStudentCurrentLevel(input: {
  teacherUserId?: string | null
  studentUserId: string
}): Promise<StudentCurrentLevelSummary | null> {
  const teacher = await requireTeacher(input.teacherUserId)
  await requireTeacherCanAccessStudent({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })
  return getStudentCurrentLevelSummary(input.studentUserId)
}

export async function setTeacherStudentCurrentLevel(input: {
  teacherUserId?: string | null
  studentUserId: string
  levelId: string
}): Promise<StudentCurrentLevelSummary> {
  const teacher = await requireTeacher(input.teacherUserId)
  await requireTeacherManagesStudent({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })
  return setStudentCurrentLevel({
    studentUserId: input.studentUserId,
    levelId: input.levelId,
    assignedBy: teacher.userId,
    reason: 'teacher_current_level_override',
  })
}

export async function getTeacherStudentProgress(input: {
  teacherUserId?: string | null
  studentUserId: string
}): Promise<StudentProgressSummary[]> {
  const teacher = await requireTeacher(input.teacherUserId)
  await requireTeacherCanAccessStudent({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })
  return listStudentProgressForTeacher({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })
}

export async function getTeacherStudentSubmissions(input: {
  teacherUserId?: string | null
  studentUserId: string
  limit?: number
}): Promise<StudentSubmissionSummary[]> {
  const teacher = await requireTeacher(input.teacherUserId)
  await requireTeacherCanAccessStudent({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })
  return listStudentSubmissionsForTeacher({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
    limit: input.limit,
  })
}

export async function getTeacherSubmissionHistory(input: Omit<TeacherSubmissionFilters, 'teacherUserId'> & {
  teacherUserId?: string | null
}): Promise<TeacherSubmissionHistoryItem[]> {
  const teacher = await requireTeacher(input.teacherUserId)
  return listTeacherSubmissionHistory({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
    spcgLevel: input.spcgLevel,
    levelId: input.levelId,
    result: input.result,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    limit: input.limit,
  })
}

export async function teacherCanAccessSubmission(input: {
  teacherUserId?: string | null
  submissionUserId: string
}): Promise<boolean> {
  const teacher = await requireTeacher(input.teacherUserId)
  if (teacher.role === 'admin') return true
  return teacherOwnsStudent(teacher.userId, input.submissionUserId)
}

function relationToAccess(
  teacher: { userId: string; role: UserRole },
  relation: TeacherStudentRelation,
): TeacherStudentAccess {
  return {
    teacherUserId: teacher.userId,
    role: teacher.role,
    accessLevel: relation.accessLevel,
    canManage: relation.accessLevel === 'owner',
  }
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

function normalizeIdCardNumber(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toUpperCase() ?? ''
  if (!trimmed) return null
  if (!/^[0-9X]{15,18}$/.test(trimmed)) {
    throw new ServiceError('bad_request', '身份证号码格式不合法。', 400)
  }
  return trimmed
}

function isUniqueTeacherConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}
