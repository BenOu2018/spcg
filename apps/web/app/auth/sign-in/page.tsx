import Link from 'next/link'
import { signInAction } from '@/app/auth/actions'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

type SignInPageProps = {
  searchParams?: Promise<{ error?: string; next?: string; created?: string; reset?: string }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams
  const next = typeof params?.next === 'string' ? params.next : '/'
  const messages = getStudentUiMessages(await getRequestUiLocale())

  return (
    <main className="login-scene">
      <form className="login-panel" action={signInAction}>
        <img className="login-logo" src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
        <h1>{messages.auth.signInTitle}</h1>
        {params?.created === '1' ? <p className="login-message">{messages.auth.created}</p> : null}
        {params?.reset === '1' ? <p className="login-message">{messages.auth.passwordResetDone}</p> : null}
        {params?.error ? <p className="login-error">{params.error}</p> : null}
        <input name="identifier" type="text" placeholder={messages.auth.signInIdentifier} autoComplete="username" required />
        <input name="password" type="password" placeholder={messages.auth.password} required />
        <input name="next" type="hidden" value={next} />
        <button className="game-start-button" type="submit">
          {messages.auth.signIn}
        </button>
        <Link className="login-link" href="/auth/forgot-password">
          {messages.auth.forgotPassword}
        </Link>
        <Link className="login-link" href="/auth/sign-up">
          {messages.auth.signUp}
        </Link>
      </form>
    </main>
  )
}
