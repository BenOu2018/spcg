import type { CSSProperties, ElementType } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Archive, ArrowRight, Badge, Bot, Brain, Compass, LockKeyhole, ScrollText, Sparkles, Sword, Trophy } from 'lucide-react'
import { auth } from '@/auth'
import styles from './world.module.css'

export const metadata: Metadata = {
  title: '算法遗迹 | SPCG',
  description: '进入一座失落文明的算法遗迹，成为第一批探索者。',
}

export const dynamic = 'force-dynamic'

type NavItem = {
  label: string
  href: string
}

type Notice = {
  title: string
  body: string
}

type RuinNode = {
  title: string
  subtitle: string
  status: 'open' | 'locked'
  x: string
  y: string
}

type Feature = {
  label: string
  icon: ElementType
}

type LevelCard = {
  label: string
  body: string
  active?: boolean
}

const navItems: NavItem[] = [
  { label: '遗迹入口', href: '#entry' },
  { label: '挑战榜', href: '/leaderboard' },
  { label: '遗迹地图', href: '/map' },
  { label: '探索者', href: '#explorers' },
  { label: '关于我们', href: '#about' },
]

const notices: Notice[] = [
  { title: '第一遗迹已开放', body: '基础之门正在接纳新的低阶逻辑残留。' },
  { title: 'DFS 幕林断层', body: '新增探索路线记录已归档。' },
  { title: '第37位挑战者', body: '通过了递归回廊的初次解译。' },
]

const ruins: RuinNode[] = [
  { title: '第一遗迹', subtitle: '基础之门', status: 'open', x: '17%', y: '62%' },
  { title: '第二遗迹', subtitle: '数据山谷', status: 'locked', x: '43%', y: '44%' },
  { title: '第三遗迹', subtitle: '图论迷城', status: 'locked', x: '52%', y: '75%' },
  { title: '第四遗迹', subtitle: '动态迷宫', status: 'locked', x: '70%', y: '36%' },
  { title: '第五遗迹', subtitle: 'AI 之塔', status: 'locked', x: '86%', y: '66%' },
]

const features: Feature[] = [
  { label: '算法思维', icon: Brain },
  { label: '实战能力', icon: Sword },
  { label: 'AI 分析', icon: Bot },
  { label: '专属称号', icon: Badge },
  { label: '探索乐趣', icon: Compass },
]

const levels: LevelCard[] = [
  { label: 'LV1', body: 'GESP 一级', active: true },
  { label: 'LV2', body: 'GESP 二级' },
  { label: 'LV3', body: 'GESP 三级' },
  { label: 'LV4', body: 'GESP 四级' },
  { label: '更高遗迹', body: '探索中' },
]

export default async function WorldPage() {
  const session = await auth()
  const entryHref = session?.user ? '/map' : '/auth/sign-in?next=%2Fmap'

  return (
    <main className={`${styles.page} world-scene`}>
      <header className={styles.siteHeader}>
        <Link className={styles.brand} href="#entry" aria-label="SPCG 算法遗迹">
          <img className={styles.brandLogo} src="/assets/art/world/spcg-algorithm-ruins-logo-v5.webp" alt="SPCG 算法遗迹" />
        </Link>
        <nav className={styles.nav} aria-label="算法遗迹导航">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Link className={styles.loginButton} href={entryHref}>
          探索者登录
        </Link>
      </header>

      <section className={styles.hero} id="entry">
        <div className={styles.heroBackdrop} aria-hidden="true" />
        <div className={styles.codeRain} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>ANCIENT ALGORITHM RUINS</p>
            <h1 className={styles.heroTitle}>
              <img src="/assets/art/world/world-title-calligraphy-v1.webp" alt="算法遗迹" />
            </h1>
            <p className={styles.heroLead}>AI时代后，人类逐渐遗忘算法。直到有人再次踏入这片遗迹，试图修复最后的独立思考。</p>
            <div className={styles.heroActions}>
              <Link className={styles.passButton} href={entryHref}>
                <span className={styles.passButtonText}>
                  <strong>获取遗迹通行证</strong>
                  <em>关注抖音：算法遗迹2048</em>
                </span>
                <ArrowRight className={styles.passButtonIcon} size={18} strokeWidth={2.4} />
              </Link>
            </div>
          </div>

          <aside className={styles.noticePanel} aria-label="遗迹公告">
            <div className={styles.panelTitle}>
              <ScrollText size={19} strokeWidth={2.2} />
              <strong>遗迹公告</strong>
            </div>
            <ul>
              {notices.map((notice) => (
                <li key={notice.title}>
                  <span>{notice.title}</span>
                  <p>{notice.body}</p>
                </li>
              ))}
            </ul>
            <Link href="#archive">
              更多公告
              <ArrowRight size={14} strokeWidth={2.5} />
            </Link>
          </aside>
        </div>
      </section>

      <section className={styles.mapSection} id="map" aria-labelledby="map-title">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>RUINS ROUTE</p>
            <h2 id="map-title">遗迹地图</h2>
            <p>从第一遗迹出发，沿断裂路线探索真相。</p>
          </div>
          <Link className={styles.recordButton} href="/map">
            <Archive size={17} strokeWidth={2.2} />
            进入地图
          </Link>
        </div>

        <div className={styles.mapCanvas}>
          <svg className={styles.routeLayer} viewBox="0 0 1000 430" aria-hidden="true">
            <path d="M160 270 C260 150 360 260 450 178 C560 70 620 220 704 150 C790 80 850 190 900 278" />
            <path d="M450 178 C470 250 480 300 520 338" />
          </svg>
          <div className={styles.mapNodes}>
            {ruins.map((ruin) => (
              <article
                className={[styles.mapNode, ruin.status === 'open' ? styles.openNode : styles.lockedNode].join(' ')}
                key={ruin.title}
                style={{ '--node-x': ruin.x, '--node-y': ruin.y } as CSSProperties}
              >
                <span className={styles.nodeIcon} aria-hidden="true">
                  {ruin.status === 'open' ? <Sparkles size={18} strokeWidth={2.4} /> : <LockKeyhole size={18} strokeWidth={2.4} />}
                </span>
                <strong>{ruin.title}</strong>
                <em>{ruin.subtitle}</em>
                <small>{ruin.status === 'open' ? '已开放' : '未解锁'}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.infoGrid} id="archive" aria-label="遗迹能力与体系">
        <article className={styles.featurePanel}>
          <div className={styles.panelTitle}>
            <Trophy size={20} strokeWidth={2.2} />
            <strong>遗迹能获得什么？</strong>
          </div>
          <div className={styles.featureList}>
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <div className={styles.featureItem} key={feature.label}>
                  <span aria-hidden="true">
                    <Icon size={27} strokeWidth={2.1} />
                  </span>
                  <strong>{feature.label}</strong>
                </div>
              )
            })}
          </div>
        </article>

        <article className={styles.levelPanel}>
          <div>
            <p className={styles.eyebrow}>RANK ECHO</p>
            <h2>与 GESP 体系对应</h2>
            <p>部分遗迹与 GESP 能力体系对应，逐步修复思维阶位。</p>
          </div>
          <div className={styles.levelList}>
            {levels.map((level) => (
              <div className={[styles.levelCard, level.active ? styles.activeLevel : ''].filter(Boolean).join(' ')} key={level.label}>
                <strong>{level.label}</strong>
                <span>{level.body}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className={styles.banner} id="explorers">
        <div className={styles.bannerBackdrop} aria-hidden="true" />
        <div className={styles.bannerCopy}>
          <p className={styles.eyebrow}>FIRST EXPLORERS</p>
          <h2>成为第一批探索者</h2>
          <p>内测招募中，仅限前1000名挑战者。</p>
        </div>
        <Link className={styles.primaryButton} href={entryHref}>
          立即获取通行证
          <ArrowRight size={18} strokeWidth={2.4} />
        </Link>
      </section>

      <footer className={styles.footer} id="about">
        <div>
          <strong>SPCG 算法遗迹</strong>
          <span>让每一个孩子重新爱上编程</span>
        </div>
        <p>© 2026 SPCG. All rights reserved.</p>
        <nav aria-label="页脚链接">
          <Link href="#entry">遗迹入口</Link>
          <Link href="#archive">古代记录</Link>
          <Link href="#explorers">探索者</Link>
        </nav>
      </footer>
    </main>
  )
}
