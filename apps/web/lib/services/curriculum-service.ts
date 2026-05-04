import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  addCurriculumProblemToStage,
  archiveCurriculumProblem,
  createCurriculumDraftLevel,
  updateCurriculumProblemSummary,
  type CurriculumAuditContext,
  type CurriculumDisplayMode,
  type CurriculumDraftLevelRecord,
  type CurriculumProblemStatus,
} from '@/lib/repositories/curriculum-repository'
import { ServiceError } from '@/lib/services/errors'

export type {
  CurriculumAuditContext,
  CurriculumDisplayMode,
  CurriculumDraftLevelRecord,
  CurriculumProblemStatus,
}

export async function addAdminCurriculumStageProblem(
  input: {
    problemSetId: string
    levelId: string
    position: number
    label: string | null
    required: boolean
    displayMode: CurriculumDisplayMode
  },
  audit: CurriculumAuditContext,
) {
  ensureDbConfigured()
  if (!input.problemSetId || !input.levelId) {
    throw new ServiceError('bad_request', '关卡和题目不能为空。', 400)
  }
  if (!Number.isInteger(input.position) || input.position <= 0) {
    throw new ServiceError('bad_request', '题目位置必须是正整数。', 400)
  }
  await translateRepositoryErrors(() =>
    addCurriculumProblemToStage(
      {
        ...input,
        label: input.label?.trim() || null,
      },
      audit,
    ),
  )
}

export async function createAdminCurriculumDraftLevel(
  input: {
    problemSetId: string
    spcgLevel: number
    position: number
    itemLabel: string | null
    displayMode: CurriculumDisplayMode
    level: CurriculumDraftLevelRecord
  },
  audit: CurriculumAuditContext,
) {
  ensureDbConfigured()
  await translateRepositoryErrors(() => createCurriculumDraftLevel(input, audit))
}

export async function updateAdminCurriculumProblemSummary(
  input: {
    problemSetId: string
    levelId: string
    title: string
    knowledgePoint: string
    difficulty: Record<string, unknown>
    status: CurriculumProblemStatus
    position: number
    itemLabel: string | null
    required: boolean
    displayMode: CurriculumDisplayMode
  },
  audit: CurriculumAuditContext,
) {
  ensureDbConfigured()
  await translateRepositoryErrors(() => updateCurriculumProblemSummary(input, audit))
}

export async function archiveAdminCurriculumProblem(
  input: { problemSetId: string; levelId: string },
  audit: CurriculumAuditContext,
) {
  ensureDbConfigured()
  await translateRepositoryErrors(() => archiveCurriculumProblem(input, audit))
}

function ensureDbConfigured() {
  if (!isDatabaseConfigured()) throw new ServiceError('db_unconfigured', '数据库未配置。', 503)
}

async function translateRepositoryErrors(callback: () => Promise<void>) {
  try {
    await callback()
  } catch (error) {
    if (isPgError(error) && error.code === '23505') {
      throw new ServiceError('conflict', '题目 ID、关卡位置或题目位置已存在，请检查后重试。', 409)
    }
    if (isPgError(error) && error.code === '23503') {
      throw new ServiceError('bad_request', '关卡或题目不存在。', 400)
    }
    if (isPgError(error) && error.code === '23514') {
      throw new ServiceError('bad_request', '题目字段不符合数据库约束。', 400)
    }
    if (error instanceof Error && error.message === 'Problem must already belong to the same curriculum stage') {
      throw new ServiceError('bad_request', '只能导入当前关卡题目池内的题目。', 400)
    }
    throw error
  }
}

function isPgError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code: unknown }).code === 'string'
}
