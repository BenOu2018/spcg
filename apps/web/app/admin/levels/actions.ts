'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  DIFFICULTY_LAYER_LABELS,
  getLevelLabel,
  isDifficultyStars,
  isSpcgLevel,
} from '@spcg/shared/difficulty'
import { requireAdmin } from '@/lib/admin-auth'
import type { AdminStatus } from '@/lib/admin-data'
import { isDbConfigured, withTransaction } from '@/lib/db'
import type { DifficultyLayerLabel } from '@spcg/shared/types'

const validStatuses = new Set<AdminStatus>(['draft', 'review', 'published', 'archived'])
const validDifficultyLabels = new Set<DifficultyLayerLabel>(DIFFICULTY_LAYER_LABELS)

export async function setLevelStatus(formData: FormData) {
  const levelId = String(formData.get('levelId') ?? '')
  const status = String(formData.get('status') ?? '') as AdminStatus

  if (!levelId || !validStatuses.has(status)) {
    throw new Error('Invalid level status request')
  }

  const context = await requireAdmin('editor')
  if (context.preview || !isDbConfigured()) {
    revalidateLevelPaths(levelId)
    return
  }

  await withTransaction(async (client) => {
    const before = await client.query('SELECT to_jsonb(l) AS data FROM levels l WHERE l.id = $1', [levelId])
    if (!before.rows[0]?.data) throw new Error('Level not found')

    await client.query(
      `
      UPDATE levels
      SET
        status = $2,
        published_at = CASE WHEN $2 = 'published' THEN NOW() ELSE NULL END,
        published_by = CASE WHEN $2 = 'published' THEN $3::uuid ELSE NULL END
      WHERE id = $1
      `,
      [levelId, status, context.userId],
    )

    const after = await client.query('SELECT to_jsonb(l) AS data FROM levels l WHERE l.id = $1', [levelId])
    await client.query(
      `
      INSERT INTO admin_audit_logs
        (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
      VALUES ($1, $2, 'level.set_status', 'level', $3, $4, $5, $6)
      `,
      [context.userId, context.role, levelId, before.rows[0].data, after.rows[0]?.data ?? null, { status }],
    )
  })

  revalidateLevelPaths(levelId)
}

export async function updateLevelDetails(formData: FormData) {
  const levelId = readRequiredString(formData, 'levelId')
  const status = readEnum(formData, 'status', validStatuses, 'Invalid level status')
  const spcgLevel = readInteger(formData, 'spcgLevel')
  const stars = readInteger(formData, 'stars')
  const difficultyLabel = readEnum(formData, 'difficultyLabel', validDifficultyLabels, 'Invalid difficulty label')

  if (!isSpcgLevel(spcgLevel)) throw new Error('SPCG level must be 1-10')
  if (!isDifficultyStars(stars)) throw new Error('Difficulty stars must be 1-5')

  const difficulty = {
    spcgLevel,
    levelLabel: getLevelLabel(spcgLevel),
    stars,
    label: difficultyLabel,
    lglevel: readOptionalString(formData, 'lglevel'),
  }
  const statementAssets = readJsonArray(formData, 'statementAssetsJson')
  const algorithmGraphs = readJsonArray(formData, 'algorithmGraphsJson')
  const localizedContent = readJsonObject(formData, 'localizedContentJson')
  const testCases = readJsonArray(formData, 'testCasesJson')
  const hints = readJsonArray(formData, 'hintsJson')
  const solution = readJsonObject(formData, 'solutionJson')
  const source = readJsonObject(formData, 'sourceJson')
  const importMeta = readJsonObject(formData, 'importMetaJson')
  const sisterProblem = readNullableJsonObject(formData, 'sisterProblemJson')

  if (testCases.length !== 20) throw new Error('testCases must contain exactly 20 cases')
  if (hints.length !== 3) throw new Error('hints must contain exactly 3 items')

  const context = await requireAdmin('editor')
  if (context.preview || !isDbConfigured()) {
    revalidateLevelPaths(levelId)
    return
  }

  await withTransaction(async (client) => {
    const before = await client.query('SELECT to_jsonb(l) AS data FROM levels l WHERE l.id = $1', [levelId])
    if (!before.rows[0]?.data) throw new Error('Level not found')

    await client.query(
      `
      UPDATE levels
      SET
        chapter_id = $2,
        "order" = $3,
        title = $4,
        knowledge_point = $5,
        difficulty = $6,
        description = $7,
        statement_assets = $8,
        input_format = $9,
        output_format = $10,
        test_cases = $11,
        hints = $12,
        solution = $13,
        official_code = $14,
        solution_video_url = $15,
        time_limit_ms = $16,
        memory_limit_mb = $17,
        starter_code = $18,
        source = $19,
        sister_problem = $20,
        import_meta = $21,
        teacher_notes = $22,
        guardian_id = $23,
        story = $24,
        pass_out_problem_id = $25,
        status = $26,
        algorithm_graphs = $27,
        localized_content = $28,
        published_at = CASE WHEN $26 = 'published' THEN COALESCE(published_at, NOW()) ELSE published_at END,
        published_by = CASE WHEN $26 = 'published' THEN COALESCE(published_by, $29::uuid) ELSE published_by END,
        updated_at = NOW()
      WHERE id = $1
      `,
      [
        levelId,
        readRequiredString(formData, 'chapterId'),
        readInteger(formData, 'order'),
        readRequiredString(formData, 'title'),
        readRequiredString(formData, 'knowledgePoint'),
        JSON.stringify(difficulty),
        readRequiredString(formData, 'description'),
        JSON.stringify(statementAssets),
        readRequiredString(formData, 'inputFormat'),
        readRequiredString(formData, 'outputFormat'),
        JSON.stringify(testCases),
        JSON.stringify(hints),
        JSON.stringify(solution),
        readRequiredString(formData, 'officialCode'),
        readOptionalString(formData, 'solutionVideoUrl'),
        readInteger(formData, 'timeLimitMs'),
        readInteger(formData, 'memoryLimitMb'),
        readRequiredString(formData, 'starterCode'),
        JSON.stringify(source),
        sisterProblem ? JSON.stringify(sisterProblem) : null,
        JSON.stringify(importMeta),
        readOptionalString(formData, 'teacherNotes'),
        readOptionalString(formData, 'guardianId'),
        readOptionalString(formData, 'story'),
        readOptionalString(formData, 'passOutProblemId'),
        status,
        JSON.stringify(algorithmGraphs),
        JSON.stringify(localizedContent),
        context.userId,
      ],
    )

    const after = await client.query('SELECT to_jsonb(l) AS data FROM levels l WHERE l.id = $1', [levelId])
    await client.query(
      `
      INSERT INTO admin_audit_logs
        (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
      VALUES ($1, $2, 'level.update', 'level', $3, $4, $5, $6)
      `,
      [context.userId, context.role, levelId, before.rows[0].data, after.rows[0]?.data ?? null, { status }],
    )
  })

  revalidateLevelPaths(levelId)
}

export async function deleteLevelPermanently(formData: FormData) {
  const levelId = readRequiredString(formData, 'levelId')
  const confirmation = readRequiredString(formData, 'confirmation')
  if (confirmation !== levelId) throw new Error('Permanent delete confirmation must match level id')

  const context = await requireAdmin('admin')
  if (context.preview || !isDbConfigured()) {
    revalidateLevelPaths(levelId)
    redirect('/admin/levels')
  }

  await withTransaction(async (client) => {
    const before = await client.query('SELECT to_jsonb(l) AS data FROM levels l WHERE l.id = $1', [levelId])
    if (!before.rows[0]?.data) throw new Error('Level not found')

    const usage = await client.query<{
      submissions: string
      progress: string
      problem_set_items: string
      import_items: string
    }>(
      `
      SELECT
        (SELECT COUNT(*) FROM submissions WHERE level_id = $1) AS submissions,
        (SELECT COUNT(*) FROM progress WHERE level_id = $1) AS progress,
        (SELECT COUNT(*) FROM problem_set_items WHERE level_id = $1) AS problem_set_items,
        (SELECT COUNT(*) FROM level_import_items WHERE level_id = $1) AS import_items
      `,
      [levelId],
    )
    const row = usage.rows[0]
    const blockers = [
      ['submissions', Number(row?.submissions ?? 0)],
      ['progress', Number(row?.progress ?? 0)],
      ['problem_set_items', Number(row?.problem_set_items ?? 0)],
      ['level_import_items', Number(row?.import_items ?? 0)],
    ].filter(([, count]) => Number(count) > 0)

    if (blockers.length > 0) {
      throw new Error(`Level has linked data; archive instead. Blockers: ${blockers.map(([name, count]) => `${name}=${count}`).join(', ')}`)
    }

    await client.query('DELETE FROM levels WHERE id = $1', [levelId])
    await client.query(
      `
      INSERT INTO admin_audit_logs
        (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
      VALUES ($1, $2, 'level.delete', 'level', $3, $4, NULL, '{}'::jsonb)
      `,
      [context.userId, context.role, levelId, before.rows[0].data],
    )
  })

  revalidateLevelPaths(levelId)
  redirect('/admin/levels')
}

function revalidateLevelPaths(levelId: string) {
  revalidatePath('/admin')
  revalidatePath('/admin/curriculum')
  revalidatePath('/admin/levels')
  revalidatePath(`/admin/levels/${levelId}`)
  revalidatePath('/map')
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
  const value = readRequiredString(formData, key)
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) throw new Error(`${key} must be an integer`)
  return parsed
}

function readJsonArray(formData: FormData, key: string): unknown[] {
  const value = readRequiredString(formData, key)
  const parsed = JSON.parse(value) as unknown
  if (!Array.isArray(parsed)) throw new Error(`${key} must be a JSON array`)
  return parsed
}

function readJsonObject(formData: FormData, key: string): Record<string, unknown> {
  const value = readRequiredString(formData, key)
  const parsed = JSON.parse(value) as unknown
  if (!isRecord(parsed)) throw new Error(`${key} must be a JSON object`)
  return parsed
}

function readNullableJsonObject(formData: FormData, key: string): Record<string, unknown> | null {
  const value = String(formData.get(key) ?? '').trim()
  if (!value || value === 'null') return null
  const parsed = JSON.parse(value) as unknown
  if (!isRecord(parsed)) throw new Error(`${key} must be empty, null, or a JSON object`)
  return parsed
}

function readEnum<T extends string>(formData: FormData, key: string, valid: Set<T>, message: string): T {
  const value = readRequiredString(formData, key)
  if (!valid.has(value as T)) throw new Error(message)
  return value as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
