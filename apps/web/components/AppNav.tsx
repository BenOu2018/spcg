import Link from 'next/link'
import { Code2, MapPinned, Trophy, UserCircle2 } from 'lucide-react'

export function AppNav() {
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
        <Link href="/me">
          <UserCircle2 size={18} />
          进度
        </Link>
      </nav>
    </header>
  )
}
