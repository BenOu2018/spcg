import { redirect } from 'next/navigation'
import { auth } from '@/auth'

export async function requireUser(nextPath: string) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(nextPath)}`)
  }

  return session
}
