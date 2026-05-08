import type { UserRole } from '@spcg/shared/types'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  addTeacherStudent,
  createStudentAccountForTeacher,
  listStudentProgressForTeacher,
  listStudentSubmissionsForTeacher,
  listTeacherStudents,
  removeTeacherStudent,
  teacherOwnsStudent,
  type StudentProgressSummary,
  type StudentSubmissionSummary,
  type TeacherStudentSummary,
} from '@/lib/repositories/teacher-repository'
import { findUserByIdentifier, getUserRole } from '@/lib/repositories/user-repository'
import { hashPassword } from '@/lib/password'
import {
  getStudentCurrentLevelSummary,
  setStudentCurrentLevel,
  type StudentCurrentLevelSummary,
} from '@/lib/services/level-access-service'
import { ServiceError } from '@/lib/services/errors'

export type TeacherDashboard = {
  students: TeacherStudentSummary[]
  totalPassed: number
  totalSubmissions: number
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
  const students = await listTeacherStudents(teacher.userId)
  return {
    students,
    totalPassed: students.reduce((sum, student) => sum + student.passedCount, 0),
    totalSubmissions: students.reduce((sum, student) => sum + student.submissionCount, 0),
  }
}

export async function getTeacherStudents(userId?: string | null): Promise<TeacherStudentSummary[]> {
  const teacher = await requireTeacher(userId)
  return listTeacherStudents(teacher.userId)
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
      throw new ServiceError('conflict', '该学生已经归属于其他老师。', 409)
    }
    throw error
  }

  const students = await listTeacherStudents(teacher.userId)
  return students.find((item) => item.id === student.id) ?? {
    ...student,
    passedCount: 0,
    submissionCount: 0,
    linkedAt: new Date().toISOString(),
  }
}

export async function createStudentForTeacher(input: {
  teacherUserId?: string | null
  email: string
  password: string
  displayName: string
  parentEmail?: string | null
  age?: number | null
}): Promise<TeacherStudentSummary> {
  const teacher = await requireTeacher(input.teacherUserId)
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()
  if (!isEmail(email) || displayName.length === 0 || input.password.length < 8) {
    throw new ServiceError('bad_request', '学生邮箱、姓名或密码不合法。', 400)
  }

  const passwordHash = await hashPassword(input.password)
  let studentUserId = ''
  try {
    studentUserId = await createStudentAccountForTeacher({
      teacherUserId: teacher.userId,
      email,
      passwordHash,
      displayName,
      parentEmail: input.parentEmail ?? null,
      age: input.age ?? null,
    })
  } catch (error) {
    if (isUniqueTeacherConflict(error)) {
      throw new ServiceError('conflict', '这个邮箱已经注册。', 409)
    }
    throw error
  }

  const students = await listTeacherStudents(teacher.userId)
  const student = students.find((item) => item.id === studentUserId)
  if (!student) throw new ServiceError('internal_error', '学生账号已创建，但绑定关系读取失败。', 500)
  return student
}

export async function removeStudentFromTeacher(input: {
  teacherUserId?: string | null
  studentUserId: string
}): Promise<void> {
  const teacher = await requireTeacher(input.teacherUserId)
  await requireTeacherOwnsStudent({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })
  await removeTeacherStudent({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })
}

export async function requireTeacherOwnsStudent(input: {
  teacherUserId?: string | null
  studentUserId: string
}): Promise<void> {
  const teacher = await requireTeacher(input.teacherUserId)
  if (teacher.role === 'admin') return
  const owns = await teacherOwnsStudent(teacher.userId, input.studentUserId)
  if (!owns) throw new ServiceError('forbidden', '不能访问不属于你的学生。', 403)
}

export async function getTeacherStudentCurrentLevel(input: {
  teacherUserId?: string | null
  studentUserId: string
}): Promise<StudentCurrentLevelSummary | null> {
  const teacher = await requireTeacher(input.teacherUserId)
  await requireTeacherOwnsStudent({
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
  await requireTeacherOwnsStudent({
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
  await requireTeacherOwnsStudent({
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
  await requireTeacherOwnsStudent({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
  })
  return listStudentSubmissionsForTeacher({
    teacherUserId: teacher.userId,
    studentUserId: input.studentUserId,
    limit: input.limit,
  })
}

function isUniqueTeacherConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}
