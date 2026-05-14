import { AccountSettingsContent, type SettingsSearchParams } from '@/app/settings/AccountSettingsContent'

type SettingsPageProps = {
  searchParams?: Promise<SettingsSearchParams> | SettingsSearchParams
}

export const dynamic = 'force-dynamic'

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = searchParams ? await searchParams : {}

  return (
    <main className="page-shell settings-shell">
      <AccountSettingsContent mode="page" searchParams={params} />
    </main>
  )
}
