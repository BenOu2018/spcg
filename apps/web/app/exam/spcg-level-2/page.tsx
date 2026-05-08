import { ExamLevel } from '@/components/ExamLevel'
import { requireUser } from '@/lib/auth-guard'

export default async function SpcgLevelTwoExamPage() {
  await requireUser('/exam/spcg-level-2')

  return <ExamLevel spcgLevel={2} />
}
