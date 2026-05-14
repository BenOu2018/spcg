'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { AssessmentAttempt, RewardLedgerEntry, UserInventoryItem, UserTitleRecord } from '@spcg/shared/types'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'

type ProfileAssessmentHistoryItem = AssessmentAttempt & {
  sessionTitle: string
  spcgLevel: number | null
  dateKey: string | null
}

type ProfileRewardMenusProps = {
  inventory: UserInventoryItem[]
  titles: UserTitleRecord[]
  rewards: RewardLedgerEntry[]
  assessmentHistory: ProfileAssessmentHistoryItem[]
  messages?: StudentUiMessages
}

const fallbackMessages = getStudentUiMessages('zh-CN')

export function ProfileRewardMenus({ inventory, titles, rewards, assessmentHistory, messages = fallbackMessages }: ProfileRewardMenusProps) {
  const [openMenu, setOpenMenu] = useState<'inventory' | 'titles' | 'assessments' | 'rewards' | null>(null)
  const completedAssessmentCount = assessmentHistory.filter((item) => item.status === 'completed' || item.status === 'expired').length
  const inventoryGroups = [
    {
      key: 'rank',
      icon: '/assets/art/ui/rewards/rank.svg',
      title: '排名物品',
      entries: inventory.filter((entry) => entry.item.category === 'rank'),
    },
    {
      key: 'knowledge',
      icon: '/assets/art/ui/rewards/knowledge.svg',
      title: '知识点物品',
      entries: inventory.filter((entry) => entry.item.category === 'knowledge'),
    },
    {
      key: 'reward',
      icon: '/assets/art/ui/rewards/inventory.svg',
      title: '奖励物品',
      entries: inventory.filter((entry) => entry.item.category === 'reward'),
    },
  ].filter((group) => group.entries.length > 0)

  return (
    <section className="profile-menu-list" aria-label={messages.profile.rewards}>
      <ProfileMenu
        id="inventory"
        icon="/assets/art/ui/rewards/inventory.svg"
        title={messages.profile.inventory}
        meta={`${inventory.length} 件`}
        open={openMenu === 'inventory'}
        onToggle={() => setOpenMenu((value) => (value === 'inventory' ? null : 'inventory'))}
      >
        <div className="profile-menu-items">
          {inventoryGroups.map((group) => (
            <section className="profile-inventory-group" key={group.key} aria-label={group.title}>
              <div className="profile-inventory-group-title">
                <img src={group.icon} alt="" />
                <strong>{group.title}</strong>
                <em>{group.entries.length} 件</em>
              </div>
              {group.entries.map((entry) => (
                <article className="profile-inventory-row" key={`${group.key}-${entry.item.id}`}>
                  {entry.item.icon ? <img src={entry.item.icon} alt="" /> : null}
                  <div>
                    <strong>{entry.item.name}</strong>
                    <span>{entry.item.description}</span>
                  </div>
                  <em>
                    {entry.item.rarity} · x{entry.quantity}
                  </em>
                </article>
              ))}
            </section>
          ))}
          {inventory.length === 0 ? <p className="profile-empty">还没有背包物品，获得知识点或进入排行榜会带来第一件收藏。</p> : null}
        </div>
      </ProfileMenu>

      <ProfileMenu
        id="titles"
        icon="/assets/art/ui/rewards/title.svg"
        title="称谓收藏"
        meta={`${titles.length} 个`}
        open={openMenu === 'titles'}
        onToggle={() => setOpenMenu((value) => (value === 'titles' ? null : 'titles'))}
      >
        <div className="profile-menu-items">
          {titles.map((title) => (
            <article className="profile-reward-row" key={`${title.sourceRef}-${title.titleKey}`}>
              <div>
                <strong>{title.titleLabel}</strong>
                <span>
                  {formatTitlePool(title.poolKey)} · {new Date(title.awardedAt).toLocaleString('zh-CN')}
                </span>
              </div>
              <em>{title.levelId ?? title.rankAtAward}</em>
            </article>
          ))}
          {titles.length === 0 ? <p className="profile-empty">到达新段位后会随机获得一个称谓。</p> : null}
        </div>
      </ProfileMenu>

      <ProfileMenu
        id="assessments"
        icon="/assets/art/ui/rewards/rank.svg"
        title={messages.profile.assessments}
        meta={`${completedAssessmentCount}/${assessmentHistory.length} 场完成`}
        open={openMenu === 'assessments'}
        onToggle={() => setOpenMenu((value) => (value === 'assessments' ? null : 'assessments'))}
      >
        <div className="profile-menu-items">
          {assessmentHistory.map((attempt) => (
            <Link
              aria-label={`查看${formatAssessmentTitle(attempt)}场次`}
              className="profile-reward-row profile-reward-row-link"
              href={`/me/assessments/${attempt.id}`}
              key={attempt.id}
              prefetch={false}
            >
              <div>
                <strong>{formatAssessmentTitle(attempt)}</strong>
                <span>
                  {formatAttemptTime(attempt.startedAt)} · {formatAssessmentDuration(attempt.durationSeconds)} ·{' '}
                  {formatAssessmentStatus(attempt.status)}
                </span>
                <span className="profile-reward-row-cta">查看场次</span>
              </div>
              <em>
                {attempt.score}/300 · {attempt.acceptedCount}/{attempt.totalCount}
              </em>
            </Link>
          ))}
          {assessmentHistory.length === 0 ? <p className="profile-empty">暂无段位赛记录。</p> : null}
        </div>
      </ProfileMenu>

      <ProfileMenu
        id="rewards"
        icon="/assets/art/ui/rewards/ledger.svg"
        title={messages.profile.rewards}
        meta={`${rewards.length} 条`}
        open={openMenu === 'rewards'}
        onToggle={() => setOpenMenu((value) => (value === 'rewards' ? null : 'rewards'))}
      >
        <div className="profile-menu-items">
          {rewards.map((reward) => (
            <article className="profile-reward-row" key={reward.id}>
              <div>
                <strong>{formatRewardSource(reward.source)}</strong>
                <span>{new Date(reward.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              <em>{formatRewardDelta(reward)}</em>
            </article>
          ))}
          {rewards.length === 0 ? <p className="profile-empty">暂无奖励记录。</p> : null}
        </div>
      </ProfileMenu>
    </section>
  )
}

function formatAssessmentTitle(attempt: ProfileAssessmentHistoryItem): string {
  const level = attempt.spcgLevel ? `${attempt.spcgLevel}级` : 'SPCG'
  const date = attempt.dateKey ? ` ${attempt.dateKey}` : ''
  return `${level}段位赛${date}`
}

function formatAttemptTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

function formatAssessmentDuration(seconds: number): string {
  const hours = Math.round(seconds / 3600)
  return `${Math.max(1, hours)}小时`
}

function formatAssessmentStatus(status: AssessmentAttempt['status']): string {
  const labels: Record<AssessmentAttempt['status'], string> = {
    in_progress: '进行中',
    scoring: '判题中',
    completed: '已完成',
    expired: '已超时',
    abandoned: '已放弃',
  }
  return labels[status]
}

function ProfileMenu({
  id,
  icon,
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  id: string
  icon: string
  title: string
  meta: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <article className={open ? 'profile-menu open' : 'profile-menu'}>
      <button type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={onToggle}>
        <img src={icon} alt="" />
        <span>
          <strong>{title}</strong>
          <em>{meta}</em>
        </span>
        <ChevronDown size={20} strokeWidth={2.6} />
      </button>
      {open ? (
        <div className="profile-menu-panel" id={`${id}-panel`}>
          {children}
        </div>
      ) : null}
    </article>
  )
}

function formatRewardSource(source: string): string {
  const labels: Record<string, string> = {
    level_first_ac: '首次 AC',
    hidden_garlic_drop: '隐藏蒜粒',
    assessment_complete: '段位赛完成',
    assessment_rank_bonus: '段位加成',
    daily_review_complete: '今日任务',
    leaderboard_rank_award: '排行榜荣誉',
    admin_adjustment: '管理员调整',
  }
  return labels[source] ?? source
}

function formatRewardDelta(reward: { coinDelta: number; garlicDelta: number; itemQuantity: number }): string {
  const parts = []
  if (reward.coinDelta) parts.push(`金币 ${reward.coinDelta > 0 ? '+' : ''}${reward.coinDelta}`)
  if (reward.garlicDelta) parts.push(`蒜粒 ${reward.garlicDelta > 0 ? '+' : ''}${reward.garlicDelta}`)
  if (reward.itemQuantity) parts.push(`装备 +${reward.itemQuantity}`)
  return parts.join(' / ') || '已记录'
}

function formatTitlePool(poolKey: string): string {
  const labels: Record<string, string> = {
    scrap_iron: '黑铁池',
    bronze: '青铜池',
    silver: '白银池',
    gold: '黄金池',
    platinum: '铂金池',
    diamond: '钻石池',
    stellar: '星耀池',
    king: '王者池',
    master: '大师池',
    grandmaster: '宗师池',
  }
  return labels[poolKey] ?? poolKey
}
