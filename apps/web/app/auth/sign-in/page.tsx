import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { SignInForm } from '@/app/auth/sign-in/SignInForm'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

type SignInPageProps = {
  searchParams?: Promise<{ error?: string; next?: string; created?: string; reset?: string }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams
  const next = normalizeNextPath(typeof params?.next === 'string' ? params.next : '/map')
  const session = await auth()
  if (session?.user?.id) redirect(next)

  const messages = getStudentUiMessages(await getRequestUiLocale())

  return (
    <main className="login-scene">
      <section className="login-panel">
        <SignInForm
          nextPath={next}
          title={messages.auth.signInTitle}
          createdMessage={params?.created === '1' ? messages.auth.created : null}
          resetMessage={params?.reset === '1' ? messages.auth.passwordResetDone : null}
          initialError={params?.error ?? null}
          identifierPlaceholder={messages.auth.signInIdentifier}
          passwordPlaceholder={messages.auth.password}
          submitLabel={messages.auth.signIn}
          invalidCredentialsMessage="邮箱/用户名/昵称或密码不正确。"
        />
        <Link className="login-link" href="/auth/forgot-password">
          {messages.auth.forgotPassword}
        </Link>
        <Link className="login-link" href="/auth/sign-up">
          {messages.auth.signUp}
        </Link>
      </section>
    </main>
  )
}

function normalizeNextPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/map'
  if (isSettingsPath(value)) return '/map'
  return value === '/' ? '/map' : value
}

function isSettingsPath(value: string): boolean {
  return value === '/settings' || value.startsWith('/settings?') || value.startsWith('/settings/')
}
