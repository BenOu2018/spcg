import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getGameChapter } from '@spcg/shared/game-chapters'
import { getProblemSetItemDisplayModeLabel } from '@spcg/shared/curriculum'
import { ProgrammingLevel } from '@/components/ProgrammingLevel'
import { TopbarAccountActions } from '@/components/TopbarAccountActions'
import { requireUser } from '@/lib/auth-guard'
import { getLevelAccessForUser } from '@/lib/services/level-access-service'
import { getFeatureAccess } from '@/lib/services/entitlement-service'
import { getLessonStageMenu, getLevelById, getMainlineLevels, getProgressRecords } from '@/lib/level-data'
import { getStudentUiMessages } from '@/lib/student-ui'
import { getRequestUiLocale } from '@/lib/student-ui-server'

type LevelPageProps = {
  params: Promise<{ id: string }> | { id: string }
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
}

export default async function LevelPage({ params, searchParams }: LevelPageProps) {
  const { id } = await params
  const query = searchParams ? await searchParams : {}
  const explicitStageSelection = query.stageSelect === '1'
  const session = await requireUser(`/level/${id}${explicitStageSelection ? '?stageSelect=1' : ''}`)
  const messages = getStudentUiMessages(await getRequestUiLocale(session.user.id))
  const [level, levels, progressRecords, stageMenu] = await Promise.all([
    getLevelById(id),
    getMainlineLevels(),
    getProgressRecords(),
    getLessonStageMenu(id),
  ])

  if (!level) notFound()
  const access = await getLevelAccessForUser({
    userId: session.user.id,
    levelId: level.id,
  })
  if (!access.allowed) {
    if (access.upgradeRequired) {
      return <LevelUpgradeRequired reason={access.reason ?? '当前用户类型无法访问该关卡。'} />
    }
    redirect(access.redirectLevelId ? `/level/${access.redirectLevelId}` : '/map')
  }
  const chapter = getGameChapter(level.chapterId)
  const chapterLevels = levels.filter((item) => item.chapterId === level.chapterId)
  const stageLabel = stageMenu ? `第${stageMenu.stageNo}层 ${stageMenu.title}` : `第${level.order}层 ${level.title}`
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

  const promoteItems = buildPromoteItems({
    currentLevelId: level.id,
    fallbackLevels: chapterLevels,
    passedLevelIds,
    stageItems: stageMenu?.items ?? null,
  })
  const promoteSummaryText = buildPromoteSummary(promoteItems, level.title)
  const stagePassedCount = stageMenu?.items.filter((item) => passedLevelIds.has(item.levelId)).length ?? 0
  const stageMasteryText = stageMenu
    ? stagePassedCount >= 5
      ? '5/5 完全掌握'
      : stagePassedCount >= 4
        ? `${stagePassedCount}/5 掌握良好`
        : stagePassedCount >= 3
          ? `${stagePassedCount}/5 主线完成`
          : `${stagePassedCount}/5 主线进行中`
    : null
  const hintsAccess = await getFeatureAccess({ userId: session.user.id, feature: 'hints' })
  const displayLevel = hintsAccess.allowed ? level : { ...level, hints: [] }

  return (
    <main className="programming-scene">
      <header className="programming-topbar">
        <Link className="kit-logo" href={`/map?chapter=${chapter.chapterId}`} aria-label="返回地图">
          <img src="/assets/art/backgrounds/ch1-mist-town/programming-ui-kit/logo-spcg.svg" alt="SPCG" />
        </Link>
        <div className="programming-level-context">
          <div className="chapter-pill">第{chapter.spcgLevel}级 {chapter.displayName}</div>
          <div className="chapter-pill">{stageMasteryText ? `${stageLabel} · ${stageMasteryText}` : stageLabel}</div>
          {stageMenu && stageMenu.items.length > 0 ? (
            <details className="programming-problem-menu">
              <summary>本层题目</summary>
              <div className="programming-problem-menu-panel">
                {stageMenu.items.map((item) => {
                  const passed = passedLevelIds.has(item.levelId)
                  return (
                    <Link
                      aria-current={item.levelId === level.id ? 'page' : undefined}
                      className={item.levelId === level.id ? 'active' : undefined}
                      href={getStageSelectionHref(item.levelId)}
                      key={item.levelId}
                    >
                      <span>{String(item.position).padStart(2, '0')}</span>
                      <strong>{item.title}</strong>
                      <em>
                        {getProblemSetItemDisplayModeLabel(item.displayMode)} · {passed ? '已通过' : '未通过'}
                      </em>
                    </Link>
                  )
                })}
              </div>
            </details>
          ) : null}
        </div>
        <section className="titlebar-promote-progress" aria-label="本层 5 题晋级进度">
          <nav className="titlebar-promote-nodes" aria-label="本层题目 1 到 5">
            {promoteItems.map((item) => (
              <PromoteNode item={item} key={item.slot} />
            ))}
          </nav>
          <span className="titlebar-promote-summary" title={promoteSummaryText}>
            {promoteSummaryText}
          </span>
        </section>
        <div className="programming-actions">
          <TopbarAccountActions session={session} mapHref={`/map?chapter=${chapter.chapterId}`} showMapButton messages={messages} />
        </div>
      </header>

      <section className="programming-main">
        <ProgrammingLevel
          level={displayLevel}
          userId={session.user.id}
          stageMenu={stageMenu}
          progressRecords={progressRecords}
          canViewHints={hintsAccess.allowed}
          hintsUpgradeMessage={hintsAccess.reason ?? undefined}
          messages={messages}
        />
      </section>
    </main>
  )
}

function LevelUpgradeRequired({ reason }: { reason: string }) {
  return (
    <main className="programming-scene">
      <section className="upgrade-required-page">
        <div className="upgrade-required-panel">
          <span className="upgrade-required-kicker">需要升级</span>
          <h1>当前关卡暂未开放</h1>
          <p>{reason}</p>
          <div className="upgrade-required-actions">
            <Link className="upgrade-primary" href="/pricing">
              查看升级方案
            </Link>
            <Link className="upgrade-secondary" href="/map">
              返回地图
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

type StageMenuItem = NonNullable<Awaited<ReturnType<typeof getLessonStageMenu>>>['items'][number]

type PromoteItem = {
  slot: number
  title: string
  roleLabel: string
  href: string | null
  required: boolean
  passed: boolean
  current: boolean
  missing: boolean
  nodeAsset: string
}

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

function buildPromoteItems({
  currentLevelId,
  fallbackLevels,
  passedLevelIds,
  stageItems,
}: {
  currentLevelId: string
  fallbackLevels: Array<{ id: string; title: string }>
  passedLevelIds: Set<string>
  stageItems: StageMenuItem[] | null
}): PromoteItem[] {
  const sourceItems =
    stageItems && stageItems.length > 0
      ? stageItems
          .slice()
          .sort((a, b) => a.position - b.position)
          .slice(0, 5)
          .map((item, index) => ({
            levelId: item.levelId,
            title: item.title,
            position: item.position || index + 1,
            displayMode: item.displayMode,
          }))
      : fallbackLevels.slice(0, 5).map((item, index) => ({
          levelId: item.id,
          title: item.title,
          position: index + 1,
          displayMode: null,
        }))

  return Array.from({ length: 5 }, (_, index) => {
    const slot = index + 1
    const source = sourceItems[index]
    const levelId = source?.levelId ?? null
    const current = levelId === currentLevelId
    const passed = levelId ? passedLevelIds.has(levelId) : false
    const required = slot <= 3
    const roleLabel = getPromoteRoleLabel(source?.displayMode, slot)
    const optionalPassed = slot >= 4 && passed
    const nodeAsset = optionalPassed
      ? slot === 4
        ? 'titlebar-node-advanced.svg'
        : 'titlebar-node-challenge.svg'
      : current
        ? 'titlebar-node-current.svg'
        : passed
        ? 'titlebar-node-completed.svg'
        : required
          ? 'titlebar-node-required.svg'
          : slot === 4
            ? 'titlebar-node-advanced.svg'
            : 'titlebar-node-challenge.svg'

    return {
      slot,
      title: source?.title ?? `${roleLabel}待导入`,
      roleLabel,
      href: levelId ? getStageSelectionHref(levelId) : null,
      required,
      passed,
      current,
      missing: !source,
      nodeAsset,
    }
  })
}

function getStageSelectionHref(levelId: string) {
  return `/level/${levelId}?stageSelect=1`
}

function getPromoteRoleLabel(displayMode: string | null | undefined, slot: number) {
  if (displayMode === 'template') return '模板题'
  if (displayMode === 'basic') return '基础题'
  if (displayMode === 'variant') return '变式题'
  if (displayMode === 'advanced') return '提高题'
  if (displayMode === 'challenge') return '挑战题'

  return ['模板题', '基础题', '变式题', '提高题', '挑战题'][slot - 1] ?? getProblemSetItemDisplayModeLabel(displayMode ?? '')
}

function buildPromoteSummary(items: PromoteItem[], currentLevelTitle: string) {
  const labels = ['模版', '基础', '变式', '提高', '挑战']
  const passedCount = items.filter((item) => !item.missing && item.passed).length
  const mainlinePassed = items.slice(0, 3).every((item) => !item.missing && item.passed)

  if (passedCount >= 5) return '完美通过此关'
  if (mainlinePassed) return '已通关，继续挑战难度'

  const current = items.find((item) => item.current)
  if (!current) return `当前：${currentLevelTitle}`

  return `${labels[current.slot - 1] ?? current.roleLabel}：${current.missing ? '待导入' : current.title}`
}

function PromoteNode({ item }: { item: PromoteItem }) {
  const className = [
    'titlebar-promote-node',
    `slot-${item.slot}`,
    item.current ? 'current' : '',
    item.passed ? 'passed' : '',
    item.slot >= 4 && item.passed ? 'optional-passed' : '',
    item.required ? 'required' : 'optional',
    item.missing ? 'missing' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const content = (
    <>
      <img src={`/assets/art/backgrounds/ch1-mist-town/promote/${item.nodeAsset}`} alt="" />
      <span>{item.passed && !item.current && item.slot < 4 ? '✓' : item.slot}</span>
      <b>{item.roleLabel}</b>
    </>
  )
  const label = `${item.roleLabel}，${item.current ? '当前题目，' : ''}${item.passed ? '已通过，' : ''}${item.title}`

  if (!item.href || item.current) {
    return (
      <span aria-label={label} className={className} title={item.title}>
        {content}
      </span>
    )
  }

  return (
    <Link aria-label={label} className={className} href={item.href} title={item.title}>
      {content}
    </Link>
  )
}
