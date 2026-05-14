import { AccountSettingsContent, type SettingsSearchParams } from '@/app/settings/AccountSettingsContent'
import { SettingsModalShell } from '@/components/SettingsModalShell'

type SettingsModalPageProps = {
  searchParams?: Promise<SettingsSearchParams> | SettingsSearchParams
}

export const dynamic = 'force-dynamic'

export default async function SettingsModalPage({ searchParams }: SettingsModalPageProps) {
  const params = searchParams ? await searchParams : {}

  return (
    <SettingsModalShell>
      <AccountSettingsContent mode="modal" searchParams={params} />
    </SettingsModalShell>
  )
}
