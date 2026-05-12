import Link from 'next/link'
import { resetPasswordAction } from '@/app/auth/actions'
import { getPasswordResetTokenStatus } from '@/lib/services/password-reset-token-service'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

type ResetPasswordPageProps = {
  searchParams?: Promise<{ token?: string; error?: string }>
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams
  const token = typeof params?.token === 'string' ? params.token : ''
  const messages = getStudentUiMessages(await getRequestUiLocale())
  const tokenStatus = token ? await getPasswordResetTokenStatus(token).catch(() => 'invalid' as const) : 'invalid'
  const tokenInvalid = tokenStatus !== 'valid'

  return (
    <main className="login-scene">
      <form className="login-panel" action={resetPasswordAction}>
        <img className="login-logo" src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
        <h1>{messages.auth.resetPasswordTitle}</h1>
        <p className="login-hint">{messages.auth.resetPasswordBody}</p>
        {tokenInvalid ? <p className="login-error">{tokenStatus === 'expired' ? messages.auth.resetTokenExpired : messages.auth.resetTokenInvalid}</p> : null}
        {params?.error ? <p className="login-error">{params.error}</p> : null}
        <input name="token" type="hidden" value={token} />
        <input name="password" type="password" placeholder={messages.auth.password} autoComplete="new-password" minLength={8} required disabled={tokenInvalid} />
        <input name="confirmPassword" type="password" placeholder={messages.auth.confirmPassword} autoComplete="new-password" minLength={8} required disabled={tokenInvalid} />
        <button className="game-start-button" type="submit" disabled={tokenInvalid}>
          {messages.auth.resetPassword}
        </button>
        <Link className="login-link" href="/auth/forgot-password">
          {messages.auth.requestNewResetLink}
        </Link>
      </form>
    </main>
  )
}
