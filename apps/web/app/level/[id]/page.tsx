import type { CSSProperties } from 'react'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { LevelPageCacheBridge } from '@/components/LevelPageCacheBridge'
import { ProgrammingLevelExperience } from '@/components/ProgrammingLevelExperience'
import { requireUser } from '@/lib/auth-guard'
import { getLevelPagePayloadForSession } from '@/lib/services/level-page-payload-service'

type LevelPageProps = {
  params: Promise<{ id: string }> | { id: string }
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

const PROGRAMMING_SCENE_BACKGROUND_STYLE = {
  background:
    'linear-gradient(rgba(7, 11, 10, 0.18), rgba(7, 11, 10, 0.18)), url("/assets/art/backgrounds/ch1-mist-town/programming-bg-clean-v1.webp?v=20260512") center / cover no-repeat',
} satisfies CSSProperties

export default async function LevelPage({ params, searchParams }: LevelPageProps) {
  const { id } = await params
  const query = searchParams ? await searchParams : {}
  const explicitStageSelection = query.stageSelect === '1'
  const session = await requireUser(`/level/${id}${explicitStageSelection ? '?stageSelect=1' : ''}`)
  const result = await getLevelPagePayloadForSession({
    explicitStageSelection,
    levelId: id,
    session,
  })

  if (result.status === 'not-found') notFound()
  if (result.status === 'redirect') redirect(result.href)
  if (result.status === 'upgrade-required') return <LevelUpgradeRequired reason={result.reason} />
  const payload = result.viewPayload

  return (
    <main className="programming-scene" style={PROGRAMMING_SCENE_BACKGROUND_STYLE}>
      <ProgrammingLevelExperience
        level={payload.level}
        levels={payload.levels}
        stageLevels={payload.stageLevels}
        userId={payload.userId}
        session={payload.session}
        stageMenu={payload.stageMenu}
        progressRecords={payload.progressRecords}
        canViewHints={payload.canViewHints}
        hintsUpgradeMessage={payload.hintsUpgradeMessage}
        messages={payload.messages}
        canShowPricingMenu={payload.canShowPricingMenu}
        canFreeJump={payload.canFreeJump}
      />
      <LevelPageCacheBridge payload={result.cachePayload} />
    </main>
  )
}

function LevelUpgradeRequired({ reason }: { reason: string }) {
  return (
    <main className="programming-scene" style={PROGRAMMING_SCENE_BACKGROUND_STYLE}>
      <section className="upgrade-required-page">
        <div className="upgrade-required-panel">
          <span className="upgrade-required-kicker">需要升级</span>
          <h1>当前关卡暂未开放</h1>
          <p>{reason}</p>
          <div className="upgrade-required-actions">
            <Link className="upgrade-primary" href="/map">
              返回地图
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
