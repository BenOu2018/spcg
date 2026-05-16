import Link from 'next/link'
import type { UiLocale } from '@spcg/shared/types'
import { Code2, MapPinned, Trophy, UserCircle2 } from 'lucide-react'
import { MeInstantLink } from '@/components/MeInstantLink'

type AppNavProps = {
  userId?: string | null
  uiLocale?: UiLocale
}

export function AppNav({ userId = null, uiLocale = 'zh-CN' }: AppNavProps = {}) {
  return (
    <header className="app-nav">
      <Link className="brand" href="/">
        <img src="/assets/art/ui/logo/spcg-mark.svg" alt="" />
        <span>SPCG</span>
      </Link>
      <nav aria-label="主导航">
        <Link href="/map">
          <MapPinned size={18} />
          地图
        </Link>
        <Link href="/level/ch1-01">
          <Code2 size={18} />
          关卡
        </Link>
        <Link href="/leaderboard" prefetch={false}>
          <Trophy size={18} />
          榜单
        </Link>
        <MeInstantLink href="/me" userId={userId} uiLocale={uiLocale}>
          <UserCircle2 size={18} />
          进度
        </MeInstantLink>
      </nav>
    </header>
  )
}
