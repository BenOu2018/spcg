import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { requireTeacher } from '@/lib/services/teacher-service'

export async function requireTeacherSession(nextPath = '/teacher') {
  const session = await auth()
  if (!session?.user?.id) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(nextPath)}`)
  }

  try {
    await requireTeacher(session.user.id)
    return session
  } catch {
    redirect('/map')
  }
}
