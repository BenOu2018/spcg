import Link from 'next/link'
import { requestPasswordResetAction } from '@/app/auth/actions'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

type ForgotPasswordPageProps = {
  searchParams?: Promise<{ error?: string; sent?: string }>
}

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams
  const messages = getStudentUiMessages(await getRequestUiLocale())

  return (
    <main className="login-scene">
      <section className="login-panel">
        <form className="login-form" action={requestPasswordResetAction}>
          <img className="login-logo" src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
          <h1>{messages.auth.forgotPasswordTitle}</h1>
          <p className="login-hint">{messages.auth.forgotPasswordBody}</p>
          {params?.sent === '1' ? <p className="login-message">{messages.auth.passwordResetSent}</p> : null}
          {params?.error ? <p className="login-error">{params.error}</p> : null}
          <input name="email" type="email" placeholder={messages.auth.email} autoComplete="email" required />
          <button className="game-start-button" type="submit">
            {messages.auth.sendResetLink}
          </button>
        </form>
        <Link className="login-link" href="/auth/sign-in">
          {messages.auth.backToSignIn}
        </Link>
      </section>
    </main>
  )
}
