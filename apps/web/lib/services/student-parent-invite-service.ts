import type { StudentParentInviteResetResult, StudentParentInviteSummary } from '@spcg/shared/types'
import {
  createDefaultStudentParentInvite,
  ensureRevealableStudentParentInviteRecord,
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
  const summary = await getStudentParentInviteSummaryRecord(userId)
  if (!summary) return summary
  if (summary.boundParentCount > 0) return hideInviteCode(summary)
  if (summary.inviteStatus === 'revoked' || summary.inviteCode) return summary

  const generated =
    summary.inviteStatus === 'missing'
      ? await createDefaultStudentParentInvite({ studentUserId: userId, createdBy: userId })
      : await ensureRevealableStudentParentInviteRecord({ studentUserId: userId, repairedBy: userId })
  const refreshed = await getStudentParentInviteSummaryRecord(userId)
  if (!generated) return refreshed ?? summary
  return {
    ...(refreshed ?? summary),
    inviteStatus: 'active',
    inviteCode: generated.inviteCode,
    codePreview: generated.codePreview,
    rotatedAt: generated.rotatedAt,
    canRevealCode: true,
  }
}

export async function resetStudentParentInviteForTeacher(input: {
  teacherUserId?: string | null
  studentUserId: string
}): Promise<StudentParentInviteResetResult> {
  const access = await requireTeacherManagesStudent({
    teacherUserId: input.teacherUserId,
    studentUserId: input.studentUserId,
  })
  const summary = await getStudentParentInviteSummaryRecord(input.studentUserId)
  if ((summary?.boundParentCount ?? 0) > 0) {
    throw new ServiceError('conflict', '该学生已经绑定家长，不能再生成新的家长邀请码。', 409)
  }
  return resetStudentParentInviteRecord({
    studentUserId: input.studentUserId,
    rotatedBy: access.teacherUserId,
  })
}

function hideInviteCode(summary: StudentParentInviteSummary): StudentParentInviteSummary {
  return {
    ...summary,
    inviteCode: null,
    canRevealCode: false,
  }
}
