'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import {
  addAdminProblemSetItem,
  createAdminProblemSet,
  removeAdminProblemSetItem,
  setAdminProblemSetStatus,
  updateAdminProblemSet,
  updateAdminProblemSetItems,
  type LessonTrack,
  type ProblemSetItemDisplayMode,
  type ProblemSetUpsertInput,
  type ProblemSetStatus,
  type ProblemSetType,
  type ProblemSetVisibility,
} from '@/lib/services/problem-set-service'
import {
  generateLessonPlanForProblemSet,
  saveManualLessonPlanEdit,
} from '@/lib/services/lesson-plan-service'

const validStatuses = new Set<ProblemSetStatus>(['draft', 'review', 'published', 'archived'])
const validTypes = new Set<ProblemSetType>(['chapter', 'practice', 'review', 'challenge', 'import-review', 'lesson'])
const validVisibilities = new Set<ProblemSetVisibility>(['admin', 'student'])
const validTracks = new Set<LessonTrack>(['A', 'B'])
const validDisplayModes = new Set<ProblemSetItemDisplayMode>(['primary', 'backup', 'exam-only'])

export async function createLessonProblemSetAction(formData: FormData) {
  const context = await requireAdmin('editor')
  const input = readProblemSetInput(formData, 'lesson')

  if (!context.preview) {
    await createAdminProblemSet(input, { userId: context.userId, role: context.role })
  }

  revalidateProblemSetPaths(input.id)
}

export async function updateProblemSetDetailsAction(formData: FormData) {
  const context = await requireAdmin('editor')
  const input = readProblemSetInput(formData)

  if (!context.preview) {
    await updateAdminProblemSet(input, { userId: context.userId, role: context.role })
  }

  revalidateProblemSetPaths(input.id)
}

export async function setProblemSetStatus(formData: FormData) {
  const problemSetId = readRequiredString(formData, 'problemSetId')
  const status = readEnum(formData, 'status', validStatuses, 'Invalid problem set status request')
  const context = await requireAdmin('editor')

  if (!context.preview) {
    await setAdminProblemSetStatus({ id: problemSetId, status }, { userId: context.userId, role: context.role })
  }

  revalidateProblemSetPaths(problemSetId)
}

export async function addProblemSetItemAction(formData: FormData) {
  const context = await requireAdmin('editor')
  const problemSetId = readRequiredString(formData, 'problemSetId')
  const levelId = readRequiredString(formData, 'levelId')
  const position = readPositiveInteger(formData, 'position')
  const label = readOptionalString(formData, 'label')
  const required = formData.get('required') === 'on'
  const displayMode = readDisplayMode(formData, 'displayMode')

  if (!context.preview) {
    await addAdminProblemSetItem(
      { problemSetId, levelId, position, label, required, displayMode },
      { userId: context.userId, role: context.role },
    )
  }

  revalidateProblemSetPaths(problemSetId)
}

export async function updateProblemSetItemsAction(formData: FormData) {
  const context = await requireAdmin('editor')
  const problemSetId = readRequiredString(formData, 'problemSetId')
  const levelIds = formData.getAll('levelId').map((value) => String(value))

  const items = levelIds.map((levelId) => ({
    levelId,
    position: readPositiveInteger(formData, `position:${levelId}`),
    label: readOptionalString(formData, `label:${levelId}`),
    required: formData.get(`required:${levelId}`) === 'on',
    displayMode: readDisplayMode(formData, `displayMode:${levelId}`),
  }))

  if (!context.preview) {
    await updateAdminProblemSetItems(problemSetId, items, { userId: context.userId, role: context.role })
  }

  revalidateProblemSetPaths(problemSetId)
}

export async function removeProblemSetItemAction(formData: FormData) {
  const context = await requireAdmin('editor')
  const problemSetId = readRequiredString(formData, 'problemSetId')
  const levelId = readRequiredString(formData, 'levelId')

  if (!context.preview) {
    await removeAdminProblemSetItem({ problemSetId, levelId }, { userId: context.userId, role: context.role })
  }

  revalidateProblemSetPaths(problemSetId)
}

export async function generateLessonPlanAction(formData: FormData) {
  const context = await requireAdmin('editor')
  const problemSetId = readRequiredString(formData, 'problemSetId')

  if (!context.preview) {
    await generateLessonPlanForProblemSet(problemSetId, { userId: context.userId, role: context.role })
  }

  revalidateProblemSetPaths(problemSetId)
}

export async function saveLessonPlanMarkdownAction(formData: FormData) {
  const context = await requireAdmin('editor')
  const problemSetId = readRequiredString(formData, 'problemSetId')
  const markdown = readRequiredString(formData, 'markdown')

  if (!context.preview) {
    await saveManualLessonPlanEdit({ problemSetId, markdown }, { userId: context.userId, role: context.role })
  }

  revalidateProblemSetPaths(problemSetId)
}

function readProblemSetInput(formData: FormData, forcedType?: ProblemSetType): ProblemSetUpsertInput {
  const type = forcedType ?? readEnum(formData, 'type', validTypes, 'Invalid problem set type')
  const visibility = readEnum(formData, 'visibility', validVisibilities, 'Invalid problem set visibility')
  const trackValue = readOptionalString(formData, 'track')
  const track = trackValue && validTracks.has(trackValue as LessonTrack) ? (trackValue as LessonTrack) : null

  return {
    id: readRequiredString(formData, 'problemSetId'),
    title: readRequiredString(formData, 'title'),
    description: readOptionalString(formData, 'description'),
    type,
    visibility,
    spcgLevel: readOptionalInteger(formData, 'spcgLevel'),
    stageNo: readOptionalInteger(formData, 'stageNo'),
    track,
    lessonFocus: readOptionalString(formData, 'lessonFocus'),
  }
}

function readRequiredString(formData: FormData, key: string): string {
  const value = String(formData.get(key) ?? '').trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}

function readOptionalString(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? '').trim()
  return value || null
}

function readOptionalInteger(formData: FormData, key: string): number | null {
  const value = String(formData.get(key) ?? '').trim()
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) throw new Error(`${key} must be an integer`)
  return parsed
}

function readPositiveInteger(formData: FormData, key: string): number {
  const parsed = readOptionalInteger(formData, key)
  if (!parsed || parsed <= 0) throw new Error(`${key} must be a positive integer`)
  return parsed
}

function readEnum<T extends string>(formData: FormData, key: string, valid: Set<T>, message: string): T {
  const value = String(formData.get(key) ?? '')
  if (!valid.has(value as T)) throw new Error(message)
  return value as T
}

function readDisplayMode(formData: FormData, key: string): ProblemSetItemDisplayMode {
  return readEnum(formData, key, validDisplayModes, 'Invalid problem set item display mode')
}

function revalidateProblemSetPaths(problemSetId: string) {
  revalidatePath('/')
  revalidatePath('/map')
  revalidatePath('/admin')
  revalidatePath('/admin/curriculum')
  revalidatePath('/admin/problem-sets')
  revalidatePath(`/admin/problem-sets/${problemSetId}`)
}
