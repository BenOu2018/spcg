import { ExamLevel } from '@/components/ExamLevel'
import { requireUser } from '@/lib/auth-guard'

export default async function SpcgLevelThreeExamPage() {
  await requireUser('/exam/spcg-level-3')

  return <ExamLevel spcgLevel={3} />
}
