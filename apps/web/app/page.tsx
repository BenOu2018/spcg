import { GameVillage } from '@/components/GameVillage'
import { requireUser } from '@/lib/auth-guard'
import { getMapMainlineLevels, getProgressRecords } from '@/lib/level-data'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  await requireUser('/')
  const [levels, progressRecords] = await Promise.all([getMapMainlineLevels(), getProgressRecords()])

  return <GameVillage levels={levels} progress={progressRecords} />
}
