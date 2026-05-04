import { ExamLevel } from '@/components/ExamLevel'
import { requireUser } from '@/lib/auth-guard'
import { getMainlineLevels } from '@/lib/level-data'

export default async function SpcgLevelExamPage() {
  await requireUser('/exam/spcg-level-1')
  const levels = await getMainlineLevels('ch1-mist-town')

  return <ExamLevel levels={levels} />
}
