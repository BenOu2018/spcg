'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  DIFFICULTY_LAYER_LABELS,
  getLevelLabel,
  isDifficultyStars,
  isSpcgLevel,
} from '@spcg/shared/difficulty'
import { PROBLEM_SET_ITEM_DISPLAY_MODES } from '@spcg/shared/curriculum'
import { requireAdmin } from '@/lib/admin-auth'
import {
  createAdminProblemSet,
  updateAdminProblemSet,
  type LessonTrack,
  type ProblemSetVisibility,
} from '@/lib/services/problem-set-service'
import {
  addAdminCurriculumStageProblem,
  archiveAdminCurriculumProblem,
  createAdminCurriculumDraftLevel,
  updateAdminCurriculumProblemSummary,
  type CurriculumDisplayMode,
  type CurriculumProblemStatus,
} from '@/lib/services/curriculum-service'
import type { DifficultyLayerLabel } from '@spcg/shared/types'

const validDisplayModes = new Set<CurriculumDisplayMode>(PROBLEM_SET_ITEM_DISPLAY_MODES)
const validStatuses = new Set<CurriculumProblemStatus>(['draft', 'review', 'published', 'archived'])
const validDifficultyLabels = new Set<DifficultyLayerLabel>(DIFFICULTY_LAYER_LABELS)
const validTracks = new Set<LessonTrack>(['A', 'B'])
const validVisibilities = new Set<ProblemSetVisibility>(['admin', 'student'])

export async function createCurriculumStageAction(formData: FormData) {
  const context = await requireAdmin('editor')
  const spcgLevel = readInteger(formData, 'spcgLevel')
  const stageNo = readPositiveInteger(formData, 'stageNo')
  const track = readTrack(formData, 'track')
  const visibility = readVisibility(formData, 'visibility')
  const id = buildStageId(spcgLevel, stageNo, track)

  if (!isSpcgLevel(spcgLevel)) throw new Error('SPCG level must be 1-10')

  if (!context.preview) {
    await createAdminProblemSet(
      {
        id,
        title: readRequiredString(formData, 'title'),
        description: readOptionalString(formData, 'description'),
        type: 'lesson',
        visibility,
        spcgLevel,
        stageNo,
        track,
        lessonFocus: readRequiredString(formData, 'lessonFocus'),
      },
      { userId: context.userId, role: context.role },
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/curriculum')
  revalidatePath('/admin/problem-sets')
  redirect(`/admin/curriculum?level=${spcgLevel}&track=${track}&set=${id}`)
}

export async function updateCurriculumStageAction(formData: FormData) {
  const context = await requireAdmin('editor')
  const problemSetId = readRequiredString(formData, 'problemSetId')
  const spcgLevel = readInteger(formData, 'spcgLevel')
  const stageNo = readPositiveInteger(formData, 'stageNo')
  const track = readTrack(formData, 'track')
  const visibility = readVisibility(formData, 'visibility')

  if (!isSpcgLevel(spcgLevel)) throw new Error('SPCG level must be 1-10')

  if (!context.preview) {
    await updateAdminProblemSet(
      {
        id: problemSetId,
        title: readRequiredString(formData, 'title'),
        description: readOptionalString(formData, 'description'),
        type: 'lesson',
        visibility,
        spcgLevel,
        stageNo,
        track,
        lessonFocus: readRequiredString(formData, 'lessonFocus'),
      },
      { userId: context.userId, role: context.role },
    )
  }

  revalidateStage(problemSetId)
  redirect(curriculumUrl({ level: spcgLevel, track, set: problemSetId }))
}

export async function createCurriculumDraftLevelAction(formData: FormData) {
  const context = await requireAdmin('editor')
  const problemSetId = readRequiredString(formData, 'problemSetId')
  const levelId = readRequiredString(formData, 'levelId')
  const spcgLevel = readInteger(formData, 'spcgLevel')
  const track = readOptionalTrack(formData, 'track')
  const stars = readInteger(formData, 'stars')
  const difficultyLabel = readDifficultyLabel(formData, 'difficultyLabel')
  const displayMode = readDisplayMode(formData, 'displayMode')
  const position = readPositiveInteger(formData, 'position')

  if (!isSpcgLevel(spcgLevel)) throw new Error('SPCG level must be 1-10')
  if (!isDifficultyStars(stars)) throw new Error('Difficulty stars must be 1-5')

  const difficulty = {
    spcgLevel,
    levelLabel: getLevelLabel(spcgLevel),
    stars,
    label: difficultyLabel,
    lglevel: readOptionalString(formData, 'lglevel'),
  }
  const level = buildDraftLevel({
    id: levelId,
    chapterId: readRequiredString(formData, 'chapterId'),
    order: readInteger(formData, 'order'),
    title: readRequiredString(formData, 'title'),
    knowledgePoint: readRequiredString(formData, 'knowledgePoint'),
    difficulty,
  })

  if (!context.preview) {
    await createAdminCurriculumDraftLevel(
      {
        problemSetId,
        spcgLevel,
        position,
        itemLabel: readOptionalString(formData, 'itemLabel'),
        displayMode,
        level,
      },
      { userId: context.userId, role: context.role },
    )
  }

  revalidateCurriculum(problemSetId, levelId)
  redirect(curriculumUrl({ level: spcgLevel, track, set: problemSetId, problem: levelId }))
}

export async function addCurriculumStageProblemAction(formData: FormData) {
  const context = await requireAdmin('editor')
  const problemSetId = readRequiredString(formData, 'problemSetId')
  const levelId = readRequiredString(formData, 'levelId')
  const spcgLevel = readInteger(formData, 'spcgLevel')
  const track = readOptionalTrack(formData, 'track')
  const position = readPositiveInteger(formData, 'position')
  const displayMode = readDisplayMode(formData, 'displayMode')

  if (!isSpcgLevel(spcgLevel)) throw new Error('SPCG level must be 1-10')

  if (!context.preview) {
    await addAdminCurriculumStageProblem(
      {
        problemSetId,
        levelId,
        position,
        label: readOptionalString(formData, 'label'),
        required: formData.get('required') === 'on',
        displayMode,
      },
      { userId: context.userId, role: context.role },
    )
  }

  revalidateCurriculum(problemSetId, levelId)
  redirect(curriculumUrl({ level: spcgLevel, track, set: problemSetId, problem: levelId }))
}

export async function updateCurriculumProblemSummaryAction(formData: FormData) {
  const context = await requireAdmin('editor')
  const problemSetId = readRequiredString(formData, 'problemSetId')
  const levelId = readRequiredString(formData, 'levelId')
  const spcgLevel = readInteger(formData, 'spcgLevel')
  const track = readOptionalTrack(formData, 'track')
  const stars = readInteger(formData, 'stars')
  const difficultyLabel = readDifficultyLabel(formData, 'difficultyLabel')
  const status = readStatus(formData, 'status')
  const displayMode = readDisplayMode(formData, 'displayMode')
  const position = readPositiveInteger(formData, 'position')

  if (!isSpcgLevel(spcgLevel)) throw new Error('SPCG level must be 1-10')
  if (!isDifficultyStars(stars)) throw new Error('Difficulty stars must be 1-5')

  const difficulty = {
    spcgLevel,
    levelLabel: getLevelLabel(spcgLevel),
    stars,
    label: difficultyLabel,
    lglevel: readOptionalString(formData, 'lglevel'),
  }

  if (!context.preview) {
    await updateAdminCurriculumProblemSummary(
      {
        problemSetId,
        levelId,
        title: readRequiredString(formData, 'title'),
        knowledgePoint: readRequiredString(formData, 'knowledgePoint'),
        difficulty,
        status,
        position,
        itemLabel: readOptionalString(formData, 'itemLabel'),
        required: formData.get('required') === 'on',
        displayMode,
      },
      { userId: context.userId, role: context.role },
    )
  }

  revalidateCurriculum(problemSetId, levelId)
  redirect(curriculumUrl({ level: spcgLevel, track, set: problemSetId, problem: levelId }))
}

export async function archiveCurriculumProblemAction(formData: FormData) {
  const context = await requireAdmin('editor')
  const problemSetId = readRequiredString(formData, 'problemSetId')
  const levelId = readRequiredString(formData, 'levelId')
  const spcgLevel = readInteger(formData, 'spcgLevel')
  const track = readOptionalTrack(formData, 'track')

  if (!context.preview) {
    await archiveAdminCurriculumProblem(
      { problemSetId, levelId },
      { userId: context.userId, role: context.role },
    )
  }

  revalidateCurriculum(problemSetId, levelId)
  redirect(curriculumUrl({ level: spcgLevel, track, set: problemSetId }))
}

function revalidateStage(problemSetId: string) {
  revalidatePath('/')
  revalidatePath('/map')
  revalidatePath('/admin')
  revalidatePath('/admin/curriculum')
  revalidatePath('/admin/problem-sets')
  revalidatePath(`/admin/problem-sets/${problemSetId}`)
}

function buildStageId(spcgLevel: number, stageNo: number, track: LessonTrack): string {
  return `spcg${spcgLevel}-stage${String(stageNo).padStart(2, '0')}-${track.toLowerCase()}`
}

function curriculumUrl(input: { level: number; track: LessonTrack | null; set?: string; problem?: string }): string {
  const params = new URLSearchParams({ level: String(input.level) })
  if (input.track) params.set('track', input.track)
  if (input.set) params.set('set', input.set)
  if (input.problem) params.set('problem', input.problem)
  return `/admin/curriculum?${params.toString()}`
}

function buildDraftLevel(input: {
  id: string
  chapterId: string
  order: number
  title: string
  knowledgePoint: string
  difficulty: Record<string, unknown>
}) {
  return {
    id: input.id,
    chapterId: input.chapterId,
    order: input.order,
    title: input.title,
    knowledgePoint: input.knowledgePoint,
    difficulty: input.difficulty,
    description: `# ${input.title}\n\nTODO: 在这里填写题面。`,
    statementAssets: [],
    algorithmGraphs: [],
    localizedContent: {},
    inputFormat: 'TODO: 填写输入格式。',
    outputFormat: 'TODO: 填写输出格式。',
    testCases: Array.from({ length: 20 }, (_, index) => ({
      id: `case-${String(index + 1).padStart(2, '0')}`,
      input: '0\n',
      expectedOutput: '0\n',
      visibility: index < 2 ? 'public' : 'hidden',
      note: 'admin draft placeholder',
    })),
    hints: [
      { step: 1, title: '读题', content: 'TODO: 第一条提示。' },
      { step: 2, title: '思路', content: 'TODO: 第二条提示。' },
      { step: 3, title: '实现', content: 'TODO: 第三条提示。' },
    ],
    solution: {
      explanation: 'TODO: 填写题解。',
      keyPoints: ['TODO'],
      complexity: { time: 'O(1)', memory: 'O(1)' },
    },
    officialCode: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << 0 << endl;\n    return 0;\n}\n',
    starterCode: '#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n',
    source: {
      type: 'original',
      name: 'SPCG 后台草稿',
      url: null,
      author: null,
      license: null,
      attribution: null,
      notes: '管理员在后台新建的草稿题。',
    },
    importMeta: {
      templateVersion: 'admin-draft-v0.1',
      importedAt: null,
      importBatch: null,
      checksum: null,
      validationStatus: 'pending',
      validationErrors: [],
      sourceFormat: 'spcg-level-v0.1',
      defaultLanguage: 'cpp14',
      officialCodeLanguage: 'cpp14',
    },
  }
}

function revalidateCurriculum(problemSetId: string, levelId: string) {
  revalidatePath('/')
  revalidatePath('/map')
  revalidatePath('/admin')
  revalidatePath('/admin/curriculum')
  revalidatePath('/admin/levels')
  revalidatePath(`/admin/levels/${levelId}`)
  revalidatePath('/admin/problem-sets')
  revalidatePath(`/admin/problem-sets/${problemSetId}`)
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

function readInteger(formData: FormData, key: string): number {
  const parsed = Number(readRequiredString(formData, key))
  if (!Number.isInteger(parsed)) throw new Error(`${key} must be an integer`)
  return parsed
}

function readPositiveInteger(formData: FormData, key: string): number {
  const parsed = readInteger(formData, key)
  if (parsed <= 0) throw new Error(`${key} must be positive`)
  return parsed
}

function readDisplayMode(formData: FormData, key: string): CurriculumDisplayMode {
  const value = readRequiredString(formData, key)
  if (!validDisplayModes.has(value as CurriculumDisplayMode)) throw new Error('Invalid display mode')
  return value as CurriculumDisplayMode
}

function readTrack(formData: FormData, key: string): LessonTrack {
  const value = readRequiredString(formData, key)
  if (!validTracks.has(value as LessonTrack)) throw new Error('Invalid track')
  return value as LessonTrack
}

function readOptionalTrack(formData: FormData, key: string): LessonTrack | null {
  const value = String(formData.get(key) ?? '').trim()
  if (!value) return null
  if (!validTracks.has(value as LessonTrack)) throw new Error('Invalid track')
  return value as LessonTrack
}

function readVisibility(formData: FormData, key: string): ProblemSetVisibility {
  const value = readRequiredString(formData, key)
  if (!validVisibilities.has(value as ProblemSetVisibility)) throw new Error('Invalid visibility')
  return value as ProblemSetVisibility
}

function readStatus(formData: FormData, key: string): CurriculumProblemStatus {
  const value = readRequiredString(formData, key)
  if (!validStatuses.has(value as CurriculumProblemStatus)) throw new Error('Invalid status')
  return value as CurriculumProblemStatus
}

function readDifficultyLabel(formData: FormData, key: string): DifficultyLayerLabel {
  const value = readRequiredString(formData, key)
  if (!validDifficultyLabels.has(value as DifficultyLayerLabel)) throw new Error('Invalid difficulty label')
  return value as DifficultyLayerLabel
}
