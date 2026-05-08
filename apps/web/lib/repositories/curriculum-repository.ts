import { isRequiredLessonProblemRole, type ProblemSetItemDisplayMode } from '@spcg/shared/curriculum'
import { withTransaction } from '@/lib/db'

export type CurriculumAuditContext = {
  userId: string
  role: string
}

export type CurriculumDisplayMode = ProblemSetItemDisplayMode
export type CurriculumProblemStatus = 'draft' | 'review' | 'published' | 'archived'
export type CurriculumProblemSetItemInput = {
  problemSetId: string
  levelId: string
  position: number
  label: string | null
  required: boolean
  displayMode: CurriculumDisplayMode
}

export type CurriculumDraftLevelRecord = {
  id: string
  chapterId: string
  order: number
  title: string
  knowledgePoint: string
  difficulty: Record<string, unknown>
  description: string
  statementAssets: unknown[]
  inputFormat: string
  outputFormat: string
  testCases: unknown[]
  hints: unknown[]
  solution: Record<string, unknown>
  officialCode: string
  starterCode: string
  source: Record<string, unknown>
  importMeta: Record<string, unknown>
}

export async function createCurriculumDraftLevel(
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
  await withTransaction(async (client) => {
    const set = await client.query<{ spcg_level: number | null }>(
      'SELECT spcg_level FROM problem_sets WHERE id = $1 AND type = $2',
      [input.problemSetId, 'lesson'],
    )
    const stage = set.rows[0]
    if (!stage) throw new Error('Target stage not found')
    if (stage.spcg_level !== input.spcgLevel) throw new Error('Problem SPCG level must match target stage')

    const level = input.level
    await client.query(
      `
      INSERT INTO levels (
        id, chapter_id, "order", title, knowledge_point, difficulty, description, statement_assets,
        input_format, output_format, test_cases, hints, solution, official_code, solution_video_url,
        time_limit_ms, memory_limit_mb, starter_code, source, sister_problem, import_meta,
        teacher_notes, guardian_id, story, pass_out_problem_id, status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, NULL,
        1000, 64, $15, $16, NULL, $17,
        NULL, NULL, NULL, NULL, 'draft'
      )
      `,
      [
        level.id,
        level.chapterId,
        level.order,
        level.title,
        level.knowledgePoint,
        JSON.stringify(level.difficulty),
        level.description,
        JSON.stringify(level.statementAssets),
        level.inputFormat,
        level.outputFormat,
        JSON.stringify(level.testCases),
        JSON.stringify(level.hints),
        JSON.stringify(level.solution),
        level.officialCode,
        level.starterCode,
        JSON.stringify(level.source),
        JSON.stringify(level.importMeta),
      ],
    )

    await client.query(
      `
      INSERT INTO problem_set_items (problem_set_id, level_id, position, label, required, metadata)
      VALUES ($1, $2, $3, $4, $5, jsonb_build_object('displayMode', $6::text))
      ON CONFLICT (problem_set_id, level_id)
      DO UPDATE SET position = EXCLUDED.position, label = EXCLUDED.label, required = EXCLUDED.required, metadata = EXCLUDED.metadata
      `,
      [
        input.problemSetId,
        level.id,
        input.position,
        input.itemLabel,
        isRequiredLessonProblemRole(input.displayMode),
        input.displayMode,
      ],
    )

    await client.query(
      `
      INSERT INTO admin_audit_logs
        (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
      VALUES ($1, $2, 'curriculum.level.create_draft', 'level', $3, NULL, $4, $5)
      `,
      [audit.userId, audit.role, level.id, level, { problemSetId: input.problemSetId, displayMode: input.displayMode }],
    )
  })
}

export async function addCurriculumProblemToStage(
  input: CurriculumProblemSetItemInput,
  audit: CurriculumAuditContext,
) {
  await withTransaction(async (client) => {
    const target = await client.query<{ spcg_level: number | null; stage_no: number | null; type: string }>(
      'SELECT spcg_level, stage_no, type FROM problem_sets WHERE id = $1',
      [input.problemSetId],
    )
    const stage = target.rows[0]
    if (!stage || stage.type !== 'lesson' || !stage.spcg_level || !stage.stage_no) {
      throw new Error('Target stage not found')
    }

    const allowed = await client.query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM problem_set_items psi
        JOIN problem_sets ps ON ps.id = psi.problem_set_id
        WHERE
          psi.level_id = $1
          AND ps.type = 'lesson'
          AND ps.status <> 'archived'
          AND ps.spcg_level = $2
          AND ps.stage_no = $3
      ) AS exists
      `,
      [input.levelId, stage.spcg_level, stage.stage_no],
    )
    if (!allowed.rows[0]?.exists) {
      throw new Error('Problem must already belong to the same curriculum stage')
    }

    const before = await client.query('SELECT to_jsonb(ps) AS data FROM problem_sets ps WHERE id = $1', [
      input.problemSetId,
    ])
    await client.query(
      `
      INSERT INTO problem_set_items (problem_set_id, level_id, position, label, required, metadata)
      VALUES ($1, $2, $3, $4, $5, jsonb_build_object('displayMode', $6::text))
      ON CONFLICT (problem_set_id, level_id)
      DO UPDATE SET
        position = EXCLUDED.position,
        label = EXCLUDED.label,
        required = EXCLUDED.required,
        metadata = jsonb_set(
          COALESCE(problem_set_items.metadata, '{}'::jsonb),
          '{displayMode}',
          to_jsonb(EXCLUDED.metadata->>'displayMode'),
          true
        )
      `,
      [input.problemSetId, input.levelId, input.position, input.label, input.required, input.displayMode],
    )
    const after = await client.query('SELECT to_jsonb(ps) AS data FROM problem_sets ps WHERE id = $1', [
      input.problemSetId,
    ])

    await client.query(
      `
      INSERT INTO admin_audit_logs
        (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
      VALUES ($1, $2, 'curriculum.stage.add_item', 'problem_set', $3, $4, $5, $6)
      `,
      [
        audit.userId,
        audit.role,
        input.problemSetId,
        before.rows[0]?.data ?? null,
        after.rows[0]?.data ?? null,
        {
          levelId: input.levelId,
          spcgLevel: stage.spcg_level,
          stageNo: stage.stage_no,
          displayMode: input.displayMode,
        },
      ],
    )
  })
}

export async function updateCurriculumProblemSummary(
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
  await withTransaction(async (client) => {
    const beforeLevel = await client.query('SELECT to_jsonb(l) AS data FROM levels l WHERE id = $1', [input.levelId])
    if (!beforeLevel.rows[0]?.data) throw new Error('Level not found')

    await client.query(
      `
      UPDATE levels
      SET title = $2, knowledge_point = $3, difficulty = $4, status = $5, updated_at = NOW()
      WHERE id = $1
      `,
      [input.levelId, input.title, input.knowledgePoint, JSON.stringify(input.difficulty), input.status],
    )

    await client.query(
      `
      UPDATE problem_set_items
      SET
        position = $3,
        label = $4,
        required = $5,
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{displayMode}', to_jsonb($6::text), true)
      WHERE problem_set_id = $1 AND level_id = $2
      `,
      [input.problemSetId, input.levelId, input.position, input.itemLabel, input.required, input.displayMode],
    )

    const afterLevel = await client.query('SELECT to_jsonb(l) AS data FROM levels l WHERE id = $1', [input.levelId])
    await client.query(
      `
      INSERT INTO admin_audit_logs
        (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
      VALUES ($1, $2, 'curriculum.level.update_summary', 'level', $3, $4, $5, $6)
      `,
      [
        audit.userId,
        audit.role,
        input.levelId,
        beforeLevel.rows[0].data,
        afterLevel.rows[0]?.data ?? null,
        { problemSetId: input.problemSetId, displayMode: input.displayMode, position: input.position },
      ],
    )
  })
}

export async function archiveCurriculumProblem(
  input: { problemSetId: string; levelId: string },
  audit: CurriculumAuditContext,
) {
  await withTransaction(async (client) => {
    const before = await client.query('SELECT to_jsonb(l) AS data FROM levels l WHERE id = $1', [input.levelId])
    if (!before.rows[0]?.data) throw new Error('Level not found')

    await client.query('DELETE FROM problem_set_items WHERE problem_set_id = $1 AND level_id = $2', [
      input.problemSetId,
      input.levelId,
    ])

    const after = await client.query('SELECT to_jsonb(l) AS data FROM levels l WHERE id = $1', [input.levelId])
    await client.query(
      `
      INSERT INTO admin_audit_logs
        (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
      VALUES ($1, $2, 'curriculum.level.remove_from_stage', 'level', $3, $4, $5, $6)
      `,
      [audit.userId, audit.role, input.levelId, before.rows[0].data, after.rows[0]?.data ?? null, { problemSetId: input.problemSetId }],
    )
  })
}
