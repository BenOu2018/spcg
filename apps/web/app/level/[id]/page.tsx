import type { CSSProperties } from 'react'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ProgrammingLevelExperience } from '@/components/ProgrammingLevelExperience'
import { requireUser } from '@/lib/auth-guard'
import { getCanShowPricingMenu } from '@/lib/services/account-menu-service'
import { getLessonStageMenu, getProgrammingLevelPageDataForUser } from '@/lib/level-data'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

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
  const [uiLocale, canShowPricingMenu] = await Promise.all([
    getRequestUiLocale(session.user.id),
    getCanShowPricingMenu(session.user.id),
  ])
  const messages = getStudentUiMessages(uiLocale)
  const { level, levels, progressRecords, stageMenu, stageLevels, access, hintsAccess } = await getProgrammingLevelPageDataForUser(session.user.id, id)

  if (!level) notFound()
  if (!access) redirect('/map')
  if (!access.allowed) {
    if (access.upgradeRequired) {
      return <LevelUpgradeRequired reason={access.reason ?? '当前用户类型无法访问该关卡。'} />
    }
    redirect(access.redirectLevelId ? `/level/${access.redirectLevelId}` : '/map')
  }
  const passedLevelIds = new Set(progressRecords.filter((progress) => progress.passed).map((progress) => progress.levelId))
  const nextStageLevelId = getProgressAwareStageLevelId({
    currentLevelId: level.id,
    passedLevelIds,
    stageItems: stageMenu?.items ?? null,
  })
  const isCurrentStudyStage =
    stageMenu?.items.some((item) => item.levelId === access.currentMapLevelId || item.levelId === access.currentEntryLevelId) ??
    false
  if (
    !access.canFreeJump &&
    isCurrentStudyStage &&
    !explicitStageSelection &&
    nextStageLevelId &&
    nextStageLevelId !== level.id
  ) {
    redirect(`/level/${nextStageLevelId}`)
  }

  const displayLevel = hintsAccess?.allowed ? level : { ...level, hints: [] }
  const displayStageLevels = hintsAccess?.allowed ? stageLevels : stageLevels.map((item) => ({ ...item, hints: [] }))

  return (
    <main className="programming-scene" style={PROGRAMMING_SCENE_BACKGROUND_STYLE}>
      <ProgrammingLevelExperience
        level={displayLevel}
        levels={levels}
        stageLevels={displayStageLevels}
        userId={session.user.id}
        session={session}
        stageMenu={stageMenu}
        progressRecords={progressRecords}
        canViewHints={hintsAccess?.allowed ?? false}
        hintsUpgradeMessage={hintsAccess?.reason ?? undefined}
        messages={messages}
        canShowPricingMenu={canShowPricingMenu}
      />
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

type StageMenuItem = NonNullable<Awaited<ReturnType<typeof getLessonStageMenu>>>['items'][number]

function getProgressAwareStageLevelId({
  currentLevelId,
  passedLevelIds,
  stageItems,
}: {
  currentLevelId: string
  passedLevelIds: Set<string>
  stageItems: StageMenuItem[] | null
}) {
  if (!stageItems || stageItems.length === 0) return null

  const orderedItems = stageItems.slice().sort((a, b) => a.position - b.position).slice(0, 5)
  const currentItem = orderedItems.find((item) => item.levelId === currentLevelId)
  if (!currentItem || !passedLevelIds.has(currentItem.levelId)) return null

  return orderedItems.find((item) => !passedLevelIds.has(item.levelId))?.levelId ?? null
}
