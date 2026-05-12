import type { StudentParentInviteResetResult, StudentParentInviteSummary } from '@spcg/shared/types'
import {
  getStudentParentInviteSummaryRecord,
  resetStudentParentInviteRecord,
} from '@/lib/repositories/student-parent-invite-repository'
import { getUserRole } from '@/lib/repositories/user-repository'
import { ServiceError } from '@/lib/services/errors'
import { requireTeacherManagesStudent } from '@/lib/services/teacher-service'

export async function getMyParentInviteSummary(userId?: string | null): Promise<StudentParentInviteSummary | null> {
  if (!userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  const role = await getUserRole(userId)
  if (role !== 'student') {
    throw new ServiceError('forbidden', '只有学生账号可以查看自己的家长绑定信息。', 403)
  }
  return getStudentParentInviteSummaryRecord(userId)
}

export async function resetStudentParentInviteForTeacher(input: {
  teacherUserId?: string | null
  studentUserId: string
}): Promise<StudentParentInviteResetResult> {
  const access = await requireTeacherManagesStudent({
    teacherUserId: input.teacherUserId,
    studentUserId: input.studentUserId,
  })
  return resetStudentParentInviteRecord({
    studentUserId: input.studentUserId,
    rotatedBy: access.teacherUserId,
  })
}
