'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Level, Progress, RewardRank } from '@spcg/shared/types'
import { REWARD_RANKS } from '@spcg/shared/reward-ranks'
import { AttemptedProgressList, type AttemptedProgressItem } from '@/components/AttemptedProgressList'
import { ProfileRewardMenus } from '@/components/ProfileRewardMenus'
import { ProfileSubmissionList } from '@/components/ProfileSubmissionList'
import { ProgressSummary } from '@/components/ProgressSummary'
import type { MePagePayloadInput } from '@/lib/me-page-payload'

type MePageExperienceProps = {
  payload: MePagePayloadInput
}

export function MePageExperience({ payload }: MePageExperienceProps) {
  const attemptedLevels = buildAttemptedLevels(payload.levels, payload.progressRecords)
  const weeklyKnowledgePoints = [
    ...new Set(
      attemptedLevels
        .filter((item) => item.passed && isWithinDays(item.lastSubmittedAt, 7))
        .map((item) => item.knowledgePoint),
    ),
  ]
  const pendingRepairCount = payload.progressRecords.filter((progress) => !progress.passed && progress.attemptCount > 0).length
  const recentRepairSuccess = payload.progressRecords.filter((progress) => progress.passed && progress.attemptCount > 1).length
  const nextRank = getNextRank(payload.wallet?.coinTotal ?? 0)
  const rankGap = nextRank ? `${Math.max(0, nextRank.minCoins - (payload.wallet?.coinTotal ?? 0))} ${payload.messages.profile.coins}` : '已到顶'
  const rankHint = nextRank ? `距${nextRank.label}还差 ${rankGap}` : '已到最高段位'
  const weeklyKnowledgeHint =
    weeklyKnowledgePoints.length > 0 ? formatKnowledgePreview(weeklyKnowledgePoints) : '本周暂无通关知识点'
  const pendingRepairHint = pendingRepairCount > 0 ? '优先把 WA 题修到 AC' : `最近修错成功 ${recentRepairSuccess} 题`
  const rankWeaponIcon = getRankWeaponIcon(payload.wallet?.rank)

  return (
    <main className="page-shell">
      <Link className="profile-back-button" href="/map" aria-label="返回地图">
        <ArrowLeft size={18} />
        <span>{payload.messages.common.backToMap}</span>
      </Link>

      <section className="section-title">
        <div>
          <span className="eyebrow">{payload.messages.profile.eyebrow}</span>
          <h1>{payload.messages.profile.title}</h1>
        </div>
        <ProgressSummary compact levels={payload.levels} progress={payload.progressRecords} />
      </section>

      <section className="profile-metrics" aria-label="成长数据">
        <RewardMetric icon="/assets/art/ui/rewards/coin.svg" label={payload.messages.profile.coins} value={payload.wallet?.coinTotal ?? 0} hint="累计做题积分" />
        <RewardMetric icon={rankWeaponIcon} label={payload.messages.profile.rank} value={payload.wallet?.rankLabel ?? '黑铁'} hint={rankHint} featuredIcon />
        <RewardMetric icon="/assets/art/ui/rewards/garlic.svg" label={payload.messages.profile.garlic} value={payload.wallet?.garlicBalance ?? 0} hint="考试与隐藏奖励" />
        <RewardMetric
          className="profile-metric-title"
          icon="/assets/art/ui/rewards/title.svg"
          label={payload.messages.profile.titleName}
          value={payload.wallet?.title ?? '黑铁晨雾算力学徒'}
          hint="到达新段位随机获得"
        />
        <RewardMetric
          icon="/assets/art/ui/rewards/knowledge.svg"
          label={payload.messages.profile.weeklyKnowledge}
          value={`${weeklyKnowledgePoints.length} 个`}
          hint={weeklyKnowledgeHint}
        />
        <RewardMetric
          icon="/assets/art/ui/rewards/repair.svg"
          label={payload.messages.profile.pendingRepair}
          value={`${pendingRepairCount} 题`}
          hint={pendingRepairHint}
        />
      </section>

      <ProfileRewardMenus
        inventory={payload.inventory}
        titles={payload.titles}
        rewards={payload.rewards}
        assessmentHistory={payload.assessmentHistory}
        messages={payload.messages}
      />

      <ProfileSubmissionList items={payload.submissionHistory.items} messages={payload.messages} />

      <AttemptedProgressList items={attemptedLevels} messages={payload.messages} />
    </main>
  )
}

export function buildAttemptedLevels(levels: Level[], progressRecords: Progress[]): AttemptedProgressItem[] {
  const levelsById = new Map(levels.map((level) => [level.id, level]))
  return progressRecords
    .map((progress) => ({
      progress,
      level: levelsById.get(progress.levelId),
    }))
    .filter((item): item is { progress: Progress; level: Level } => Boolean(item.level))
    .sort((a, b) => toTime(b.progress.lastSubmittedAt) - toTime(a.progress.lastSubmittedAt))
    .map(({ level, progress }) => ({
      levelId: level.id,
      title: level.title,
      knowledgePoint: level.knowledgePoint,
      passed: progress.passed,
      lastSubmittedAt: progress.lastSubmittedAt,
    }))
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
  return REWARD_RANKS.find((rank) => coinTotal < rank.minCoins) ?? null
}

function getRankWeaponIcon(rank?: RewardRank | null): string {
  const weaponByRank = {
    scrap_iron: 'black-iron-weapon-thumb.webp',
    bronze: 'bronze-weapon-thumb.webp',
    silver: 'silver-weapon-thumb.webp',
    gold: 'gold-weapon-thumb.webp',
    platinum: 'platinum-weapon-thumb.webp',
    diamond: 'diamond-weapon-thumb.webp',
    stellar: 'star-glory-weapon-thumb.webp',
    king: 'king-weapon-thumb.webp',
    master: 'master-weapon-thumb.webp',
    grandmaster: 'grandmaster-weapon-thumb.webp',
    legend: 'legend-weapon-thumb.webp',
    server: 'server-weapon-thumb.webp',
  } satisfies Record<RewardRank, string>
  return `/assets/art/ui/rewards/rank-weapons/thumbnails/${weaponByRank[rank ?? 'scrap_iron']}`
}

function formatKnowledgePreview(points: string[]): string {
  const visible = points.slice(0, 2).join('、')
  return points.length > 2 ? `${visible} 等` : visible
}

function RewardMetric({
  className,
  icon,
  label,
  value,
  hint,
  featuredIcon = false,
}: {
  className?: string
  icon: string
  label: string
  value: string | number
  hint?: string
  featuredIcon?: boolean
}) {
  const classes = ['profile-metric', featuredIcon ? 'profile-metric-featured-icon' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <article className={classes}>
      {featuredIcon ? (
        <div className="profile-metric-icon-anchor" aria-hidden="true">
          <img className="profile-metric-icon" src={icon} alt="" />
          <img className="profile-metric-floating-icon" src={icon} alt="" />
        </div>
      ) : (
        <img className="profile-metric-icon" src={icon} alt="" />
      )}
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <em>{hint}</em> : null}
    </article>
  )
}
