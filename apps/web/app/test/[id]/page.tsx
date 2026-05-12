import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProgrammingLevel } from '@/components/ProgrammingLevel'
import { requireAdmin } from '@/lib/admin-auth'
import { getLevelForTeacherTesting } from '@/lib/services/level-service'

type TestLevelPageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export default async function TestLevelPage({ params }: TestLevelPageProps) {
  const { id } = await params
  const admin = await requireAdmin('support')
  const level = await getLevelForTeacherTesting(id)

  if (!level) notFound()

  return (
    <main className="programming-scene">
      <header className="programming-topbar">
        <Link className="kit-logo" href="/test" aria-label="返回题目测试列表">
          <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
        </Link>
        <div className="chapter-pill">Internal Test: {level.id}</div>
        <div className="level-progress-strip test-progress-label" aria-label="test mode">
          <span>{level.title}</span>
        </div>
        <div className="programming-actions">
          <Link className="top-icon-button" href="/test" aria-label="题目列表">
            <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-book.svg" alt="" />
          </Link>
          <Link className="top-icon-button" href="/admin" aria-label="后台">
            <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/icon-settings.svg" alt="" />
          </Link>
        </div>
      </header>

      <section className="programming-main">
        <ProgrammingLevel level={level} userId={admin.userId} />
      </section>
    </main>
  )
}
