export const OPTIONAL_STAGE_LOCK_REASON = '请先完成本关前三题，再解锁提高题。'

export type StageUnlockItem = {
  levelId: string
  position: number
}

export type StageLevelUnlockState = {
  unlocked: boolean
  reason: string | null
  redirectLevelId: string | null
}

export function getStageLevelUnlockState(
  items: StageUnlockItem[],
  levelId: string,
  passedLevelIds: Set<string>,
  canFreeJump = false,
): StageLevelUnlockState {
  if (canFreeJump) return unlockedState()

  const orderedItems = getOrderedStageItems(items)
  const target = orderedItems.find((item) => item.levelId === levelId)
  if (!target || target.position <= 3) return unlockedState()

  if (isStageOptionalUnlocked(orderedItems, passedLevelIds)) return unlockedState()

  return {
    unlocked: false,
    reason: OPTIONAL_STAGE_LOCK_REASON,
    redirectLevelId: getFirstUnpassedRequiredStageLevelId(orderedItems, passedLevelIds) ?? orderedItems[0]?.levelId ?? null,
  }
}

export function isStageLevelUnlocked(
  items: StageUnlockItem[],
  levelId: string,
  passedLevelIds: Set<string>,
  canFreeJump = false,
): boolean {
  return getStageLevelUnlockState(items, levelId, passedLevelIds, canFreeJump).unlocked
}

export function isStageOptionalUnlocked(items: StageUnlockItem[], passedLevelIds: Set<string>): boolean {
  const requiredItems = getRequiredStageItems(items)
  return requiredItems.length >= 3 && requiredItems.every((item) => passedLevelIds.has(item.levelId))
}

export function getFirstUnpassedRequiredStageLevelId(items: StageUnlockItem[], passedLevelIds: Set<string>): string | null {
  return getRequiredStageItems(items).find((item) => !passedLevelIds.has(item.levelId))?.levelId ?? null
}

function getRequiredStageItems(items: StageUnlockItem[]): StageUnlockItem[] {
  return getOrderedStageItems(items).filter((item) => item.position <= 3).slice(0, 3)
}

function getOrderedStageItems(items: StageUnlockItem[]): StageUnlockItem[] {
  return items.slice().sort((a, b) => a.position - b.position)
}

function unlockedState(): StageLevelUnlockState {
  return {
    unlocked: true,
    reason: null,
    redirectLevelId: null,
  }
}
