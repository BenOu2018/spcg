import type { PoolClient } from 'pg'
import type {
  Difficulty,
  ProblemAlgorithm,
  ProblemAlgorithmFamily,
  ProblemSource,
  Solution,
  TestCase,
} from '@spcg/shared/types'
import {
  FRONTEND_LESSON_DISPLAY_MODES,
  isProblemSetItemDisplayMode,
  type ProblemSetItemDisplayMode,
} from '@spcg/shared/curriculum'
import { query, queryOne, withTransaction } from '@/lib/db'

export type ProblemSetStatus = 'draft' | 'review' | 'published' | 'archived'
export type ProblemSetType = 'chapter' | 'practice' | 'review' | 'challenge' | 'import-review' | 'lesson' | 'assessment'
export type ProblemSetVisibility = 'admin' | 'student'
export type LessonTrack = 'A' | 'B'

export type AdminAuditContext = {
  userId: string
  role: string
}

export type ProblemSetSummary = {
  id: string
  title: string
  description: string | null
  type: ProblemSetType
  status: ProblemSetStatus
  visibility: ProblemSetVisibility
  itemCount: number
  spcgLevel: number | null
  stageNo: number | null
  track: LessonTrack | null
  lessonFocus: string | null
  updatedAt: string | null
}

export type ProblemSetItemSummary = {
  levelId: string
  title: string
  position: number
  label: string | null
  required: boolean
  displayMode: ProblemSetItemDisplayMode
  status: ProblemSetStatus | null
  chapterId: string | null
  order: number | null
  knowledgePoint: string | null
  difficulty: Difficulty | null
}

export type ProblemSetDetail = ProblemSetSummary & {
  items: ProblemSetItemSummary[]
}

export type ProblemSetLevelCandidate = {
  id: string
  title: string
  chapterId: string
  order: number
  knowledgePoint: string
  difficulty: Difficulty
  status: ProblemSetStatus
}

export type MainlineStageTitle = {
  levelId: string
  title: string
  lessonFocus: string | null
}

export type CurriculumMainlineStage = MainlineStageTitle & {
  spcgLevel: number
  stageNo: number
}

export type LessonStageProblemMenuItem = {
  levelId: string
  title: string
  position: number
  displayMode: ProblemSetItemDisplayMode
}

export type LessonStageProblemMenu = {
  problemSetId: string
  title: string
  spcgLevel: number
  stageNo: number
  track: LessonTrack
  lessonFocus: string | null
  items: LessonStageProblemMenuItem[]
}

export type LessonPlanProblem = ProblemSetItemSummary & {
  description: string
  inputFormat: string
  outputFormat: string
  solution: Solution
  teacherNotes: string | null
  source: ProblemSource | null
  algorithmFamily: ProblemAlgorithmFamily | null
  algorithms: ProblemAlgorithm[]
  publicCases: TestCase[]
}

export type LessonPlanProblemSet = ProblemSetSummary & {
  items: LessonPlanProblem[]
}

type ProblemSetRow = {
  id: string
  title: string
  description: string | null
  type: ProblemSetType
  status: ProblemSetStatus
  visibility: ProblemSetVisibility
  item_count: string | number
  spcg_level: number | null
  stage_no: number | null
  track: LessonTrack | null
  lesson_focus: string | null
  updated_at: string | null
} & Record<string, unknown>

type ProblemSetItemRow = {
  level_id: string
  title: string | null
  position: number
  label: string | null
  required: boolean
  display_mode: ProblemSetItemDisplayMode | null
  status: ProblemSetStatus | null
  chapter_id: string | null
  order: number | null
  knowledge_point: string | null
  difficulty: Difficulty | null
} & Record<string, unknown>

type LessonPlanProblemRow = ProblemSetItemRow & {
  description: string
  input_format: string
  output_format: string
  solution: Solution
  teacher_notes: string | null
  source: ProblemSource | null
  import_meta: {
    algorithmFamily?: ProblemAlgorithmFamily | null
    algorithms?: ProblemAlgorithm[]
  } | null
  public_cases: TestCase[] | null
}

export async function listProblemSetSummaries(): Promise<ProblemSetSummary[]> {
  const rows = await query<ProblemSetRow>(
    `
    SELECT ps.id, ps.title, ps.description, ps.type, ps.status, ps.visibility, ps.updated_at,
           ps.spcg_level, ps.stage_no, ps.track, ps.lesson_focus,
           COUNT(psi.level_id) AS item_count
    FROM problem_sets ps
    LEFT JOIN problem_set_items psi ON psi.problem_set_id = ps.id
    GROUP BY ps.id
    ORDER BY
      CASE WHEN ps.type = 'lesson' THEN 0 ELSE 1 END,
      ps.spcg_level ASC NULLS LAST,
      ps.stage_no ASC NULLS LAST,
      ps.track ASC NULLS LAST,
      ps.updated_at DESC
    `,
  )

  return rows.map(mapProblemSetRow)
}

export async function getProblemSetDetail(id: string): Promise<ProblemSetDetail | null> {
  const set = await getProblemSetSummary(id)
  if (!set) return null

  const rows = await query<ProblemSetItemRow>(
    `
    SELECT
      psi.level_id,
      l.title,
      psi.position,
      psi.label,
      psi.required,
      COALESCE(psi.metadata->>'displayMode', 'primary') AS display_mode,
      l.status,
      l.chapter_id,
      l."order",
      l.knowledge_point,
      l.difficulty
    FROM problem_set_items psi
    LEFT JOIN levels l ON l.id = psi.level_id
    WHERE psi.problem_set_id = $1
    ORDER BY psi.position ASC
    `,
    [id],
  )

  return {
    ...set,
    items: rows.map(mapProblemSetItemRow),
  }
}

export async function getLessonPlanProblemSet(id: string): Promise<LessonPlanProblemSet | null> {
  const set = await getProblemSetSummary(id)
  if (!set) return null

  const rows = await query<LessonPlanProblemRow>(
    `
    SELECT
      psi.level_id,
      l.title,
      psi.position,
      psi.label,
      psi.required,
      COALESCE(psi.metadata->>'displayMode', 'primary') AS display_mode,
      l.status,
      l.chapter_id,
      l."order",
      l.knowledge_point,
      l.difficulty,
      l.description,
      l.input_format,
      l.output_format,
      l.solution,
      l.teacher_notes,
      l.source,
      l.import_meta,
      COALESCE(public_cases.value, '[]'::jsonb) AS public_cases
    FROM problem_set_items psi
    JOIN levels l ON l.id = psi.level_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(tc.elem ORDER BY tc.ord) AS value
      FROM jsonb_array_elements(l.test_cases) WITH ORDINALITY AS tc(elem, ord)
      WHERE tc.elem->>'visibility' = 'public'
    ) public_cases ON TRUE
    WHERE psi.problem_set_id = $1
    ORDER BY psi.position ASC
    `,
    [id],
  )

  return {
    ...set,
    items: rows.map(mapLessonPlanProblemRow),
  }
}

export async function listProblemSetLevelCandidates(): Promise<ProblemSetLevelCandidate[]> {
  const rows = await query<
    {
      id: string
      title: string
      chapter_id: string
      order: number
      knowledge_point: string
      difficulty: Difficulty
      status: ProblemSetStatus
    } & Record<string, unknown>
  >(
    `
    SELECT id, title, chapter_id, "order", knowledge_point, difficulty, status
    FROM levels
    ORDER BY chapter_id ASC, "order" ASC, id ASC
    `,
  )

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    chapterId: row.chapter_id,
    order: row.order,
    knowledgePoint: row.knowledge_point,
    difficulty: row.difficulty,
    status: row.status,
  }))
}

export async function listMainlineStageTitles(levelIds: string[]): Promise<MainlineStageTitle[]> {
  if (levelIds.length === 0) return []

  const rows = await query<{ level_id: string; title: string; lesson_focus: string | null } & Record<string, unknown>>(
    `
    SELECT DISTINCT ON (psi.level_id)
      psi.level_id,
      ps.title,
      ps.lesson_focus
    FROM problem_set_items psi
    JOIN problem_sets ps ON ps.id = psi.problem_set_id
    WHERE
      psi.level_id = ANY($1::text[])
      AND ps.type = 'lesson'
      AND ps.status = 'published'
      AND ps.visibility = 'student'
      AND ps.track = 'A'
      AND COALESCE(psi.metadata->>'displayMode', 'primary') IN ('template', 'primary')
    ORDER BY psi.level_id, ps.spcg_level ASC NULLS LAST, ps.stage_no ASC NULLS LAST, psi.position ASC
    `,
    [levelIds],
  )

  return rows.map((row) => ({
    levelId: row.level_id,
    title: row.title,
    lessonFocus: row.lesson_focus,
  }))
}

export async function listCurriculumMainlineStages(): Promise<CurriculumMainlineStage[]> {
  const rows = await query<
    {
      level_id: string
      title: string
      lesson_focus: string | null
      spcg_level: number
      stage_no: number
    } & Record<string, unknown>
  >(
    `
    SELECT DISTINCT ON (ps.spcg_level, ps.stage_no)
      psi.level_id,
      ps.title,
      ps.lesson_focus,
      ps.spcg_level,
      ps.stage_no
    FROM problem_sets ps
    JOIN problem_set_items psi ON psi.problem_set_id = ps.id
    JOIN levels l ON l.id = psi.level_id
    WHERE
      ps.type = 'lesson'
      AND ps.status = 'published'
      AND ps.visibility = 'student'
      AND ps.track = 'A'
      AND l.status = 'published'
      AND COALESCE(psi.metadata->>'displayMode', 'primary') IN ('template', 'primary')
    ORDER BY ps.spcg_level ASC, ps.stage_no ASC, psi.position ASC
    `,
  )

  return rows.map((row) => ({
    levelId: row.level_id,
    title: row.title,
    lessonFocus: row.lesson_focus,
    spcgLevel: row.spcg_level,
    stageNo: row.stage_no,
  }))
}

export async function getLessonStageProblemMenuForLevel(levelId: string): Promise<LessonStageProblemMenu | null> {
  const setRows = await query<
    {
      id: string
      title: string
      spcg_level: number
      stage_no: number
      track: LessonTrack
      lesson_focus: string | null
    } & Record<string, unknown>
  >(
    `
    SELECT ps.id, ps.title, ps.spcg_level, ps.stage_no, ps.track, ps.lesson_focus
    FROM problem_sets ps
    JOIN problem_set_items psi ON psi.problem_set_id = ps.id
    WHERE
      psi.level_id = $1
      AND ps.type = 'lesson'
      AND ps.status = 'published'
      AND ps.visibility = 'student'
    ORDER BY
      CASE WHEN ps.track = 'A' THEN 0 ELSE 1 END,
      ps.spcg_level ASC,
      ps.stage_no ASC
    LIMIT 1
    `,
    [levelId],
  )
  const set = setRows[0]
  if (!set) return null

  const itemRows = await query<
    {
      level_id: string
      title: string
      position: number
      display_mode: ProblemSetItemDisplayMode | null
    } & Record<string, unknown>
  >(
    `
    SELECT
      psi.level_id,
      l.title,
      psi.position,
      COALESCE(psi.metadata->>'displayMode', 'primary') AS display_mode
    FROM problem_set_items psi
    JOIN levels l ON l.id = psi.level_id
    WHERE
      psi.problem_set_id = $1
      AND l.status = 'published'
      AND COALESCE(psi.metadata->>'displayMode', 'primary') = ANY($2::text[])
    ORDER BY psi.position ASC, psi.level_id ASC
    `,
    [set.id, FRONTEND_LESSON_DISPLAY_MODES],
  )

  return {
    problemSetId: set.id,
    title: set.title,
    spcgLevel: set.spcg_level,
    stageNo: set.stage_no,
    track: set.track,
    lessonFocus: set.lesson_focus,
    items: itemRows.map((row) => ({
      levelId: row.level_id,
      title: row.title,
      position: row.position,
      displayMode: isProblemSetItemDisplayMode(row.display_mode) ? row.display_mode : 'primary',
    })),
  }
}

export async function listPublishedLessonStageProblemMenus(input: {
  track?: LessonTrack
} = {}): Promise<LessonStageProblemMenu[]> {
  const track = input.track ?? 'A'
  const rows = await query<
    {
      problem_set_id: string
      problem_set_title: string
      spcg_level: number
      stage_no: number
      track: LessonTrack
      lesson_focus: string | null
      level_id: string
      level_title: string
      position: number
      display_mode: ProblemSetItemDisplayMode | null
    } & Record<string, unknown>
  >(
    `
    SELECT
      ps.id AS problem_set_id,
      ps.title AS problem_set_title,
      ps.spcg_level,
      ps.stage_no,
      ps.track,
      ps.lesson_focus,
      psi.level_id,
      l.title AS level_title,
      psi.position,
      COALESCE(psi.metadata->>'displayMode', 'primary') AS display_mode
    FROM problem_sets ps
    JOIN problem_set_items psi ON psi.problem_set_id = ps.id
    JOIN levels l ON l.id = psi.level_id
    WHERE
      ps.type = 'lesson'
      AND ps.status = 'published'
      AND ps.visibility = 'student'
      AND ps.track = $1
      AND l.status = 'published'
      AND COALESCE(psi.metadata->>'displayMode', 'primary') = ANY($2::text[])
    ORDER BY ps.spcg_level ASC, ps.stage_no ASC, psi.position ASC, psi.level_id ASC
    `,
    [track, FRONTEND_LESSON_DISPLAY_MODES],
  )

  const menus = new Map<string, LessonStageProblemMenu>()
  for (const row of rows) {
    const existing = menus.get(row.problem_set_id)
    const menu =
      existing ??
      {
        problemSetId: row.problem_set_id,
        title: row.problem_set_title,
        spcgLevel: row.spcg_level,
        stageNo: row.stage_no,
        track: row.track,
        lessonFocus: row.lesson_focus,
        items: [],
      }
    menu.items.push({
      levelId: row.level_id,
      title: row.level_title,
      position: row.position,
      displayMode: isProblemSetItemDisplayMode(row.display_mode) ? row.display_mode : 'primary',
    })
    menus.set(row.problem_set_id, menu)
  }

  return [...menus.values()]
}

export async function createProblemSet(
  input: {
    id: string
    title: string
    description: string | null
    type: ProblemSetType
    visibility: ProblemSetVisibility
    spcgLevel: number | null
    stageNo: number | null
    track: LessonTrack | null
    lessonFocus: string | null
  },
  audit: AdminAuditContext,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `
      INSERT INTO problem_sets
        (id, title, description, type, status, visibility, metadata, created_by, spcg_level, stage_no, track, lesson_focus)
      VALUES ($1, $2, $3, $4, 'draft', $5, '{}'::jsonb, $6, $7, $8, $9, $10)
      `,
      [
        input.id,
        input.title,
        input.description,
        input.type,
        input.visibility,
        audit.userId,
        input.spcgLevel,
        input.stageNo,
        input.track,
        input.lessonFocus,
      ],
    )

    const after = await selectProblemSetJson(client, input.id)
    await insertAuditLog(client, audit, 'problem_set.create', 'problem_set', input.id, null, after, {})
  })
}

export async function updateProblemSetDetails(
  input: {
    id: string
    title: string
    description: string | null
    type: ProblemSetType
    visibility: ProblemSetVisibility
    spcgLevel: number | null
    stageNo: number | null
    track: LessonTrack | null
    lessonFocus: string | null
  },
  audit: AdminAuditContext,
): Promise<void> {
  await withTransaction(async (client) => {
    const before = await selectProblemSetJson(client, input.id)
    if (!before) throw new Error('Problem set not found')

    await client.query(
      `
      UPDATE problem_sets
      SET
        title = $2,
        description = $3,
        type = $4,
        visibility = $5,
        spcg_level = $6,
        stage_no = $7,
        track = $8,
        lesson_focus = $9,
        updated_at = NOW()
      WHERE id = $1
      `,
      [
        input.id,
        input.title,
        input.description,
        input.type,
        input.visibility,
        input.spcgLevel,
        input.stageNo,
        input.track,
        input.lessonFocus,
      ],
    )

    if (input.type === 'lesson' && input.spcgLevel && input.stageNo) {
      await client.query(
        `
        UPDATE problem_sets
        SET
          title = $2,
          description = $3,
          lesson_focus = $4,
          updated_at = NOW()
        WHERE
          type = 'lesson'
          AND status <> 'archived'
          AND spcg_level = $1
          AND stage_no = $5
        `,
        [input.spcgLevel, input.title, input.description, input.lessonFocus, input.stageNo],
      )
    }

    const after = await selectProblemSetJson(client, input.id)
    await insertAuditLog(client, audit, 'problem_set.update', 'problem_set', input.id, before, after, {})
  })
}

export async function setProblemSetStatus(
  input: { id: string; status: ProblemSetStatus },
  audit: AdminAuditContext,
): Promise<void> {
  await withTransaction(async (client) => {
    const before = await selectProblemSetJson(client, input.id)
    if (!before) throw new Error('Problem set not found')

    await client.query(
      `
      UPDATE problem_sets
      SET
        status = $2,
        visibility = CASE WHEN $2 = 'published' THEN 'student' ELSE visibility END,
        published_at = CASE WHEN $2 = 'published' THEN NOW() ELSE NULL END,
        published_by = CASE WHEN $2 = 'published' THEN $3::uuid ELSE NULL END,
        updated_at = NOW()
      WHERE id = $1
      `,
      [input.id, input.status, audit.userId],
    )

    const after = await selectProblemSetJson(client, input.id)
    await insertAuditLog(client, audit, 'problem_set.set_status', 'problem_set', input.id, before, after, {
      status: input.status,
    })
  })
}

export async function addProblemSetItem(
  input: {
    problemSetId: string
    levelId: string
    position: number
    label: string | null
    required: boolean
    displayMode: ProblemSetItemDisplayMode
  },
  audit: AdminAuditContext,
): Promise<void> {
  await withTransaction(async (client) => {
    const before = await selectProblemSetJson(client, input.problemSetId)
    if (!before) throw new Error('Problem set not found')

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

    const after = await selectProblemSetJson(client, input.problemSetId)
    await insertAuditLog(client, audit, 'problem_set.add_item', 'problem_set', input.problemSetId, before, after, {
      levelId: input.levelId,
    })
  })
}

export async function updateProblemSetItems(
  problemSetId: string,
  items: Array<{
    levelId: string
    position: number
    label: string | null
    required: boolean
    displayMode: ProblemSetItemDisplayMode
  }>,
  audit: AdminAuditContext,
): Promise<void> {
  await withTransaction(async (client) => {
    const before = await selectProblemSetJson(client, problemSetId)
    if (!before) throw new Error('Problem set not found')

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      if (!item) continue
      await client.query(
        `
        UPDATE problem_set_items
        SET position = $3
        WHERE problem_set_id = $1 AND level_id = $2
        `,
        [problemSetId, item.levelId, -100000 - index],
      )
    }

    for (const item of items) {
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
        [problemSetId, item.levelId, item.position, item.label, item.required, item.displayMode],
      )
    }

    const after = await selectProblemSetJson(client, problemSetId)
    await insertAuditLog(client, audit, 'problem_set.update_items', 'problem_set', problemSetId, before, after, {
      itemCount: items.length,
    })
  })
}

export async function removeProblemSetItem(
  input: { problemSetId: string; levelId: string },
  audit: AdminAuditContext,
): Promise<void> {
  await withTransaction(async (client) => {
    const before = await selectProblemSetJson(client, input.problemSetId)
    if (!before) throw new Error('Problem set not found')

    await client.query('DELETE FROM problem_set_items WHERE problem_set_id = $1 AND level_id = $2', [
      input.problemSetId,
      input.levelId,
    ])

    const after = await selectProblemSetJson(client, input.problemSetId)
    await insertAuditLog(client, audit, 'problem_set.remove_item', 'problem_set', input.problemSetId, before, after, {
      levelId: input.levelId,
    })
  })
}

export async function countProblemSetItems(problemSetId: string): Promise<number> {
  const row = await queryOne<{ count: string } & Record<string, unknown>>(
    'SELECT COUNT(*) AS count FROM problem_set_items WHERE problem_set_id = $1',
    [problemSetId],
  )
  return Number(row?.count ?? 0)
}

async function getProblemSetSummary(id: string): Promise<ProblemSetSummary | null> {
  const row = await queryOne<ProblemSetRow>(
    `
    SELECT ps.id, ps.title, ps.description, ps.type, ps.status, ps.visibility, ps.updated_at,
           ps.spcg_level, ps.stage_no, ps.track, ps.lesson_focus,
           COUNT(psi.level_id) AS item_count
    FROM problem_sets ps
    LEFT JOIN problem_set_items psi ON psi.problem_set_id = ps.id
    WHERE ps.id = $1
    GROUP BY ps.id
    `,
    [id],
  )

  return row ? mapProblemSetRow(row) : null
}

async function selectProblemSetJson(client: PoolClient, id: string): Promise<Record<string, unknown> | null> {
  const result = await client.query<{ data: Record<string, unknown> | null } & Record<string, unknown>>(
    'SELECT to_jsonb(ps) AS data FROM problem_sets ps WHERE ps.id = $1',
    [id],
  )
  return result.rows[0]?.data ?? null
}

async function insertAuditLog(
  client: PoolClient,
  audit: AdminAuditContext,
  action: string,
  resourceType: string,
  resourceId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  metadata: Record<string, unknown>,
) {
  await client.query(
    `
    INSERT INTO admin_audit_logs
      (actor_user_id, actor_role, action, resource_type, resource_id, before_data, after_data, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [audit.userId, audit.role, action, resourceType, resourceId, before, after, metadata],
  )
}

function mapProblemSetRow(row: ProblemSetRow): ProblemSetSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    visibility: row.visibility,
    itemCount: Number(row.item_count),
    spcgLevel: row.spcg_level,
    stageNo: row.stage_no,
    track: row.track,
    lessonFocus: row.lesson_focus,
    updatedAt: row.updated_at,
  }
}

function mapProblemSetItemRow(row: ProblemSetItemRow): ProblemSetItemSummary {
  return {
    levelId: row.level_id,
    title: row.title ?? row.level_id,
    position: row.position,
    label: row.label,
    required: row.required,
    displayMode: isProblemSetItemDisplayMode(row.display_mode) ? row.display_mode : 'primary',
    status: row.status,
    chapterId: row.chapter_id,
    order: row.order,
    knowledgePoint: row.knowledge_point,
    difficulty: row.difficulty,
  }
}

function mapLessonPlanProblemRow(row: LessonPlanProblemRow): LessonPlanProblem {
  const item = mapProblemSetItemRow(row)
  return {
    ...item,
    description: row.description,
    inputFormat: row.input_format,
    outputFormat: row.output_format,
    solution: row.solution,
    teacherNotes: row.teacher_notes,
    source: row.source,
    algorithmFamily: row.import_meta?.algorithmFamily ?? null,
    algorithms: Array.isArray(row.import_meta?.algorithms) ? row.import_meta.algorithms : [],
    publicCases: row.public_cases ?? [],
  }
}
