import Link from 'next/link'
import { signInAction } from '@/app/auth/actions'

type SignInPageProps = {
  searchParams?: Promise<{ error?: string; next?: string; created?: string }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams
  const next = typeof params?.next === 'string' ? params.next : '/'

  return (
    <main className="login-scene">
      <form className="login-panel" action={signInAction}>
        <img className="login-logo" src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
        <h1>雾镇入口</h1>
        {params?.created === '1' ? <p className="login-message">账号已创建，请登录进入新手村。</p> : null}
        {params?.error ? <p className="login-error">{params.error}</p> : null}
        <input name="email" type="email" placeholder="邮箱" required />
        <input name="password" type="password" placeholder="密码" required />
        <input name="next" type="hidden" value={next} />
        <button className="game-start-button" type="submit">
          登录
        </button>
        <Link className="login-link" href="/auth/sign-up">
          注册新账号
        </Link>
      </form>
    </main>
  )
}
