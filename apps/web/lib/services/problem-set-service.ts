import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  PROBLEM_SET_ITEM_DISPLAY_MODES,
  V02_LESSON_ITEM_COUNT,
  V02_REQUIRED_ITEM_COUNT,
  isRequiredLessonProblemRole,
  type ProblemSetItemDisplayMode,
} from '@spcg/shared/curriculum'
import {
  addProblemSetItem,
  createProblemSet,
  getProblemSetDetail,
  listProblemSetLevelCandidates,
  listProblemSetSummaries,
  removeProblemSetItem,
  setProblemSetStatus,
  updateProblemSetDetails,
  updateProblemSetItems,
  type AdminAuditContext,
  type LessonTrack,
  type ProblemSetStatus,
  type ProblemSetType,
  type ProblemSetVisibility,
} from '@/lib/repositories/problem-set-repository'
import { ServiceError } from '@/lib/services/errors'

export type { LessonTrack, ProblemSetItemDisplayMode, ProblemSetStatus, ProblemSetType, ProblemSetVisibility }

export type ProblemSetUpsertInput = {
  id: string
  title: string
  description: string | null
  type: ProblemSetType
  visibility: ProblemSetVisibility
  spcgLevel: number | null
  stageNo: number | null
  track: LessonTrack | null
  lessonFocus: string | null
}

const VALID_TYPES = new Set<ProblemSetType>(['chapter', 'practice', 'review', 'challenge', 'import-review', 'lesson'])
const VALID_VISIBILITIES = new Set<ProblemSetVisibility>(['admin', 'student'])
const VALID_STATUSES = new Set<ProblemSetStatus>(['draft', 'review', 'published', 'archived'])
const VALID_TRACKS = new Set<LessonTrack>(['A', 'B'])
const VALID_DISPLAY_MODES = new Set<ProblemSetItemDisplayMode>(PROBLEM_SET_ITEM_DISPLAY_MODES)

export async function listAdminProblemSets() {
  if (!isDatabaseConfigured()) return []
  return listProblemSetSummaries()
}

export async function getAdminProblemSetDetail(id: string) {
  if (!isDatabaseConfigured()) return null
  return getProblemSetDetail(id)
}

export async function listAdminProblemSetLevelCandidates() {
  if (!isDatabaseConfigured()) return []
  return listProblemSetLevelCandidates()
}

export async function createAdminProblemSet(input: ProblemSetUpsertInput, audit: AdminAuditContext) {
  ensureDbConfigured()
  const normalized = normalizeProblemSetInput(input)
  await translateRepositoryErrors(() => createProblemSet(normalized, audit))
}

export async function updateAdminProblemSet(input: ProblemSetUpsertInput, audit: AdminAuditContext) {
  ensureDbConfigured()
  const normalized = normalizeProblemSetInput(input)
  await translateRepositoryErrors(() => updateProblemSetDetails(normalized, audit))
}

export async function setAdminProblemSetStatus(
  input: { id: string; status: ProblemSetStatus },
  audit: AdminAuditContext,
) {
  ensureDbConfigured()
  if (!input.id || !VALID_STATUSES.has(input.status)) {
    throw new ServiceError('bad_request', '题单状态参数不合法。', 400)
  }

  const set = await getProblemSetDetail(input.id)
  if (!set) throw new ServiceError('not_found', '题单不存在。', 404)
  if (input.status === 'published' && set.type === 'lesson') {
    ensureLessonItemsReady(set.items)
  }

  await translateRepositoryErrors(() => setProblemSetStatus(input, audit))
}

export async function addAdminProblemSetItem(
  input: {
    problemSetId: string
    levelId: string
    position: number
    label: string | null
    required: boolean
    displayMode: ProblemSetItemDisplayMode
  },
  audit: AdminAuditContext,
) {
  ensureDbConfigured()
  if (!input.problemSetId || !input.levelId) throw new ServiceError('bad_request', '题单或题目不能为空。', 400)
  if (!Number.isInteger(input.position) || input.position <= 0) {
    throw new ServiceError('bad_request', '题目位置必须是正整数。', 400)
  }
  if (!VALID_DISPLAY_MODES.has(input.displayMode)) {
    throw new ServiceError('bad_request', '题目用途必须是 v0.2 五题角色或 exam-only。', 400)
  }

  await translateRepositoryErrors(() =>
    addProblemSetItem(
      {
        ...input,
        label: normalizeNullableText(input.label),
      },
      audit,
    ),
  )
}

export async function updateAdminProblemSetItems(
  problemSetId: string,
  items: Array<{
    levelId: string
    position: number
    label: string | null
    required: boolean
    displayMode: ProblemSetItemDisplayMode
  }>,
  audit: AdminAuditContext,
) {
  ensureDbConfigured()
  if (!problemSetId) throw new ServiceError('bad_request', '题单不能为空。', 400)
  if (items.length === 0) throw new ServiceError('bad_request', '题目列表不能为空。', 400)

  const positions = new Set<number>()
  for (const item of items) {
    if (!item.levelId) throw new ServiceError('bad_request', '题目 ID 不能为空。', 400)
    if (!Number.isInteger(item.position) || item.position <= 0) {
      throw new ServiceError('bad_request', '题目位置必须是正整数。', 400)
    }
    if (positions.has(item.position)) throw new ServiceError('bad_request', '题目位置不能重复。', 400)
    if (!VALID_DISPLAY_MODES.has(item.displayMode)) {
      throw new ServiceError('bad_request', '题目用途必须是 v0.2 五题角色或 exam-only。', 400)
    }
    positions.add(item.position)
  }

  await translateRepositoryErrors(() =>
    updateProblemSetItems(
      problemSetId,
      items.map((item) => ({ ...item, label: normalizeNullableText(item.label) })),
      audit,
    ),
  )
}

export async function removeAdminProblemSetItem(
  input: { problemSetId: string; levelId: string },
  audit: AdminAuditContext,
) {
  ensureDbConfigured()
  if (!input.problemSetId || !input.levelId) throw new ServiceError('bad_request', '题单或题目不能为空。', 400)
  await translateRepositoryErrors(() => removeProblemSetItem(input, audit))
}

export async function ensureProblemSetCanGenerateLessonPlan(problemSetId: string) {
  const set = await getProblemSetDetail(problemSetId)
  if (!set) throw new ServiceError('not_found', '题单不存在。', 404)
  if (set.type !== 'lesson') throw new ServiceError('bad_request', '只有课程题单可以生成教案。', 400)

  ensureLessonItemsReady(set.items)
  return set
}

function normalizeProblemSetInput(input: ProblemSetUpsertInput): ProblemSetUpsertInput {
  const id = input.id.trim()
  const title = input.title.trim()
  const type = input.type
  const visibility = input.visibility

  if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(id)) {
    throw new ServiceError('bad_request', '题单 ID 只能使用小写字母、数字和连字符，长度 3-81。', 400)
  }
  if (!title) throw new ServiceError('bad_request', '题单标题不能为空。', 400)
  if (!VALID_TYPES.has(type)) throw new ServiceError('bad_request', '题单类型不合法。', 400)
  if (!VALID_VISIBILITIES.has(visibility)) throw new ServiceError('bad_request', '题单可见性不合法。', 400)

  if (type !== 'lesson') {
    return {
      id,
      title,
      type,
      visibility,
      description: normalizeNullableText(input.description),
      spcgLevel: null,
      stageNo: null,
      track: null,
      lessonFocus: null,
    }
  }

  const spcgLevel = input.spcgLevel
  const stageNo = input.stageNo

  if (typeof spcgLevel !== 'number' || !Number.isInteger(spcgLevel) || spcgLevel < 1 || spcgLevel > 10) {
    throw new ServiceError('bad_request', 'SPCG 等级必须是 1-10。', 400)
  }
  if (typeof stageNo !== 'number' || !Number.isInteger(stageNo) || stageNo <= 0) {
    throw new ServiceError('bad_request', '关卡编号必须是正整数。', 400)
  }
  if (!input.track || !VALID_TRACKS.has(input.track)) {
    throw new ServiceError('bad_request', '课程线路必须是 A 或 B。', 400)
  }
  if (!input.lessonFocus?.trim()) {
    throw new ServiceError('bad_request', '课程重点不能为空。', 400)
  }

  return {
    id,
    title,
    type,
    visibility,
    description: normalizeNullableText(input.description),
    spcgLevel,
    stageNo,
    track: input.track,
    lessonFocus: input.lessonFocus.trim(),
  }
}

function ensureLessonItemsReady(items: Array<{ required: boolean; displayMode: ProblemSetItemDisplayMode }>) {
  if (items.length !== V02_LESSON_ITEM_COUNT) {
    throw new ServiceError('bad_request', 'v0.2 课程题单必须固定 5 道题后才能发布或生成教案。', 400)
  }

  const requiredCount = items.filter((item) => item.required || isRequiredLessonProblemRole(item.displayMode)).length
  if (requiredCount < V02_REQUIRED_ITEM_COUNT) {
    throw new ServiceError('bad_request', 'v0.2 课程题单至少需要前 3 道主线必做题。', 400)
  }
}

function ensureDbConfigured() {
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text ? text : null
}

async function translateRepositoryErrors(callback: () => Promise<void>) {
  try {
    await callback()
  } catch (error) {
    if (isPgError(error) && error.code === '23505') {
      throw new ServiceError('conflict', '题单课程位置、题目位置或题目 ID 已存在，请检查后重试。', 409)
    }
    if (isPgError(error) && error.code === '23503') {
      throw new ServiceError('bad_request', '题单或题目不存在。', 400)
    }
    if (isPgError(error) && error.code === '23514') {
      throw new ServiceError('bad_request', '题单字段不符合数据库约束。', 400)
    }
    throw error
  }
}

function isPgError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code: unknown }).code === 'string'
}
