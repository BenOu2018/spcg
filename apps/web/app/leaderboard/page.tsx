import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import type { LevelLeaderboardEntry } from '@spcg/shared/types'
import { auth } from '@/auth'
import { getLevelLeaderboard, normalizeLeaderboardLevel } from '@/lib/services/leaderboard-service'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'
import styles from './leaderboard.module.css'

export const metadata: Metadata = {
  title: 'SPCG 挑战榜',
  description: '按 SPCG 级别统计首次 AC 金币的排行榜。',
}

export const dynamic = 'force-dynamic'

type ActivityKind = 'fresh' | 'normal' | 'decay'
type Tone = 'gold' | 'silver' | 'bronze'

type LeaderboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

const assetBase = '/assets/art/ui/leaderboard-rpg/svg'
const fallbackAvatars = ['avatar-ranger.svg', 'avatar-knight.svg', 'avatar-mage.svg', 'avatar-scout.svg']
const levelNumbers = Array.from({ length: 9 }, (_, index) => index + 1)

export default async function LeaderboardPage({ searchParams }: LeaderboardPageProps) {
  const params = searchParams ? await searchParams : {}
  const spcgLevel = normalizeLeaderboardLevel(params.level)
  const session = await auth()
  const messages = getStudentUiMessages(await getRequestUiLocale(session?.user?.id))
  const leaderboard = await getLevelLeaderboard({ spcgLevel, currentUserId: session?.user?.id, limit: 50 })
  const levelTotal = leaderboard.levelTotal
  const currentUser = leaderboard.currentUser
  const currentDisplayName = currentUser?.displayName ?? session?.user?.name ?? '登录后查看'
  const currentTitle = currentUser?.title ?? (session ? '本级暂无积分' : '未登录')
  const currentAvatar = currentUser?.avatarUrl ?? session?.user?.avatarUrl ?? `${assetBase}/avatar-ranger.svg`
  const currentPassedCount = currentUser?.passedCount ?? 0
  const pageStyle = {
    '--leaderboard-map-bg': `url("${leaderboard.mapAsset}")`,
  } as CSSProperties

  return (
    <main className={styles.page} style={pageStyle}>
      <header className={styles.topBar}>
        <div className={styles.guildMark}>
          <img src={`${assetBase}/guild-crest.svg`} alt="" />
        </div>

        <div className={styles.heroTitle}>
          <span>Shadow Programming Challenge Guild</span>
          <strong>{messages.leaderboard.title}</strong>
        </div>

        <nav className={styles.levelTabs} aria-label={messages.leaderboard.selectLevel}>
          <span>{messages.leaderboard.selectLevel}</span>
          <div>
            {levelNumbers.map((level) => (
              <a
                key={level}
                className={level === leaderboard.spcgLevel ? styles.activeLevel : undefined}
                href={`/leaderboard?level=${level}`}
                aria-current={level === leaderboard.spcgLevel ? 'page' : undefined}
                title={`SPCG ${level}级排行榜`}
              >
                {level}
              </a>
            ))}
          </div>
        </nav>

        <img className={styles.topChest} src={`${assetBase}/treasure-chest.svg`} alt="" />
      </header>

      <section className={styles.boardLayout}>
        <aside className={styles.levelPanel} aria-label={messages.leaderboard.levelOverview}>
          <div className={styles.levelBanner}>
            <img src={`${assetBase}/level-gem.svg`} alt="" />
            <strong>{leaderboard.hudTitle}</strong>
          </div>

          <div className={styles.portalCard}>
            <div className={styles.portalArt}>
              <img src={`${assetBase}/level-gem.svg`} alt="" />
            </div>
            <span>{messages.leaderboard.levelOverview}</span>
          </div>

          <div className={styles.rewardPool}>
            <span>{messages.leaderboard.levelCoins}</span>
            <div>
              <img src={`${assetBase}/coin.svg`} alt="" />
              <strong>{formatNumber(leaderboard.totalCoins)}</strong>
              <em>{messages.profile.coins}</em>
            </div>
            <small>只来自 SPCG {leaderboard.spcgLevel}级题目的首次 AC 奖励。</small>
          </div>

          <div className={styles.decayNotice}>
            <img src={`${assetBase}/scroll-pass.svg`} alt="" />
            <p>用户总金币、考试奖励、隐藏蒜粒、后台调整暂不计入本榜。</p>
          </div>

          <div className={styles.sideStats}>
            <Metric icon="guild-crest.svg" label={messages.leaderboard.participants} value={formatNumber(leaderboard.totalParticipants)} />
            <Metric icon="scroll-pass.svg" label={messages.leaderboard.todayAc} value={formatNumber(leaderboard.todayPassedCount)} />
            <Metric icon="ak-star.svg" label={messages.leaderboard.levelCount} value={levelTotal > 0 ? String(levelTotal) : '待配置'} />
          </div>
        </aside>

        <section className={styles.rankBoard} aria-label={messages.leaderboard.ranking}>
          <div className={styles.boardRibbon}>
            <span />
            <strong>{messages.leaderboard.ranking}</strong>
            <span />
          </div>

          {leaderboard.podium.length > 0 ? (
            <div className={styles.podium}>
              {leaderboard.podium.map((student, index) => (
                <article key={student.userId} className={[styles.podiumCard, styles[podiumTone(student.rank)]].join(' ')}>
                  <img className={styles.medal} src={`${assetBase}/medal-${student.rank}.svg`} alt={`第 ${student.rank} 名`} />
                  <img className={styles.avatar} src={avatarFor(student, index)} alt="学员头像" />
                  <strong>{student.displayName}</strong>
                  <small>{student.title}</small>
                  <span>{formatNumber(student.coinTotal)} 金币</span>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <img src={`${assetBase}/treasure-chest.svg`} alt="" />
              <strong>{messages.leaderboard.emptyTitle}</strong>
              <span>{messages.leaderboard.emptyBody}</span>
            </div>
          )}

          <div className={styles.tableWrap}>
            <div className={styles.tableHead}>
              <span>{messages.leaderboard.rank}</span>
              <span>{messages.leaderboard.student}</span>
              <span>{messages.leaderboard.levelCoin}</span>
              <span>{messages.leaderboard.passed}</span>
              <span>{messages.leaderboard.source}</span>
              <span>{messages.leaderboard.count}</span>
              <span>{messages.leaderboard.activity}</span>
              <span>{messages.leaderboard.currentScore}</span>
            </div>

            {leaderboard.topEntries.map((student, index) => (
              <div key={student.userId} className={[styles.rankRow, student.rank === 1 ? styles.championRow : ''].filter(Boolean).join(' ')}>
                <RankIcon rank={student.rank} />
                <div className={styles.studentCell}>
                  <img src={avatarFor(student, index)} alt="学员头像" />
                  <div>
                    <strong>{student.displayName}</strong>
                    <small>{student.title}</small>
                  </div>
                </div>
                <span className={styles.coinCell}>
                  <img src={`${assetBase}/coin.svg`} alt="" />
                  {formatNumber(student.coinTotal)}
                </span>
                <span>{formatPassed(student.passedCount, levelTotal)}</span>
                <span className={styles.sourceCell}>{messages.leaderboard.firstAc}</span>
                <span className={styles.akCell}>
                  <img src={`${assetBase}/ak-star.svg`} alt="" />
                  {student.passedCount}
                </span>
                <ActivityBadge kind={activityKind(student.lastScoredAt)} label={activityLabel(student.lastScoredAt)} />
                <span className={styles.scoreCell}>{formatNumber(student.coinTotal)}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className={styles.rulesPanel} aria-label={messages.leaderboard.rules}>
          <PanelTitle icon="scroll-pass.svg" title={messages.leaderboard.rules} />

          <div className={styles.ruleList}>
            <Rule icon="coin.svg" label={messages.leaderboard.firstAc} value="SPCG级别 × 星级" />
            <Rule icon="scroll-pass.svg" label="本级榜单" value={`只计 ${leaderboard.spcgLevel}级`} />
            <Rule icon="ak-star.svg" label="重复 AC" value="不重复加分" />
            <Rule icon="error-rune.svg" label="考试 / 后台" value="暂不计入" />
          </div>

          <div className={styles.decayPanel}>
            <PanelTitle icon="level-gem.svg" title="计入口径" />
            <p>排行榜只看本级题目的首次 AC 金币，用来比较同一级别内的学习推进情况。</p>
            <div><span>统计来源</span><strong>reward_ledger</strong></div>
            <div><span>奖励类型</span><strong>level_first_ac</strong></div>
            <div><span>公开信息</span><strong>昵称、头像、称谓</strong></div>
            <small>不会展示手机号、邮箱、源码或隐藏测试点。</small>
          </div>
        </aside>
      </section>

      <section className={styles.myRankBar} aria-label={messages.leaderboard.myRank}>
        <div className={styles.myRank}>
          <span>{messages.leaderboard.myRank}</span>
          <strong>{currentUser?.rank ?? '—'}</strong>
        </div>
        <div className={styles.myProfile}>
          <img src={currentAvatar} alt="我的头像" />
          <div>
            <strong>{currentDisplayName}</strong>
            <span>{currentTitle}</span>
          </div>
        </div>
        <Summary label={messages.leaderboard.currentScore} value={`${formatNumber(currentUser?.coinTotal ?? 0)} ${messages.profile.coins}`} />
        <Summary label={messages.leaderboard.passed} value={formatPassed(currentPassedCount, levelTotal)} positive={currentPassedCount > 0} />
        <div className={styles.progressBlock}>
          <span>{messages.leaderboard.myProgress}</span>
          <div><i style={{ width: `${progressPercent(currentPassedCount, levelTotal)}%` }} /></div>
          <strong>{formatPassed(currentPassedCount, levelTotal)}</strong>
        </div>
        <div className={styles.rewardCard}>
          <img src={`${assetBase}/treasure-chest.svg`} alt="" />
          <span>本级排名说明</span>
          <strong>{session ? (currentUser ? '已进入本级榜单' : '完成首次 AC 即可上榜') : '登录后查看个人排名'}</strong>
        </div>
      </section>
    </main>
  )
}

function PanelTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className={styles.panelTitle}>
      <img src={`${assetBase}/${icon}`} alt="" />
      <strong>{title}</strong>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div>
      <img src={`${assetBase}/${icon}`} alt="" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Rule({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div>
      <img src={`${assetBase}/${icon}`} alt="" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function RankIcon({ rank }: { rank: number }) {
  if (rank <= 3) {
    return <img className={styles.rankMedal} src={`${assetBase}/medal-${rank}.svg`} alt={`第 ${rank} 名`} />
  }

  return <span className={styles.rankNumber}>{rank}</span>
}

function ActivityBadge({ kind, label }: { kind: ActivityKind; label: string }) {
  const icon = kind === 'fresh' ? 'streak-leaf.svg' : kind === 'decay' ? 'decay-hourglass.svg' : 'level-gem.svg'
  return (
    <span className={[styles.activityBadge, styles[kind]].join(' ')}>
      <img src={`${assetBase}/${icon}`} alt="" />
      {label}
    </span>
  )
}

function Summary({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className={styles.summary}>
      <span>{label}</span>
      <strong className={positive ? styles.positive : undefined}>{value}</strong>
    </div>
  )
}

function podiumTone(rank: number): Tone {
  if (rank === 1) return 'gold'
  if (rank === 2) return 'silver'
  return 'bronze'
}

function avatarFor(entry: Pick<LevelLeaderboardEntry, 'avatarUrl' | 'rank'>, index: number): string {
  return entry.avatarUrl ?? `${assetBase}/${fallbackAvatars[(entry.rank + index) % fallbackAvatars.length]}`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function formatPassed(passedCount: number, total: number): string {
  return total > 0 ? `${passedCount}/${total}` : String(passedCount)
}

function progressPercent(passedCount: number, total: number): number {
  if (total <= 0) return passedCount > 0 ? 100 : 0
  return Math.max(0, Math.min(100, Math.round((passedCount / total) * 100)))
}

function activityKind(value: string): ActivityKind {
  const days = daysSince(value)
  if (days <= 1) return 'fresh'
  return 'normal'
}

function activityLabel(value: string): string {
  const days = daysSince(value)
  if (days <= 0) return '今日得分'
  if (days === 1) return '1 天前'
  return `${days} 天前`
}

function daysSince(value: string): number {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return 999
  return Math.max(0, Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000)))
}
