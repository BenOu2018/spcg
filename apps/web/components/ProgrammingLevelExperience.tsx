'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from 'next-auth'
import type { Level, Progress } from '@spcg/shared/types'
import { getGameChapter } from '@spcg/shared/game-chapters'
import { getProblemSetItemDisplayModeLabel } from '@spcg/shared/curriculum'
import { ProgrammingLevel } from '@/components/ProgrammingLevel'
import { TopbarAccountActions } from '@/components/TopbarAccountActions'
import { markLevelPagePayloadLevelPassed } from '@/lib/level-page-payload-cache'
import { markMapSnapshotLevelPassed } from '@/lib/map-snapshot-cache'
import { markMePagePayloadLevelPassed } from '@/lib/me-page-payload-cache'
import { getStudentUiMessages, type StudentUiMessages } from '@/lib/student-ui'
import { getStageLevelUnlockState, isStageLevelUnlocked, OPTIONAL_STAGE_LOCK_REASON } from '@/lib/stage-unlock'

type StagePathMenu = {
  title: string
  spcgLevel: number
  stageNo: number
  items: Array<{
    levelId: string
    title: string
    position: number
    displayMode: string
  }>
} | null

type ProgrammingLevelExperienceProps = {
  level: Level
  levels: Level[]
  stageLevels: Level[]
  userId: string
  session: Session | null
  stageMenu?: StagePathMenu
  progressRecords?: Progress[]
  canViewHints?: boolean
  hintsUpgradeMessage?: string
  messages?: StudentUiMessages
  canShowPricingMenu?: boolean
  canFreeJump?: boolean
  embeddedInMap?: boolean
}

type StageMenuItem = NonNullable<StagePathMenu>['items'][number]

type PromoteItem = {
  slot: number
  title: string
  roleLabel: string
  href: string | null
  levelId: string | null
  required: boolean
  passed: boolean
  current: boolean
  unlocked: boolean
  missing: boolean
  nodeAsset: string
}

const fallbackMessages = getStudentUiMessages('zh-CN')

export function ProgrammingLevelExperience({
  level,
  levels,
  stageLevels,
  userId,
  session,
  stageMenu = null,
  progressRecords = [],
  canViewHints = true,
  hintsUpgradeMessage,
  messages = fallbackMessages,
  canShowPricingMenu = false,
  canFreeJump = false,
  embeddedInMap = false,
}: ProgrammingLevelExperienceProps) {
  const router = useRouter()
  const [activeLevel, setActiveLevel] = useState(level)
  const [localProgressRecords, setLocalProgressRecords] = useState(progressRecords)

  const stageLevelById = useMemo(() => {
    const entries = [...stageLevels, level].map((item) => [item.id, item] as const)
    return new Map(entries)
  }, [level, stageLevels])

  const passedLevelIds = useMemo(
    () => new Set(localProgressRecords.filter((progress) => progress.passed).map((progress) => progress.levelId)),
    [localProgressRecords],
  )

  useEffect(() => {
    setActiveLevel(level)
  }, [level])

  useEffect(() => {
    setLocalProgressRecords(progressRecords)
  }, [progressRecords])

  useEffect(() => {
    function handlePopState() {
      const levelId = readLevelIdFromPath(window.location.pathname)
      if (!levelId) {
        if (embeddedInMap) return
        window.location.href = window.location.href
        return
      }

      const nextLevel = stageLevelById.get(levelId)
      if (nextLevel) {
        if (stageMenu && !isStageLevelUnlocked(stageMenu.items, levelId, passedLevelIds, canFreeJump)) {
          window.location.href = window.location.href
          return
        }
        setActiveLevel(nextLevel)
        return
      }

      window.location.href = window.location.href
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [canFreeJump, embeddedInMap, passedLevelIds, stageLevelById, stageMenu])

  function selectStageLevel(levelId: string) {
    if (stageMenu && !isStageLevelUnlocked(stageMenu.items, levelId, passedLevelIds, canFreeJump)) return

    const nextLevel = stageLevelById.get(levelId)
    if (!nextLevel) {
      window.location.href = getStageSelectionHref(levelId)
      return
    }

    setActiveLevel(nextLevel)
    const nextHref = getStageSelectionHref(levelId)
    const currentHref = `${window.location.pathname}${window.location.search}`
    if (currentHref !== nextHref) {
      window.history.pushState({ spcgInstantStageLevel: levelId }, '', nextHref)
    }
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
  }

  function markLevelPassed(levelId: string) {
    markLevelPagePayloadLevelPassed(userId, levelId)
    markMapSnapshotLevelPassed(userId, levelId)
    markMePagePayloadLevelPassed(userId, levelId)
    setLocalProgressRecords((current) => {
      const existing = current.find((progress) => progress.levelId === levelId)
      if (existing?.passed) return current

      if (existing) {
        return current.map((progress) =>
          progress.levelId === levelId
            ? {
                ...progress,
                passed: true,
                lastSubmittedAt: new Date().toISOString(),
              }
            : progress,
        )
      }

      return [
        ...current,
        {
          userId,
          levelId,
          passed: true,
          attemptCount: 1,
          bestRuntimeMs: null,
          lastSubmittedAt: new Date().toISOString(),
          passedOut: false,
        },
      ]
    })
  }

  const chapter = getGameChapter(activeLevel.chapterId)
  const mapHref = `/map?chapter=${chapter.chapterId}`
  const chapterLevels = levels.filter((item) => item.chapterId === activeLevel.chapterId)
  const stageLabel = stageMenu ? `第${stageMenu.stageNo}层 ${stageMenu.title}` : `第${activeLevel.order}层 ${activeLevel.title}`
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
  const promoteItems = buildPromoteItems({
    currentLevelId: activeLevel.id,
    fallbackLevels: chapterLevels,
    canFreeJump,
    passedLevelIds,
    stageItems: stageMenu?.items ?? null,
  })
  const promoteSummaryText = buildPromoteSummary(promoteItems, activeLevel.title)
  const nextStageHref = getNextStageHref({
    activeLevel,
    levels,
    stageMenu,
    fallbackChapterId: chapter.chapterId,
  })

  useEffect(() => {
    router.prefetch(mapHref)
  }, [mapHref, router])

  return (
    <>
      <header className="programming-topbar">
        <Link className="kit-logo" href={mapHref} aria-label="返回地图">
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
                  const active = item.levelId === activeLevel.id
                  const unlockState = getStageLevelUnlockState(stageMenu.items, item.levelId, passedLevelIds, canFreeJump)
                  const className = [active ? 'active' : '', !unlockState.unlocked ? 'locked' : ''].filter(Boolean).join(' ')
                  const itemContent = (
                    <>
                      <span>{String(item.position).padStart(2, '0')}</span>
                      <strong>{item.title}</strong>
                      <em>
                        {!unlockState.unlocked
                          ? '未解锁'
                          : `${getProblemSetItemDisplayModeLabel(item.displayMode)} · ${passed ? '已通过' : '未通过'}`}
                      </em>
                    </>
                  )

                  if (!unlockState.unlocked) {
                    return (
                      <span
                        aria-disabled="true"
                        className={className}
                        key={item.levelId}
                        title={unlockState.reason ?? OPTIONAL_STAGE_LOCK_REASON}
                      >
                        {itemContent}
                      </span>
                    )
                  }

                  return (
                    <Link
                      aria-current={active ? 'page' : undefined}
                      className={className || undefined}
                      data-navigation-feedback="false"
                      href={getStageSelectionHref(item.levelId)}
                      key={item.levelId}
                      onClick={(event) => {
                        if (!stageLevelById.has(item.levelId)) return
                        event.preventDefault()
                        if (!active) selectStageLevel(item.levelId)
                      }}
                    >
                      {itemContent}
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
              <PromoteNode item={item} key={item.slot} onSelect={selectStageLevel} switchable={Boolean(item.levelId && stageLevelById.has(item.levelId))} />
            ))}
          </nav>
          <span className="titlebar-promote-summary" title={promoteSummaryText}>
            {promoteSummaryText}
          </span>
        </section>
        <div className="programming-actions">
          <TopbarAccountActions
            session={session}
            mapHref={mapHref}
            showMapButton
            showProgressButton={false}
            messages={messages}
            canShowPricingMenu={canShowPricingMenu}
          />
        </div>
      </header>

      <section className="programming-main">
        <ProgrammingLevel
          level={activeLevel}
          userId={userId}
          stageMenu={stageMenu}
          progressRecords={localProgressRecords}
          canViewHints={canViewHints}
          hintsUpgradeMessage={hintsUpgradeMessage}
          messages={messages}
          canFreeJump={canFreeJump}
          onStageLevelSelect={selectStageLevel}
          onPassedLevelChange={markLevelPassed}
          fallbackNextHref={nextStageHref}
          fallbackNextLabel="下一关"
        />
      </section>
    </>
  )
}

function readLevelIdFromPath(pathname: string) {
  const match = pathname.match(/^\/level\/([^/]+)$/)
  return match ? decodeURIComponent(match[1]!) : null
}

function buildPromoteItems({
  currentLevelId,
  fallbackLevels,
  canFreeJump,
  passedLevelIds,
  stageItems,
}: {
  currentLevelId: string
  fallbackLevels: Array<{ id: string; title: string }>
  canFreeJump: boolean
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
    const unlocked = levelId ? isStageLevelUnlocked(sourceItems, levelId, passedLevelIds, canFreeJump) : false
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
      levelId,
      required,
      passed,
      current,
      unlocked,
      missing: !source,
      nodeAsset,
    }
  })
}

function getStageSelectionHref(levelId: string) {
  return `/level/${levelId}?stageSelect=1`
}

function getNextStageHref({
  activeLevel,
  levels,
  stageMenu,
  fallbackChapterId,
}: {
  activeLevel: Level
  levels: Level[]
  stageMenu: StagePathMenu
  fallbackChapterId: string
}) {
  const currentSpcgLevel = stageMenu?.spcgLevel ?? Number(activeLevel.difficulty.spcgLevel ?? 0)
  const currentStageNo = stageMenu?.stageNo ?? activeLevel.order
  const nextLevel = levels
    .slice()
    .sort(compareLevelPosition)
    .find((level) => {
      const spcgLevel = Number(level.difficulty.spcgLevel ?? 0)
      return spcgLevel > currentSpcgLevel || (spcgLevel === currentSpcgLevel && level.order > currentStageNo)
    })

  return nextLevel ? `/level/${nextLevel.id}` : `/map?chapter=${fallbackChapterId}`
}

function compareLevelPosition(a: Level, b: Level) {
  return (
    Number(a.difficulty.spcgLevel ?? 0) - Number(b.difficulty.spcgLevel ?? 0) ||
    a.order - b.order ||
    a.chapterId.localeCompare(b.chapterId) ||
    a.id.localeCompare(b.id)
  )
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

function PromoteNode({ item, onSelect, switchable }: { item: PromoteItem; onSelect: (levelId: string) => void; switchable: boolean }) {
  const className = [
    'titlebar-promote-node',
    `slot-${item.slot}`,
    item.current ? 'current' : '',
    item.passed ? 'passed' : '',
    item.slot >= 4 && item.passed ? 'optional-passed' : '',
    item.required ? 'required' : 'optional',
    !item.unlocked ? 'locked' : '',
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

  if (!item.href || item.current || !item.unlocked) {
    return (
      <span
        aria-disabled={!item.unlocked ? 'true' : undefined}
        aria-label={!item.unlocked ? `${label}，未解锁` : label}
        className={className}
        title={!item.unlocked ? OPTIONAL_STAGE_LOCK_REASON : item.title}
      >
        {content}
      </span>
    )
  }

  return (
    <Link
      aria-label={label}
      className={className}
      data-navigation-feedback={switchable ? 'false' : undefined}
      href={item.href}
      title={item.title}
      onClick={(event) => {
        if (!switchable || !item.levelId) return
        event.preventDefault()
        onSelect(item.levelId)
      }}
    >
      {content}
    </Link>
  )
}
