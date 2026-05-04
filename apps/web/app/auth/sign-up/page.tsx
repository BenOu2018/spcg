import Link from 'next/link'
import { signUpAction } from '@/app/auth/actions'

type SignUpPageProps = {
  searchParams?: Promise<{ error?: string }>
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams

  return (
    <main className="login-scene">
      <form className="login-panel signup" action={signUpAction}>
        <img className="login-logo" src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
        <h1>创建角色</h1>
        {params?.error ? <p className="login-error">{params.error}</p> : null}
        <input name="displayName" type="text" placeholder="昵称" required />
        <input name="email" type="email" placeholder="学生邮箱" required />
        <input name="parentEmail" type="email" placeholder="家长邮箱" />
        <input name="password" type="password" placeholder="密码" minLength={6} required />
        <button className="game-start-button" type="submit">
          开始
        </button>
        <Link className="login-link" href="/auth/sign-in">
          返回登录
        </Link>
      </form>
    </main>
  )
}
