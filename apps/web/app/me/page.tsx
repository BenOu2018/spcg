import { AttemptedProgressList } from '@/components/AttemptedProgressList'
import { ProfileRewardMenus } from '@/components/ProfileRewardMenus'
import { ProgressSummary } from '@/components/ProgressSummary'
import { requireUser } from '@/lib/auth-guard'
import { getAllLevels, getProgressRecords } from '@/lib/level-data'
import { requireUserInventory } from '@/lib/services/inventory-service'
import { requireRewardHistory, requireWalletSummary } from '@/lib/services/wallet-service'

export default async function MePage() {
  const session = await requireUser('/me')
  const [levels, progressRecords, wallet, inventory, rewards] = await Promise.all([
    getAllLevels(),
    getProgressRecords(),
    requireWalletSummary(session.user.id).catch(() => null),
    requireUserInventory(session.user.id).catch(() => []),
    requireRewardHistory(session.user.id).catch(() => []),
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
        <RewardMetric icon="/assets/art/ui/rewards/coin.svg" label="金币" value={wallet?.coinTotal ?? 0} />
        <RewardMetric icon="/assets/art/ui/rewards/garlic.svg" label="蒜粒" value={wallet?.garlicBalance ?? 0} />
        <RewardMetric icon="/assets/art/ui/rewards/rank.svg" label="段位" value={wallet?.rankLabel ?? '青铜'} />
        <RewardMetric icon="/assets/art/ui/rewards/title.svg" label="称谓" value={wallet?.title ?? '晨雾算力学徒'} />
      </section>

      <ProfileRewardMenus inventory={inventory} rewards={rewards} />

      <AttemptedProgressList items={attemptedLevels} />
    </main>
  )
}

function toTime(value: string): number {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function RewardMetric({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <article className="profile-metric">
      <img src={icon} alt="" />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
