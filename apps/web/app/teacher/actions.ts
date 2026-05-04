'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { addStudentToTeacher, createStudentForTeacher, removeStudentFromTeacher } from '@/lib/services/teacher-service'

export async function addTeacherStudentAction(formData: FormData) {
  const session = await auth()
  const studentIdentifier = String(formData.get('studentIdentifier') ?? '').trim()
  if (!studentIdentifier) throw new Error('Student email or id is required')

  await addStudentToTeacher({
    teacherUserId: session?.user?.id,
    studentIdentifier,
  })

  revalidatePath('/teacher')
  revalidatePath('/teacher/students')
}

export async function createTeacherStudentAction(formData: FormData) {
  const session = await auth()
  const email = String(formData.get('email') ?? '').trim()
  const displayName = String(formData.get('displayName') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const parentEmail = String(formData.get('parentEmail') ?? '').trim() || null
  const ageValue = String(formData.get('age') ?? '').trim()
  const age = ageValue ? Number(ageValue) : null

  await createStudentForTeacher({
    teacherUserId: session?.user?.id,
    email,
    displayName,
    password,
    parentEmail,
    age: Number.isInteger(age) ? age : null,
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
