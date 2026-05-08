import { GameVillage } from '@/components/GameVillage'
import { requireUser } from '@/lib/auth-guard'
import { getAllLevels, getMapMainlineLevels, getProgressRecords } from '@/lib/level-data'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  await requireUser('/')
  const [levels, testLevels, progressRecords] = await Promise.all([
    getMapMainlineLevels(),
    getAllLevels(),
    getProgressRecords(),
  ])

  return <GameVillage levels={levels} testLevels={testLevels} progress={progressRecords} />
}
