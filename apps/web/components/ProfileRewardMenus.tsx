'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { RewardLedgerEntry, UserInventoryItem } from '@spcg/shared/types'

type ProfileRewardMenusProps = {
  inventory: UserInventoryItem[]
  rewards: RewardLedgerEntry[]
}

export function ProfileRewardMenus({ inventory, rewards }: ProfileRewardMenusProps) {
  const [openMenu, setOpenMenu] = useState<'inventory' | 'rewards' | null>('inventory')

  return (
    <section className="profile-menu-list" aria-label="奖励详情">
      <ProfileMenu
        id="inventory"
        icon="/assets/art/ui/rewards/inventory.svg"
        title="背包装备"
        meta={`${inventory.length} 件`}
        open={openMenu === 'inventory'}
        onToggle={() => setOpenMenu((value) => (value === 'inventory' ? null : 'inventory'))}
      >
        <div className="profile-menu-items">
          {inventory.map((entry) => (
            <article className="profile-inventory-row" key={entry.item.id}>
              <div>
                <strong>{entry.item.name}</strong>
                <span>{entry.item.description}</span>
              </div>
              <em>
                {entry.item.rarity} · x{entry.quantity}
              </em>
            </article>
          ))}
          {inventory.length === 0 ? <p className="profile-empty">还没有装备，首次 AC 会带来第一件收藏。</p> : null}
        </div>
      </ProfileMenu>

      <ProfileMenu
        id="rewards"
        icon="/assets/art/ui/rewards/ledger.svg"
        title="奖励记录"
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
