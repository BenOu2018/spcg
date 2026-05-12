import { StatementMarkdown } from '@/components/StatementMarkdown'
import { getPublicGrowthReportByToken } from '@/lib/services/growth-report-service'

type GrowthReportPageProps = {
  params: Promise<{ token: string }> | { token: string }
}

export default async function GrowthReportPage({ params }: GrowthReportPageProps) {
  const { token } = await params
  const report = await getPublicGrowthReportByToken(token)

  if (!report) {
    return (
      <main className="growth-report-page">
        <section className="growth-report-card">
          <p className="admin-eyebrow">Growth Report</p>
          <h1>报告不可访问</h1>
          <p>该成长报告链接不存在、已过期或已被撤销。请联系老师重新生成报告链接。</p>
        </section>
      </main>
    )
  }

  return (
    <main className="growth-report-page">
      <section className="growth-report-card">
        <header className="growth-report-head">
          <div>
            <p className="admin-eyebrow">Growth Report</p>
            <h1>{report.title}</h1>
          </div>
          <span>
            {report.periodStart} - {report.periodEnd}
          </span>
        </header>
        <StatementMarkdown markdown={report.markdown} assets={[]} hideImages />
        <footer className="growth-report-foot">
          <span>链接有效期至 {new Date(report.tokenExpiresAt).toLocaleDateString('zh-CN')}</span>
          <span>本报告不包含源码、手机号、邮箱和隐藏测试点内容。</span>
        </footer>
      </section>
    </main>
  )
}
