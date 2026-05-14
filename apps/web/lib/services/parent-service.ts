import type { ParentStudentBinding, UserRole } from '@spcg/shared/types'
import {
  bindParentToStudent,
  createParentAccountForStudent,
  listParentsForStudent,
  parentOwnsStudent,
  removeParentStudentBinding,
} from '@/lib/repositories/parent-repository'
import { findUserByIdentifier, getUserRole } from '@/lib/repositories/user-repository'
import { hashPassword } from '@/lib/password'
import { isValidPhoneNumber, isValidUsername, normalizePhoneNumber, normalizeUsername } from '@/lib/user-identity'
import { ServiceError } from '@/lib/services/errors'
import { requireTeacherCanAccessStudent, requireTeacherManagesStudent } from '@/lib/services/teacher-service'

export async function requireParent(userId?: string | null): Promise<{ userId: string; role: UserRole }> {
  if (!userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  const role = await getUserRole(userId)
  if (role !== 'parent' && role !== 'admin') {
    throw new ServiceError('forbidden', '需要家长权限。', 403)
  }
  return { userId, role }
}

export async function requireParentOwnsStudent(input: {
  parentUserId?: string | null
  studentUserId: string
}): Promise<void> {
  const parent = await requireParent(input.parentUserId)
  if (parent.role === 'admin') return
  const owns = await parentOwnsStudent(parent.userId, input.studentUserId)
  if (!owns) throw new ServiceError('forbidden', '不能访问未绑定的学生。', 403)
}

export async function getParentsForTeacherStudent(input: {
  teacherUserId?: string | null
  studentUserId: string
}): Promise<ParentStudentBinding[]> {
  const access = await requireTeacherCanAccessStudent(input)
  return listParentsForStudent(input.studentUserId)
}

export async function createParentForTeacherStudent(input: {
  teacherUserId?: string | null
  studentUserId: string
  username: string
  password: string
  displayName: string
  email?: string | null
  phoneNumber?: string | null
  note?: string | null
}): Promise<ParentStudentBinding[]> {
  const access = await requireTeacherManagesStudent(input)
  const username = normalizeUsername(input.username)
  const displayName = input.displayName.trim()
  const email = normalizeOptionalEmail(input.email)
  const phoneNumber = normalizeOptionalPhone(input.phoneNumber)
  const note = normalizeNullableText(input.note)

  if (!isValidUsername(username)) throw new ServiceError('bad_request', '家长用户名不合法。', 400)
  if (!displayName) throw new ServiceError('bad_request', '家长姓名不能为空。', 400)
  if (input.password.length < 8) throw new ServiceError('bad_request', '临时密码至少需要 8 位。', 400)
  await requireStudentHasNoActiveParent(input.studentUserId)

  const passwordHash = await hashPassword(input.password)
  try {
    await createParentAccountForStudent({
      teacherUserId: access.teacherUserId,
      studentUserId: input.studentUserId,
      username,
      email,
      phoneNumber,
      passwordHash,
      displayName,
      note,
    })
  } catch (error) {
    if (isUniqueConflict(error)) throw new ServiceError('conflict', '家长用户名或邮箱已存在。', 409)
    throw error
  }
  return listParentsForStudent(input.studentUserId)
}

export async function bindExistingParentToTeacherStudent(input: {
  teacherUserId?: string | null
  studentUserId: string
  parentIdentifier: string
  note?: string | null
}): Promise<ParentStudentBinding[]> {
  const access = await requireTeacherManagesStudent(input)
  const parent = await findUserByIdentifier(input.parentIdentifier)
  if (!parent) throw new ServiceError('not_found', '没有找到这个家长账号。', 404)
  if (parent.role !== 'parent') throw new ServiceError('bad_request', '只能绑定 parent 角色账号。', 400)
  if (parent.accountStatus !== 'active') throw new ServiceError('bad_request', '只能绑定 active 状态的家长账号。', 400)
  if (parent.id === input.studentUserId) throw new ServiceError('bad_request', '家长账号不能和学生相同。', 400)
  await requireStudentHasNoActiveParent(input.studentUserId)

  await bindParentToStudent({
    parentUserId: parent.id,
    studentUserId: input.studentUserId,
    createdBy: access.teacherUserId,
    note: normalizeNullableText(input.note),
  })
  return listParentsForStudent(input.studentUserId)
}

export async function removeParentFromTeacherStudent(input: {
  teacherUserId?: string | null
  studentUserId: string
  parentUserId: string
}): Promise<void> {
  await requireTeacherManagesStudent(input)
  await removeParentStudentBinding({
    parentUserId: input.parentUserId,
    studentUserId: input.studentUserId,
  })
}

function normalizeOptionalEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? ''
  if (!trimmed) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new ServiceError('bad_request', '家长邮箱格式不正确。', 400)
  }
  return trimmed
}

function normalizeOptionalPhone(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null
  const normalized = normalizePhoneNumber(trimmed)
  if (!isValidPhoneNumber(normalized)) {
    throw new ServiceError('bad_request', '家长手机号格式不正确。', 400)
  }
  return normalized
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed : null
}

async function requireStudentHasNoActiveParent(studentUserId: string): Promise<void> {
  const parents = await listParentsForStudent(studentUserId)
  if (parents.length > 0) {
    throw new ServiceError('conflict', '该学生已经绑定家长，目前仅支持绑定一个家长。', 409)
  }
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}
