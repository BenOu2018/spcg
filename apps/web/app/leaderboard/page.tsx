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
  description: '按 SPCG 级别统计题目、复习和段位赛积分的排行榜。',
}

export const dynamic = 'force-dynamic'

type ActivityKind = 'fresh' | 'normal' | 'decay'
type Tone = 'gold' | 'silver' | 'bronze'

type LeaderboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

const assetBase = '/assets/art/ui/leaderboard-rpg/svg'
const rankWeaponBase = '/assets/art/ui/rewards/rank-weapons/thumbnails'
const fallbackAvatars = ['avatar-ranger.svg', 'avatar-knight.svg', 'avatar-mage.svg', 'avatar-scout.svg']
const levelNumbers = Array.from({ length: 9 }, (_, index) => index + 1)
const levelWeaponThumbnails = {
  1: { fileName: 'black-iron-weapon-thumb.webp', label: '黑铁' },
  2: { fileName: 'bronze-weapon-thumb.webp', label: '青铜' },
  3: { fileName: 'silver-weapon-thumb.webp', label: '白银' },
  4: { fileName: 'gold-weapon-thumb.webp', label: '黄金' },
  5: { fileName: 'platinum-weapon-thumb.webp', label: '铂金' },
  6: { fileName: 'diamond-weapon-thumb.webp', label: '钻石' },
  7: { fileName: 'star-glory-weapon-thumb.webp', label: '星耀' },
  8: { fileName: 'king-weapon-thumb.webp', label: '王者' },
  9: { fileName: 'master-weapon-thumb.webp', label: '大师' },
} as const

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
  const levelWeapon = getLevelWeaponThumbnail(leaderboard.spcgLevel)
  const rankListEntries = leaderboard.topEntries.filter((student) => student.rank > 3)
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
            <img src={levelWeapon.src} alt="" />
            <strong>{leaderboard.hudTitle}</strong>
          </div>

          <div className={styles.portalCard}>
            <div className={styles.portalArt}>
              <img className={styles.portalWeapon} src={levelWeapon.src} alt={levelWeapon.alt} />
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
            <small>来自 SPCG {leaderboard.spcgLevel}级题目、复习 AC 和段位赛奖励。</small>
          </div>

          <div className={styles.decayNotice}>
            <img src={`${assetBase}/scroll-pass.svg`} alt="" />
            <p>只统计当级别积分；隐藏蒜粒、后台调整和其他级别奖励不计入本榜。</p>
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
                  <PodiumStats student={student} />
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

            {rankListEntries.map((student, index) => (
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
                <span>{formatPassed(student.passedCount)}</span>
                <span className={styles.sourceCell}>多源积分</span>
                <span className={styles.akCell}>
                  <img src={`${assetBase}/ak-star.svg`} alt="" />
                  {student.passedCount}
                </span>
                <ActivityBadge kind={activityKind(student.lastScoredAt)} label={activityLabel(student.lastScoredAt)} />
                <span className={styles.scoreCell}>{formatNumber(student.rankScore)}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className={styles.rulesPanel} aria-label={messages.leaderboard.rules}>
          <PanelTitle icon="scroll-pass.svg" title={messages.leaderboard.rules} />

          <div className={styles.ruleList}>
            <Rule icon="coin.svg" label="普通题" value="难度系数金币" />
            <Rule icon="scroll-pass.svg" label="复习 AC" value="每题+2金币" />
            <Rule icon="error-rune.svg" label="段位赛" value="得分比例×难度" />
            <Rule icon="ak-star.svg" label="段位赛 AK" value="+10金币/榜分" />
          </div>

          <div className={styles.decayPanel}>
            <PanelTitle icon="level-gem.svg" title="特殊说明" />
            <div><span>1</span><strong>获得前三的同学将获得“上榜”背包物品，每周结算。</strong></div>
            <div><span>2</span><strong>获得第一的同学激活“霸榜”物品。</strong></div>
            <div className={styles.decayWarning}><span>3</span><strong>超过 15 天没有获得当级别积分的学员，该榜积分将按每周扣减 10%，新学员要趁机超越霸榜。</strong></div>
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
        <Summary label={messages.leaderboard.currentScore} value={formatScorePair(currentUser)} />
        <Summary label={messages.leaderboard.passed} value={formatPassed(currentPassedCount)} positive={currentPassedCount > 0} />
        <div className={styles.progressBlock}>
          <span>{messages.leaderboard.myProgress}</span>
          <div><i style={{ width: `${progressPercent(currentPassedCount, levelTotal)}%` }} /></div>
          <strong>{formatPassed(currentPassedCount)}</strong>
        </div>
        <div className={styles.rewardCard}>
          <img src={`${assetBase}/treasure-chest.svg`} alt="" />
          <span>本级排名说明</span>
          <strong>{session ? (currentUser ? '已进入本级榜单' : '获得当级别积分即可上榜') : '登录后查看个人排名'}</strong>
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

  if (rank <= 6) {
    return (
      <span
        className={[styles.rankMedal, styles.rankMedalText, styles[`rankMedal${rank}`]].filter(Boolean).join(' ')}
        aria-label={`第 ${rank} 名`}
      >
        {rank}
      </span>
    )
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

function PodiumStats({ student }: { student: LevelLeaderboardEntry }) {
  return (
    <div className={styles.podiumStats} aria-label={`${formatNumber(student.coinTotal)} 金币，${student.passedCount} 题，${formatActiveDays(student.lastScoredAt)}`}>
      <span title="金币">
        <img src={`${assetBase}/coin.svg`} alt="" />
        {formatNumber(student.coinTotal)}
      </span>
      <span title="题目">
        <img src={`${assetBase}/scroll-pass.svg`} alt="" />
        {student.passedCount}
      </span>
      <span title="最近得分">
        <img src={`${assetBase}/decay-hourglass.svg`} alt="" />
        {formatActiveDays(student.lastScoredAt)}
      </span>
    </div>
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

function getLevelWeaponThumbnail(level: number): { src: string; alt: string } {
  const weapon =
    levelWeaponThumbnails[level as keyof typeof levelWeaponThumbnails] ??
    levelWeaponThumbnails[8]

  return {
    src: `${rankWeaponBase}/${weapon.fileName}`,
    alt: `SPCG ${level}级 ${weapon.label}兵器`,
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function formatPassed(passedCount: number): string {
  return `${passedCount} 题`
}

function formatScorePair(student: LevelLeaderboardEntry | null): string {
  if (!student) return '0 金币 / 折后 0'
  return `${formatNumber(student.coinTotal)} 金币 / 折后 ${formatNumber(student.rankScore)}`
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

function formatActiveDays(value: string): string {
  const days = daysSince(value)
  if (days <= 0) return '今天'
  return `${days}天`
}

function daysSince(value: string): number {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return 999
  return Math.max(0, Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000)))
}
