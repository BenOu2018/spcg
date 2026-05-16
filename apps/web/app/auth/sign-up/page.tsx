import Link from 'next/link'
import { signUpAction } from '@/app/auth/actions'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'
import { STUDENT_USERNAME_RULE_TITLE } from '@/lib/user-identity'

type SignUpPageProps = {
  searchParams?: Promise<{ error?: string }>
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams
  const messages = getStudentUiMessages(await getRequestUiLocale())

  return (
    <main className="login-scene">
      <section className="login-panel signup">
        <form className="login-form" action={signUpAction}>
          <img className="login-logo" src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
          <h1>{messages.auth.signUpTitle}</h1>
          {params?.error ? <p className="login-error">{params.error}</p> : null}
          <input
            name="username"
            type="text"
            placeholder={messages.auth.username}
            autoComplete="username"
            minLength={2}
            maxLength={24}
            autoCapitalize="none"
            title={STUDENT_USERNAME_RULE_TITLE}
            required
          />
          <input name="email" type="email" placeholder={messages.auth.emailOptional} autoComplete="email" />
          <input name="password" type="password" placeholder={messages.auth.password} autoComplete="new-password" minLength={8} required />
          <input name="confirmPassword" type="password" placeholder={messages.auth.confirmPassword} autoComplete="new-password" minLength={8} required />
          <button className="game-start-button" type="submit">
            {messages.auth.start}
          </button>
        </form>
        <Link className="login-link" href="/auth/sign-in">
          {messages.auth.backToSignIn}
        </Link>
      </section>
    </main>
  )
}
