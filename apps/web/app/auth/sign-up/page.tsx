import Link from 'next/link'
import { signUpAction } from '@/app/auth/actions'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

type SignUpPageProps = {
  searchParams?: Promise<{ error?: string }>
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams
  const messages = getStudentUiMessages(await getRequestUiLocale())

  return (
    <main className="login-scene">
      <form className="login-panel signup" action={signUpAction}>
        <img className="login-logo" src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
        <h1>{messages.auth.signUpTitle}</h1>
        {params?.error ? <p className="login-error">{params.error}</p> : null}
        <input name="email" type="email" placeholder={messages.auth.email} autoComplete="email" required />
        <input name="displayName" type="text" placeholder={messages.auth.displayName} required />
        <input name="password" type="password" placeholder={messages.auth.password} autoComplete="new-password" minLength={8} required />
        <input name="confirmPassword" type="password" placeholder={messages.auth.confirmPassword} autoComplete="new-password" minLength={8} required />
        <button className="game-start-button" type="submit">
          {messages.auth.start}
        </button>
        <Link className="login-link" href="/auth/sign-in">
          {messages.auth.backToSignIn}
        </Link>
      </form>
    </main>
  )
}
