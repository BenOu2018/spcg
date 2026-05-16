'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { auth } from '@/auth'
import {
  addStudentToTeacher,
  createStudentForTeacher,
  removeStudentFromTeacher,
  revokeStudentTeacherShare,
  setTeacherStudentCurrentLevel,
  shareStudentWithTeacher,
  updateTeacherStudentLearningProfile,
} from '@/lib/services/teacher-service'
import {
  bindExistingParentToTeacherStudent,
  createParentForTeacherStudent,
  removeParentFromTeacherStudent,
} from '@/lib/services/parent-service'
import {
  deleteBehaviorAnalysisForTeacherStudent,
  generateBehaviorAnalysisForTeacherStudent,
} from '@/lib/services/behavior-analytics-service'
import { toServiceError } from '@/lib/services/errors'
import { completeGrowthReportGeneration, generateGrowthReportForTeacherStudent } from '@/lib/services/growth-report-service'
import { explainSubmissionErrorForTeacher } from '@/lib/services/submission-error-analysis-service'
import { resetStudentParentInviteForTeacher } from '@/lib/services/student-parent-invite-service'
import { isStudentUserType, setStudentUserType } from '@/lib/services/entitlement-service'
import { isStudentEnrollmentType } from '@/lib/student-enrollment'

export async function addTeacherStudentAction(formData: FormData) {
  const session = await auth()
  const studentIdentifier = String(formData.get('studentIdentifier') ?? '').trim()
  if (!studentIdentifier) throw new Error('Student username or id is required')

  await addStudentToTeacher({
    teacherUserId: session?.user?.id,
    studentIdentifier,
  })

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
}

export async function createTeacherStudentAction(formData: FormData) {
  const session = await auth()
  const username = String(formData.get('username') ?? '').trim()
  const displayName = String(formData.get('displayName') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const ageValue = String(formData.get('age') ?? '').trim()
  const age = ageValue ? Number(ageValue) : null
  const parentEmail = String(formData.get('parentEmail') ?? '').trim()
  const studentEnrollmentTypeValue = String(formData.get('studentEnrollmentType') ?? '').trim()

  try {
    await createStudentForTeacher({
      teacherUserId: session?.user?.id,
      username,
      displayName,
      password,
      age: Number.isInteger(age) ? age : null,
      parentEmail: parentEmail || null,
      studentEnrollmentType: isStudentEnrollmentType(studentEnrollmentTypeValue) ? studentEnrollmentTypeValue : null,
    })
  } catch (error) {
    const serviceError = toServiceError(error)
    if (serviceError.status < 500) {
      redirectToTeacherStudentCreateError(serviceError.message)
    }
    throw error
  }

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
}

function redirectToTeacherStudentCreateError(message: string): never {
  const params = new URLSearchParams({
    drawer: 'create',
    createError: message.slice(0, 300),
  })
  redirect(`/teacher/students?${params.toString()}`)
}

export async function removeTeacherStudentAction(formData: FormData) {
  const session = await auth()
  const studentUserId = String(formData.get('studentUserId') ?? '').trim()
  if (!studentUserId) throw new Error('Student id is required')

  await removeStudentFromTeacher({
    teacherUserId: session?.user?.id,
    studentUserId,
  })

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
  redirect('/teacher/students')
}

export async function setTeacherStudentCurrentLevelAction(formData: FormData) {
  const session = await auth()
  const studentUserId = String(formData.get('studentUserId') ?? '').trim()
  const levelId = String(formData.get('levelId') ?? '').trim()
  const returnTo = String(formData.get('returnTo') ?? '').trim()
  if (!studentUserId || !levelId) throw new Error('Student id and level id are required')

  try {
    await setTeacherStudentCurrentLevel({
      teacherUserId: session?.user?.id,
      studentUserId,
      levelId,
    })
  } catch (error) {
    const serviceError = toServiceError(error)
    if (serviceError.status < 500) {
      redirect(
        buildTeacherStudentCurrentLevelReturnHref({
          studentUserId,
          returnTo,
          status: 'error',
          message: serviceError.message,
        }),
      )
    }
    throw error
  }

  revalidatePath(`/teacher/students/${studentUserId}`)
  redirect(
    buildTeacherStudentCurrentLevelReturnHref({
      studentUserId,
      returnTo,
      status: 'saved',
      message: '当前关卡已保存。',
    }),
  )
}

function buildTeacherStudentCurrentLevelReturnHref(input: {
  studentUserId: string
  returnTo: string
  status: 'saved' | 'error'
  message: string
}) {
  const fallback = `/teacher/students/${encodeURIComponent(input.studentUserId)}?tab=settings`
  const base = input.returnTo.startsWith(`/teacher/students/${input.studentUserId}`) ? input.returnTo : fallback
  const [path, query = ''] = base.split('?')
  const params = new URLSearchParams(query)
  params.set('tab', params.get('tab') ?? 'settings')
  params.set('drawer', 'current-level')
  params.set('currentLevelStatus', input.status)
  params.set('currentLevelMessage', input.message.slice(0, 300))
  return `${path}?${params.toString()}`
}

export async function setTeacherStudentUserTypeAction(formData: FormData) {
  const session = await auth()
  const studentUserId = String(formData.get('studentUserId') ?? '').trim()
  const userType = String(formData.get('userType') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()
  if (!studentUserId || !isStudentUserType(userType)) throw new Error('Student id and user type are required')

  await setStudentUserType({
    actorUserId: session?.user?.id,
    studentUserId,
    userType,
    note: note || null,
  })

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
  revalidatePath(`/teacher/students/${studentUserId}`)
}

export async function updateTeacherStudentProfileAction(formData: FormData) {
  const session = await auth()
  const studentUserId = String(formData.get('studentUserId') ?? '').trim()
  const displayName = String(formData.get('displayName') ?? '').trim()
  const ageValue = String(formData.get('age') ?? '').trim()
  const realName = String(formData.get('realName') ?? '').trim()
  const idCardNumber = String(formData.get('idCardNumber') ?? '').trim()
  const parentEmail = String(formData.get('parentEmail') ?? '').trim()
  const studentEnrollmentTypeValue = String(formData.get('studentEnrollmentType') ?? '').trim()
  const teacherNote = String(formData.get('teacherNote') ?? '').trim()
  const age = ageValue ? Number(ageValue) : null
  if (!studentUserId) throw new Error('Student id is required')

  await updateTeacherStudentLearningProfile({
    teacherUserId: session?.user?.id,
    studentUserId,
    displayName,
    age: Number.isInteger(age) ? age : null,
    realName: realName || null,
    idCardNumber: idCardNumber || null,
    parentEmail: parentEmail || null,
    studentEnrollmentType: isStudentEnrollmentType(studentEnrollmentTypeValue) ? studentEnrollmentTypeValue : null,
    teacherNote: teacherNote || null,
  })

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
  revalidatePath(`/teacher/students/${studentUserId}`)
}

export async function shareTeacherStudentAction(formData: FormData) {
  const session = await auth()
  const studentUserId = String(formData.get('studentUserId') ?? '').trim()
  const targetTeacherIdentifier = String(formData.get('targetTeacherIdentifier') ?? '').trim()
  if (!studentUserId || !targetTeacherIdentifier) throw new Error('Student id and teacher username are required')

  await shareStudentWithTeacher({
    teacherUserId: session?.user?.id,
    studentUserId,
    targetTeacherIdentifier,
  })

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
  revalidatePath(`/teacher/students/${studentUserId}`)
}

export async function revokeTeacherStudentShareAction(formData: FormData) {
  const session = await auth()
  const studentUserId = String(formData.get('studentUserId') ?? '').trim()
  const targetTeacherUserId = String(formData.get('targetTeacherUserId') ?? '').trim()
  if (!studentUserId || !targetTeacherUserId) throw new Error('Student id and teacher id are required')

  await revokeStudentTeacherShare({
    teacherUserId: session?.user?.id,
    studentUserId,
    targetTeacherUserId,
  })

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
  revalidatePath(`/teacher/students/${studentUserId}`)
}

export async function explainTeacherSubmissionErrorAction(input: { submissionId: string }) {
  const session = await auth()
  const result = await explainSubmissionErrorForTeacher({
    teacherUserId: session?.user?.id,
    submissionId: input.submissionId,
  })

  if (result.ok) {
    revalidatePath('/teacher/submissions')
    revalidatePath('/teacher/students')
  }

  return result
}

export async function createParentForStudentAction(formData: FormData) {
  const session = await auth()
  const studentUserId = String(formData.get('studentUserId') ?? '').trim()
  const username = String(formData.get('username') ?? '').trim()
  const displayName = String(formData.get('displayName') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const email = String(formData.get('email') ?? '').trim()
  const phoneNumber = String(formData.get('phoneNumber') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()
  if (!studentUserId) throw new Error('Student id is required')

  await createParentForTeacherStudent({
    teacherUserId: session?.user?.id,
    studentUserId,
    username,
    displayName,
    password,
    email: email || null,
    phoneNumber: phoneNumber || null,
    note: note || null,
  })

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
  revalidatePath(`/teacher/students/${studentUserId}`)
}

export async function bindParentToStudentAction(formData: FormData) {
  const session = await auth()
  const studentUserId = String(formData.get('studentUserId') ?? '').trim()
  const parentIdentifier = String(formData.get('parentIdentifier') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()
  if (!studentUserId || !parentIdentifier) throw new Error('Student id and parent username are required')

  await bindExistingParentToTeacherStudent({
    teacherUserId: session?.user?.id,
    studentUserId,
    parentIdentifier,
    note: note || null,
  })

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
  revalidatePath(`/teacher/students/${studentUserId}`)
}

export async function removeParentStudentBindingAction(formData: FormData) {
  const session = await auth()
  const studentUserId = String(formData.get('studentUserId') ?? '').trim()
  const parentUserId = String(formData.get('parentUserId') ?? '').trim()
  if (!studentUserId || !parentUserId) throw new Error('Student id and parent id are required')

  await removeParentFromTeacherStudent({
    teacherUserId: session?.user?.id,
    studentUserId,
    parentUserId,
  })

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
  revalidatePath(`/teacher/students/${studentUserId}`)
}

export async function generateStudentGrowthReportAction(formData: FormData) {
  const session = await auth()
  const studentUserId = String(formData.get('studentUserId') ?? '').trim()
  const periodStart = String(formData.get('periodStart') ?? '').trim()
  const periodEnd = String(formData.get('periodEnd') ?? '').trim()
  if (!studentUserId) throw new Error('Student id is required')

  let result: Awaited<ReturnType<typeof generateGrowthReportForTeacherStudent>>
  try {
    result = await generateGrowthReportForTeacherStudent({
      teacherUserId: session?.user?.id,
      studentUserId,
      periodStart: periodStart || null,
      periodEnd: periodEnd || null,
    })
  } catch (error) {
    const serviceError = toServiceError(error)
    redirect(
      `/teacher/students/${studentUserId}?tab=parents&drawer=growth-report&growthReportError=${encodeURIComponent(serviceError.message)}`,
    )
  }

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
  revalidatePath(`/teacher/students/${studentUserId}`)
  after(async () => {
    await completeGrowthReportGeneration(result.report.id)
    revalidatePath('/teacher')
    revalidatePath('/teacher/students')
    revalidatePath(`/teacher/students/${studentUserId}`)
  })
  redirect(
    `/teacher/students/${studentUserId}?tab=parents&growthReportId=${encodeURIComponent(result.report.id)}&growthReportMessage=${encodeURIComponent(
      `家长报告生成中：${result.report.periodStart} 至 ${result.report.periodEnd}，完成后会出现在列表中。`,
    )}`,
  )
}

export async function generateStudentBehaviorAnalysisAction(formData: FormData) {
  const session = await auth()
  const studentUserId = String(formData.get('studentUserId') ?? '').trim()
  const periodStart = String(formData.get('periodStart') ?? '').trim()
  const periodEnd = String(formData.get('periodEnd') ?? '').trim()
  const periodDaysValue = Number(formData.get('periodDays') ?? 7)
  const periodDays = Number.isInteger(periodDaysValue) ? periodDaysValue : 7
  if (!studentUserId) throw new Error('Student id is required')

  let result: Awaited<ReturnType<typeof generateBehaviorAnalysisForTeacherStudent>>
  try {
    result = await generateBehaviorAnalysisForTeacherStudent({
      teacherUserId: session?.user?.id,
      studentUserId,
      periodStart: periodStart || null,
      periodEnd: periodEnd || null,
      periodDays,
    })
  } catch (error) {
    const serviceError = toServiceError(error)
    redirect(`/teacher/students/${studentUserId}?tab=behavior&behaviorError=${encodeURIComponent(serviceError.message)}`)
  }

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
  revalidatePath(`/teacher/students/${studentUserId}`)
  redirect(
    `/teacher/students/${studentUserId}?tab=behavior&behaviorReportId=${encodeURIComponent(result.id)}&behaviorMessage=${encodeURIComponent(
      `行为分析已生成：${result.periodStart} 至 ${result.periodEnd}`,
    )}`,
  )
}

export async function deleteStudentBehaviorAnalysisAction(formData: FormData) {
  const session = await auth()
  const studentUserId = String(formData.get('studentUserId') ?? '').trim()
  const reportId = String(formData.get('reportId') ?? '').trim()
  const currentReportId = String(formData.get('currentReportId') ?? '').trim()
  if (!studentUserId || !reportId) throw new Error('Student id and report id are required')

  try {
    await deleteBehaviorAnalysisForTeacherStudent({
      teacherUserId: session?.user?.id,
      studentUserId,
      reportId,
    })
  } catch (error) {
    const serviceError = toServiceError(error)
    redirect(`/teacher/students/${studentUserId}?tab=behavior&behaviorError=${encodeURIComponent(serviceError.message)}`)
  }

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
  revalidatePath(`/teacher/students/${studentUserId}`)
  const nextSelectedReport = currentReportId && currentReportId !== reportId ? `&behaviorReportId=${encodeURIComponent(currentReportId)}` : ''
  redirect(
    `/teacher/students/${studentUserId}?tab=behavior${nextSelectedReport}&behaviorMessage=${encodeURIComponent('行为分析报告已删除。')}`,
  )
}

export async function resetStudentParentInviteAction(formData: FormData) {
  const session = await auth()
  const studentUserId = String(formData.get('studentUserId') ?? '').trim()
  if (!studentUserId) throw new Error('Student id is required')

  const result = await resetStudentParentInviteForTeacher({
    teacherUserId: session?.user?.id,
    studentUserId,
  })

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
  revalidatePath(`/teacher/students/${studentUserId}`)
  redirect(`/teacher/students/${studentUserId}?parentInviteCode=${encodeURIComponent(result.inviteCode)}`)
}
