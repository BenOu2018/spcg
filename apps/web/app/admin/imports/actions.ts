'use server'

import { revalidatePath } from 'next/cache'
import type { PoolClient } from 'pg'
import { requireAdmin } from '@/lib/admin-auth'
import type { ImportBatchStatus } from '@/lib/admin-data'
import { isDbConfigured, withTransaction } from '@/lib/db'

const validStatuses = new Set<ImportBatchStatus>(['approved', 'rejected', 'imported'])
const validDisplayModes = new Set(['primary', 'backup', 'exam-only'])

export async function setImportBatchTarget(formData: FormData) {
  const batchId = readRequiredString(formData, 'batchId')
  const targetSpcgLevel = readInteger(formData, 'targetSpcgLevel')
  const targetProblemSetId = readRequiredString(formData, 'targetProblemSetId')
  const defaultItemMode = readDisplayMode(formData, 'defaultItemMode')

  if (targetSpcgLevel < 1 || targetSpcgLevel > 10) throw new Error('Target SPCG level must be 1-10')

  const context = await requireAdmin('editor')
  if (context.preview || !isDbConfigured()) {
    revalidateImportPaths(batchId)
    return
  }

  await withTransaction(async (client) => {
    const before = await client.query('SELECT to_jsonb(b) AS data FROM level_import_batches b WHERE b.id = $1', [
      batchId,
    ])
    if (!before.rows[0]?.data) throw new Error('Import batch not found')

    const set = await client.query<{
      id: string
      type: string
      spcg_level: number | null
    }>('SELECT id, type, spcg_level FROM problem_sets WHERE id = $1', [targetProblemSetId])
    const targetSet = set.rows[0]
    if (!targetSet || targetSet.type !== 'lesson') throw new Error('Target problem set must be a lesson stage')
    if (targetSet.spcg_level !== targetSpcgLevel) throw new Error('Target SPCG level does not match selected stage')

    await client.query(
      `
      UPDATE level_import_batches
      SET
        target_spcg_level = $2,
        target_problem_set_id = $3,
        default_item_mode = $4,
        updated_at = NOW()
      WHERE id = $1
      `,
      [batchId, targetSpcgLevel, targetProblemSetId, defaultItemMode],
    )

    const after = await client.query('SELECT to_jsonb(b) AS data FROM level_import_batches b WHERE b.id = $1', [
      batchId,
    ])
    await client.query(
      `
      INSERT INTO admin_audit_logs
        (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
      VALUES ($1, $2, 'import_batch.set_target', 'level_import_batch', $3, $4, $5, $6)
      `,
      [
        context.userId,
        context.role,
        batchId,
        before.rows[0].data,
        after.rows[0]?.data ?? null,
        { targetSpcgLevel, targetProblemSetId, defaultItemMode },
      ],
    )
  })

  revalidateImportPaths(batchId)
}

export async function updateImportItemMode(formData: FormData) {
  const batchId = readRequiredString(formData, 'batchId')
  const levelId = readRequiredString(formData, 'levelId')
  const displayMode = readDisplayMode(formData, 'displayMode')

  const context = await requireAdmin('editor')
  if (context.preview || !isDbConfigured()) {
    revalidateImportPaths(batchId)
    return
  }

  await withTransaction(async (client) => {
    const before = await client.query(
      'SELECT to_jsonb(i) AS data FROM level_import_items i WHERE i.batch_id = $1 AND i.level_id = $2',
      [batchId, levelId],
    )
    if (!before.rows[0]?.data) throw new Error('Import item not found')

    await client.query(
      `
      UPDATE level_import_items
      SET payload = jsonb_set(COALESCE(payload, '{}'::jsonb), '{displayMode}', to_jsonb($3::text), true)
      WHERE batch_id = $1 AND level_id = $2
      `,
      [batchId, levelId, displayMode],
    )

    const after = await client.query(
      'SELECT to_jsonb(i) AS data FROM level_import_items i WHERE i.batch_id = $1 AND i.level_id = $2',
      [batchId, levelId],
    )
    await client.query(
      `
      INSERT INTO admin_audit_logs
        (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
      VALUES ($1, $2, 'import_item.set_display_mode', 'level_import_item', $3, $4, $5, $6)
      `,
      [context.userId, context.role, levelId, before.rows[0].data, after.rows[0]?.data ?? null, { batchId, displayMode }],
    )
  })

  revalidateImportPaths(batchId)
}

export async function reviewImportBatch(formData: FormData) {
  const batchId = String(formData.get('batchId') ?? '')
  const status = String(formData.get('status') ?? '') as ImportBatchStatus
  const note = String(formData.get('note') ?? '').trim() || null

  if (!batchId || !validStatuses.has(status)) {
    throw new Error('Invalid import batch review request')
  }

  const context = await requireAdmin('reviewer')
  if (context.preview || !isDbConfigured()) {
    revalidateImportPaths(batchId)
    return
  }

  await withTransaction(async (client) => {
    const before = await client.query('SELECT to_jsonb(b) AS data FROM level_import_batches b WHERE b.id = $1', [
      batchId,
    ])
    if (!before.rows[0]?.data) throw new Error('Import batch not found')

    await client.query(
      `
      UPDATE level_import_batches
      SET
        status = $2,
        review_note = $3,
        reviewed_by = CASE WHEN $2 IN ('approved','rejected') THEN $4::uuid ELSE reviewed_by END,
        reviewed_at = CASE WHEN $2 IN ('approved','rejected') THEN NOW() ELSE reviewed_at END,
        imported_by = CASE WHEN $2 = 'imported' THEN $4::uuid ELSE imported_by END,
        imported_at = CASE WHEN $2 = 'imported' THEN NOW() ELSE imported_at END
      WHERE id = $1
      `,
      [batchId, status, note, context.userId],
    )

    if (status === 'imported') {
      await attachImportedLevelsToTargetStage(client, batchId)
    }

    await client.query(
      `
      UPDATE level_import_items
      SET status = CASE
        WHEN $2 = 'approved' THEN 'approved'
        WHEN $2 = 'rejected' THEN 'rejected'
        WHEN $2 = 'imported' THEN 'imported'
        ELSE status
      END
      WHERE batch_id = $1
      `,
      [batchId, status],
    )

    const after = await client.query('SELECT to_jsonb(b) AS data FROM level_import_batches b WHERE b.id = $1', [
      batchId,
    ])
    await client.query(
      `
      INSERT INTO admin_audit_logs
        (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
      VALUES ($1, $2, 'import_batch.review', 'level_import_batch', $3, $4, $5, $6)
      `,
      [context.userId, context.role, batchId, before.rows[0].data, after.rows[0]?.data ?? null, { status, note }],
    )
  })

  revalidateImportPaths(batchId)
}

function revalidateImportPaths(batchId: string) {
  revalidatePath('/admin')
  revalidatePath('/admin/curriculum')
  revalidatePath('/admin/imports')
  revalidatePath(`/admin/imports/${batchId}`)
  revalidatePath('/admin/audit-logs')
}

async function attachImportedLevelsToTargetStage(client: PoolClient, batchId: string) {
  const batch = await client.query<{
    target_spcg_level: number | null
    target_problem_set_id: string | null
    default_item_mode: string
  }>(
    `
    SELECT target_spcg_level, target_problem_set_id, default_item_mode
    FROM level_import_batches
    WHERE id = $1
    `,
    [batchId],
  )
  const target = batch.rows[0]
  if (!target?.target_spcg_level || !target.target_problem_set_id) {
    throw new Error('Set target SPCG level and target stage before marking imported')
  }

  const set = await client.query<{
    type: string
    spcg_level: number | null
  }>('SELECT type, spcg_level FROM problem_sets WHERE id = $1', [target.target_problem_set_id])
  const targetSet = set.rows[0]
  if (!targetSet || targetSet.type !== 'lesson') throw new Error('Target stage not found')
  if (targetSet.spcg_level !== target.target_spcg_level) throw new Error('Target stage SPCG level mismatch')

  const rows = await client.query<{
    level_id: string
    title: string
    payload: Record<string, unknown> | null
    difficulty: Record<string, unknown> | null
  }>(
    `
    SELECT lii.level_id, lii.title, lii.payload, l.difficulty
    FROM level_import_items lii
    LEFT JOIN levels l ON l.id = lii.level_id
    WHERE lii.batch_id = $1
      AND lii.validation_status = 'passed'
      AND lii.status <> 'rejected'
    ORDER BY lii.created_at ASC
    `,
    [batchId],
  )

  if (rows.rows.length === 0) throw new Error('No passed import items to attach')

  const missing = rows.rows.filter((row) => !row.difficulty)
  if (missing.length > 0) {
    throw new Error(`These levels are not imported into levels yet: ${missing.map((row) => row.level_id).join(', ')}`)
  }

  const mismatched = rows.rows.filter((row) => Number(row.difficulty?.spcgLevel) !== target.target_spcg_level)
  if (mismatched.length > 0) {
    throw new Error(`SPCG level mismatch: ${mismatched.map((row) => row.level_id).join(', ')}`)
  }

  const maxPosition = await client.query<{ max_position: string | number | null }>(
    'SELECT COALESCE(MAX(position), 0) AS max_position FROM problem_set_items WHERE problem_set_id = $1',
    [target.target_problem_set_id],
  )
  const basePosition = Number(maxPosition.rows[0]?.max_position ?? 0)

  for (let index = 0; index < rows.rows.length; index += 1) {
    const item = rows.rows[index]
    if (!item) continue
    const displayMode = getPayloadDisplayMode(item.payload) ?? target.default_item_mode
    await client.query(
      `
      INSERT INTO problem_set_items (problem_set_id, level_id, position, label, required, metadata)
      VALUES ($1, $2, $3, $4, TRUE, jsonb_build_object('displayMode', $5::text))
      ON CONFLICT (problem_set_id, level_id)
      DO UPDATE SET
        metadata = jsonb_set(
          COALESCE(problem_set_items.metadata, '{}'::jsonb),
          '{displayMode}',
          to_jsonb(EXCLUDED.metadata->>'displayMode'),
          true
        )
      `,
      [target.target_problem_set_id, item.level_id, basePosition + index + 1, 'imported', displayMode],
    )
  }
}

function readRequiredString(formData: FormData, key: string): string {
  const value = String(formData.get(key) ?? '').trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}

function readInteger(formData: FormData, key: string): number {
  const parsed = Number(readRequiredString(formData, key))
  if (!Number.isInteger(parsed)) throw new Error(`${key} must be an integer`)
  return parsed
}

function readDisplayMode(formData: FormData, key: string): 'primary' | 'backup' | 'exam-only' {
  const value = readRequiredString(formData, key)
  if (!validDisplayModes.has(value)) throw new Error('Invalid display mode')
  return value as 'primary' | 'backup' | 'exam-only'
}

function getPayloadDisplayMode(payload: Record<string, unknown> | null): 'primary' | 'backup' | 'exam-only' | null {
  const value = payload?.displayMode
  return value === 'primary' || value === 'backup' || value === 'exam-only' ? value : null
}
