import { ExamLevel } from '@/components/ExamLevel'
import { requireUser } from '@/lib/auth-guard'

export default async function SpcgLevelExamPage() {
  await requireUser('/exam/spcg-level-1')

  return <ExamLevel spcgLevel={1} />
}
