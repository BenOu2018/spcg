'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
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
import { generateGrowthReportForTeacherStudent } from '@/lib/services/growth-report-service'
import { explainSubmissionErrorForTeacher } from '@/lib/services/submission-error-analysis-service'
import { resetStudentParentInviteForTeacher } from '@/lib/services/student-parent-invite-service'
import { isStudentUserType, setStudentUserType } from '@/lib/services/entitlement-service'

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

  await createStudentForTeacher({
    teacherUserId: session?.user?.id,
    username,
    displayName,
    password,
    age: Number.isInteger(age) ? age : null,
    parentEmail: parentEmail || null,
  })

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
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
  if (!studentUserId || !levelId) throw new Error('Student id and level id are required')

  await setTeacherStudentCurrentLevel({
    teacherUserId: session?.user?.id,
    studentUserId,
    levelId,
  })

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
  revalidatePath(`/teacher/students/${studentUserId}`)
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

  const result = await generateGrowthReportForTeacherStudent({
    teacherUserId: session?.user?.id,
    studentUserId,
    periodStart: periodStart || null,
    periodEnd: periodEnd || null,
  })

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
  revalidatePath(`/teacher/students/${studentUserId}`)
  redirect(result.publicUrl)
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
