import { AttemptedProgressList } from '@/components/AttemptedProgressList'
import { ProfileRewardMenus } from '@/components/ProfileRewardMenus'
import { ProgressSummary } from '@/components/ProgressSummary'
import { requireUser } from '@/lib/auth-guard'
import { getAllLevels, getProgressRecords } from '@/lib/level-data'
import { RANKS } from '@/lib/reward-rules'
import { requireUserInventory } from '@/lib/services/inventory-service'
import { listRankedAssessmentHistoryForUser } from '@/lib/services/assessment-service'
import { requireRewardHistory, requireWalletSummary } from '@/lib/services/wallet-service'

export default async function MePage() {
  const session = await requireUser('/me')
  const [levels, progressRecords, wallet, inventory, rewards, assessmentHistory] = await Promise.all([
    getAllLevels(),
    getProgressRecords(),
    requireWalletSummary(session.user.id).catch(() => null),
    requireUserInventory(session.user.id).catch(() => []),
    requireRewardHistory(session.user.id).catch(() => []),
    listRankedAssessmentHistoryForUser({ userId: session.user.id, limit: 20 }).catch(() => []),
  ])
  const levelsById = new Map(levels.map((level) => [level.id, level]))
  const attemptedLevels = progressRecords
    .map((progress) => ({
      progress,
      level: levelsById.get(progress.levelId),
    }))
    .filter((item): item is { progress: (typeof progressRecords)[number]; level: (typeof levels)[number] } =>
      Boolean(item.level),
    )
    .sort((a, b) => toTime(b.progress.lastSubmittedAt) - toTime(a.progress.lastSubmittedAt))
    .map(({ level, progress }) => ({
      levelId: level.id,
      title: level.title,
      knowledgePoint: level.knowledgePoint,
      passed: progress.passed,
      lastSubmittedAt: progress.lastSubmittedAt,
    }))
  const weeklyKnowledgePoints = [
    ...new Set(
      attemptedLevels
        .filter((item) => item.passed && isWithinDays(item.lastSubmittedAt, 7))
        .map((item) => item.knowledgePoint),
    ),
  ]
  const pendingRepairCount = progressRecords.filter((progress) => !progress.passed && progress.attemptCount > 0).length
  const recentRepairSuccess = progressRecords.filter((progress) => progress.passed && progress.attemptCount > 1).length
  const nextRank = getNextRank(wallet?.coinTotal ?? 0)
  const rankGap = nextRank ? `${Math.max(0, nextRank.minCoins - (wallet?.coinTotal ?? 0))} 金币` : '已到顶'
  const rankHint = nextRank ? `距${nextRank.label}还差 ${rankGap}` : '已到最高段位'
  const weeklyKnowledgeHint =
    weeklyKnowledgePoints.length > 0 ? formatKnowledgePreview(weeklyKnowledgePoints) : '本周暂无通关知识点'
  const pendingRepairHint = pendingRepairCount > 0 ? '优先把 WA 题修到 AC' : `最近修错成功 ${recentRepairSuccess} 题`

  return (
    <main className="page-shell">
      <section className="section-title">
        <div>
          <span className="eyebrow">Profile</span>
          <h1>我的进度</h1>
        </div>
        <ProgressSummary compact levels={levels} progress={progressRecords} />
      </section>

      <section className="profile-metrics" aria-label="成长数据">
        <RewardMetric icon="/assets/art/ui/rewards/coin.svg" label="金币" value={wallet?.coinTotal ?? 0} hint="累计做题积分" />
        <RewardMetric icon="/assets/art/ui/rewards/rank.svg" label="段位" value={wallet?.rankLabel ?? '烂铁'} hint={rankHint} />
        <RewardMetric icon="/assets/art/ui/rewards/garlic.svg" label="蒜粒" value={wallet?.garlicBalance ?? 0} hint="考试与隐藏奖励" />
        <RewardMetric icon="/assets/art/ui/rewards/title.svg" label="称谓" value={wallet?.title ?? '烂铁晨雾算力学徒'} hint="由蒜粒与段位生成" />
        <RewardMetric
          icon="/assets/art/ui/rewards/knowledge.svg"
          label="本周知识点"
          value={`${weeklyKnowledgePoints.length} 个`}
          hint={weeklyKnowledgeHint}
        />
        <RewardMetric
          icon="/assets/art/ui/rewards/repair.svg"
          label="待修错题"
          value={`${pendingRepairCount} 题`}
          hint={pendingRepairHint}
        />
      </section>

      <ProfileRewardMenus inventory={inventory} rewards={rewards} assessmentHistory={assessmentHistory} />

      <AttemptedProgressList items={attemptedLevels} />
    </main>
  )
}

function toTime(value: string): number {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function isWithinDays(value: string, days: number): boolean {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return false
  return Date.now() - time <= days * 24 * 60 * 60 * 1000
}

function getNextRank(coinTotal: number) {
  return RANKS.find((rank) => coinTotal < rank.minCoins) ?? null
}

function formatKnowledgePreview(points: string[]): string {
  const visible = points.slice(0, 2).join('、')
  return points.length > 2 ? `${visible} 等` : visible
}

function RewardMetric({ icon, label, value, hint }: { icon: string; label: string; value: string | number; hint?: string }) {
  return (
    <article className="profile-metric">
      <img src={icon} alt="" />
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <em>{hint}</em> : null}
    </article>
  )
}
