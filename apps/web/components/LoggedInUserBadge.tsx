import Link from 'next/link'
import type { Session } from 'next-auth'

type LoggedInUserBadgeProps = {
  session: Session | null
}

export function LoggedInUserBadge({ session }: LoggedInUserBadgeProps) {
  const user = session?.user
  if (!user?.id) return null

  const displayName = user.name || user.email || user.id

  return (
    <Link className="session-user-badge" href="/me" title={`当前登录：${displayName}`}>
      <strong>{displayName}</strong>
    </Link>
  )
}
