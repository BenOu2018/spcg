import type { AccessDecision, EntitlementSummary, FeatureKey, StudentEnrollmentType, StudentUserType, UserRole } from '@spcg/shared/types'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  createUpgradeRequestRecord,
  getStudentEnrollmentTypeRecord,
  getUserEntitlementRecord,
  setUserEntitlementRecord,
  type UpgradeRequestRecord,
} from '@/lib/repositories/entitlement-repository'
import { getUserRole } from '@/lib/repositories/user-repository'
import { teacherHasOwnerAccess } from '@/lib/repositories/teacher-repository'
import { ServiceError } from '@/lib/services/errors'

export const STUDENT_USER_TYPE_LABELS: Record<StudentUserType, string> = {
  experience: '体验用户',
  invite_test: '邀请测试用户',
  paid_49: '完整课程',
  paid_99: '高级学习',
}

export const STUDENT_USER_TYPE_OPTIONS: Array<{ value: StudentUserType; label: string; description: string }> = [
  { value: 'experience', label: STUDENT_USER_TYPE_LABELS.experience, description: '开放第 1 级第 1-5 关，1级段位赛只显示前 2 题。' },
  { value: 'invite_test', label: STUDENT_USER_TYPE_LABELS.invite_test, description: '开放第 1-2 级全部关卡和段位赛。' },
  { value: 'paid_49', label: STUDENT_USER_TYPE_LABELS.paid_49, description: '开放全部关卡和全部段位赛。' },
  { value: 'paid_99', label: STUDENT_USER_TYPE_LABELS.paid_99, description: '开放全部关卡、段位赛、提示、AI 分析和家长报告。' },
]

const FEATURE_REQUIREMENTS: Partial<Record<FeatureKey, StudentUserType>> = {
  levels_all: 'paid_49',
  ranked_all: 'paid_49',
  hints: 'paid_99',
  ai_analysis: 'paid_99',
  parent_reports: 'paid_99',
}

const UPGRADE_ORDER: Record<StudentUserType, number> = {
  experience: 0,
  invite_test: 1,
  paid_49: 2,
  paid_99: 3,
}

export type RankedAssessmentAccessDecision = AccessDecision & {
  visibleQuestionCount: number
  fullQuestionCount: number
}

export async function getUserEntitlement(userId: string | null | undefined) {
  if (!userId || !isDatabaseConfigured()) return buildDefaultEntitlement(userId ?? '')
  const [record, studentEnrollmentType] = await Promise.all([
    getUserEntitlementRecord(userId),
    getStudentEnrollmentTypeRecord(userId),
  ])
  return applyEnrollmentEntitlement(record ?? buildDefaultEntitlement(userId), studentEnrollmentType)
}

export async function getFeatureAccess(input: {
  userId?: string | null
  feature: FeatureKey
}): Promise<AccessDecision> {
  if (!isDatabaseConfigured()) return allowed(null)
  if (!input.userId) return denied('当前未登录。', null, true, 'experience')
  const role = await getUserRole(input.userId)
  if (role === 'admin' || role === 'teacher') return allowed(null)

  const entitlement = await getUserEntitlement(input.userId)
  const required = FEATURE_REQUIREMENTS[input.feature]
  if (!required || hasUserTypeAtLeast(entitlement.userType, required)) {
    return allowed(entitlement.userType)
  }

  return denied('暂不支持此功能，升级套餐后继续。', required, true, entitlement.userType)
}

export async function requireFeatureAccess(input: { userId?: string | null; feature: FeatureKey }): Promise<void> {
  const decision = await getFeatureAccess(input)
  if (!decision.allowed) {
    throw new ServiceError('forbidden', decision.reason ?? '当前用户类型无法使用该功能。', 403)
  }
}

export async function getLevelEntitlementAccess(input: {
  userId: string
  role: UserRole
  spcgLevel: number
  stageNo: number | null
}): Promise<AccessDecision> {
  if (!isDatabaseConfigured()) return allowed(null)
  if (input.role === 'admin' || input.role === 'teacher') return allowed(null)

  const entitlement = await getUserEntitlement(input.userId)
  const userType = entitlement.userType
  if (userType === 'paid_49' || userType === 'paid_99') return allowed(userType)

  if (userType === 'invite_test') {
    if (input.spcgLevel <= 2) return allowed(userType)
    return denied('邀请测试用户开放第 1-2 级；第 3 级及以后需要升级为付费用户。', 'paid_49', true, userType)
  }

  if (input.spcgLevel === 1 && (input.stageNo ?? 999) <= 5) return allowed(userType)
  return denied('体验用户开放第 1 级第 1-5 关；继续学习请申请升级。', 'invite_test', true, userType)
}

export async function getRankedAssessmentAccess(input: {
  userId?: string | null
  spcgLevel: number
}): Promise<RankedAssessmentAccessDecision> {
  const fullQuestionCount = 6
  if (!isDatabaseConfigured()) return rankedAllowed(null, fullQuestionCount, fullQuestionCount)
  if (!input.userId) {
    return rankedDenied('当前未登录。', 'experience', null, fullQuestionCount)
  }

  const role = await getUserRole(input.userId)
  if (role === 'admin' || role === 'teacher') {
    return rankedAllowed(null, fullQuestionCount, fullQuestionCount)
  }

  const entitlement = await getUserEntitlement(input.userId)
  const userType = entitlement.userType
  if (userType === 'paid_49' || userType === 'paid_99') {
    return rankedAllowed(userType, fullQuestionCount, fullQuestionCount)
  }

  if (userType === 'invite_test') {
    if (input.spcgLevel <= 2) return rankedAllowed(userType, fullQuestionCount, fullQuestionCount)
    return rankedDenied('邀请测试用户开放第 1-2 级段位赛；第 3 级及以后需要升级为付费用户。', 'paid_49', userType, fullQuestionCount)
  }

  if (input.spcgLevel === 1) {
    return rankedAllowed(userType, 2, fullQuestionCount)
  }
  return rankedDenied('体验用户只开放第 1 级段位赛体验；更多级别请申请升级。', 'invite_test', userType, fullQuestionCount)
}

export async function setStudentUserType(input: {
  actorUserId?: string | null
  studentUserId: string
  userType: StudentUserType
  note?: string | null
}) {
  if (!input.actorUserId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (!isStudentUserType(input.userType)) throw new ServiceError('bad_request', '用户类型不正确。', 400)

  const [actorRole, studentRole] = await Promise.all([
    getUserRole(input.actorUserId),
    getUserRole(input.studentUserId),
  ])
  if (studentRole !== 'student') throw new ServiceError('bad_request', '只能设置学生账号的用户类型。', 400)

  if (actorRole !== 'admin') {
    if (actorRole !== 'teacher') throw new ServiceError('forbidden', '需要管理员或主老师权限。', 403)
    const owns = await teacherHasOwnerAccess(input.actorUserId, input.studentUserId)
    if (!owns) throw new ServiceError('forbidden', '只有主老师可以设置学生用户类型。', 403)
  }

  const updated = await setUserEntitlementRecord({
    actorUserId: input.actorUserId,
    actorRole,
    studentUserId: input.studentUserId,
    userType: input.userType,
    note: input.note ?? null,
  })
  const studentEnrollmentType = await getStudentEnrollmentTypeRecord(input.studentUserId)
  return applyEnrollmentEntitlement(updated, studentEnrollmentType)
}

export async function createUpgradeRequest(input: {
  userId?: string | null
  targetPlan: StudentUserType
  message?: string | null
}): Promise<UpgradeRequestRecord> {
  if (!input.userId) throw new ServiceError('unauthorized', '当前未登录。', 401)
  if (input.targetPlan === 'experience' || !isStudentUserType(input.targetPlan)) {
    throw new ServiceError('bad_request', '升级目标不正确。', 400)
  }
  const role = await getUserRole(input.userId)
  if (role !== 'student') throw new ServiceError('bad_request', '只有学生账号可以提交升级申请。', 400)
  const studentEnrollmentType = await getStudentEnrollmentTypeRecord(input.userId)
  if (studentEnrollmentType === 'offline') {
    throw new ServiceError('bad_request', '线下学员已自动拥有最高级会员权益，无需提交升级申请。', 400)
  }
  return createUpgradeRequestRecord({
    userId: input.userId,
    targetUserType: input.targetPlan,
    message: input.message ?? null,
  })
}

export function hasUserTypeAtLeast(current: StudentUserType, required: StudentUserType): boolean {
  return UPGRADE_ORDER[current] >= UPGRADE_ORDER[required]
}

export function isStudentUserType(value: unknown): value is StudentUserType {
  return value === 'experience' || value === 'invite_test' || value === 'paid_49' || value === 'paid_99'
}

function buildDefaultEntitlement(userId: string): EntitlementSummary {
  return {
    userId,
    userType: 'experience' as const,
    storedUserType: 'experience' as const,
    effectiveUserType: 'experience' as const,
    entitlementSource: 'stored' as const,
    studentEnrollmentType: 'online' as const,
    label: STUDENT_USER_TYPE_LABELS.experience,
    note: null,
    expiresAt: null,
    updatedAt: null,
  }
}

function applyEnrollmentEntitlement(
  entitlement: EntitlementSummary,
  studentEnrollmentType: StudentEnrollmentType,
): EntitlementSummary {
  const storedUserType = entitlement.storedUserType ?? entitlement.userType
  if (studentEnrollmentType === 'offline') {
    return {
      ...entitlement,
      userType: 'paid_99' as const,
      storedUserType,
      effectiveUserType: 'paid_99' as const,
      entitlementSource: 'offline_enrollment' as const,
      studentEnrollmentType,
      label: STUDENT_USER_TYPE_LABELS.paid_99,
    }
  }

  return {
    ...entitlement,
    userType: storedUserType,
    storedUserType,
    effectiveUserType: storedUserType,
    entitlementSource: 'stored' as const,
    studentEnrollmentType,
    label: STUDENT_USER_TYPE_LABELS[storedUserType],
  }
}

function allowed(userType: StudentUserType | null): AccessDecision {
  return {
    allowed: true,
    reason: null,
    upgradeRequired: false,
    requiredUserType: null,
    userType,
  }
}

function denied(
  reason: string,
  requiredUserType: StudentUserType | null,
  upgradeRequired: boolean,
  userType: StudentUserType | null,
): AccessDecision {
  return {
    allowed: false,
    reason,
    upgradeRequired,
    requiredUserType,
    userType,
  }
}

function rankedAllowed(
  userType: StudentUserType | null,
  visibleQuestionCount: number,
  fullQuestionCount: number,
): RankedAssessmentAccessDecision {
  return {
    ...allowed(userType),
    visibleQuestionCount,
    fullQuestionCount,
  }
}

function rankedDenied(
  reason: string,
  requiredUserType: StudentUserType | null,
  userType: StudentUserType | null,
  fullQuestionCount: number,
): RankedAssessmentAccessDecision {
  return {
    ...denied(reason, requiredUserType, true, userType),
    visibleQuestionCount: 0,
    fullQuestionCount,
  }
}
