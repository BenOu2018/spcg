import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth-guard'
import { startDailyReview } from '@/lib/services/daily-review-service'

export const dynamic = 'force-dynamic'

type DailyReviewStartPageProps = {
  searchParams?: Promise<{ levelId?: string }> | { levelId?: string }
}

export default async function DailyReviewStartPage({ searchParams }: DailyReviewStartPageProps) {
  const params = searchParams ? await searchParams : {}
  const levelId = typeof params.levelId === 'string' ? params.levelId : ''
  const next = levelId ? `/daily-review?levelId=${encodeURIComponent(levelId)}` : '/daily-review'
  const session = await requireUser(next)
  const result = await startDailyReview({
    userId: session.user.id,
    currentLevelId: levelId,
  })

  if (result.attempt) {
    redirect(`/daily-review/${result.attempt.id}`)
  }

  const continueHref = result.currentEntryLevelId ? `/level/${result.currentEntryLevelId}` : '/map'

  return (
    <main className="exam-page">
      <section className="exam-start-panel">
        <div>
          <span className="exam-complete-emblem" aria-hidden="true" />
          <h1>今日任务</h1>
          <p>{result.emptyReason}</p>
          <div className="exam-complete-actions">
            <Link href={continueHref}>继续当前关卡</Link>
            <Link href="/map">返回地图</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
