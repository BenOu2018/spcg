'use client'

import type { Session } from 'next-auth'
import { UserAccountMenu } from '@/components/UserAccountMenu'

type LoggedInUserBadgeProps = {
  session: Session | null
  canShowPricingMenu: boolean
}

export function LoggedInUserBadge({ session, canShowPricingMenu }: LoggedInUserBadgeProps) {
  return <UserAccountMenu session={session} canShowPricingMenu={canShowPricingMenu} variant="floating" />
}
