import type { ReactNode } from 'react'
import Link from 'next/link'
import { Database, FileCode2 } from 'lucide-react'
import { TestLevelBrowser } from '@/components/TestLevelBrowser'
import { requireAdmin } from '@/lib/admin-auth'
import { getLevelTestSummaries } from '@/lib/services/level-service'
import { getProgressForUser } from '@/lib/services/progress-service'

export const dynamic = 'force-dynamic'

export default async function TestLevelsPage() {
  const admin = await requireAdmin('support')
  const [levels, progress] = await Promise.all([
    getLevelTestSummaries(),
    getProgressForUser({ userId: admin.userId }).catch(() => []),
  ])
  const passedIds = new Set(progress.filter((item) => item.passed).map((item) => item.levelId))
  const testLevels = levels.map((level) => ({
    ...level,
    passed: passedIds.has(level.id),
  }))

  return (
    <main className="test-page">
      <header className="test-page-head">
        <div>
          <span className="eyebrow">Internal Test</span>
          <h1>题目内部测试</h1>
          <p>这里列出当前数据库已导入的题目，供老师检查题面、样例、难度、测试点和编程体验。</p>
        </div>
        <Link className="test-secondary-link" href="/admin">
          返回后台
        </Link>
      </header>

      <section className="test-summary-grid" aria-label="题目统计">
        <TestMetric icon={<Database size={20} />} label="题目总数" value={levels.length} />
        <TestMetric icon={<FileCode2 size={20} />} label="已发布" value={levels.filter((level) => level.status === 'published').length} />
      </section>

      <TestLevelBrowser levels={testLevels} />
    </main>
  )
}

function TestMetric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <article className="test-metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
