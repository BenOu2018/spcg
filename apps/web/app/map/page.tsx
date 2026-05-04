import { GameVillage } from '@/components/GameVillage'
import { requireUser } from '@/lib/auth-guard'
import { getMapMainlineLevels, getProgressRecords } from '@/lib/level-data'

type MapPageProps = {
  searchParams?: Promise<{ chapter?: string }> | { chapter?: string }
}

export const dynamic = 'force-dynamic'

export default async function MapPage({ searchParams }: MapPageProps) {
  const params = searchParams ? await searchParams : {}
  await requireUser(params.chapter ? `/map?chapter=${encodeURIComponent(params.chapter)}` : '/map')
  const [levels, progressRecords] = await Promise.all([getMapMainlineLevels(), getProgressRecords()])

  return <GameVillage levels={levels} progress={progressRecords} activeChapterId={params.chapter} />
}
