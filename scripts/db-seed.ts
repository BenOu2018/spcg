import pg, { type PoolClient } from 'pg'

const { Pool } = pg
const SPCG1_STAGE_TRACKS = ['A', 'B'] as const

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')

  const pool = new Pool({ connectionString: databaseUrl })
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query(
      `
      INSERT INTO problem_sets (id, title, description, type, status, visibility, metadata)
      VALUES (
        'ch1-mainline',
        '第一章主线关卡',
        '第一章新手村主线题单',
        'chapter',
        'published',
        'student',
        '{}'::jsonb
      )
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        type = EXCLUDED.type,
        status = EXCLUDED.status,
        visibility = EXCLUDED.visibility
      `,
    )

    const stages = await client.query<{
      id: string
      title: string
      knowledge_point: string
      order: number
    }>(
      `
      SELECT id, title, knowledge_point, "order"
      FROM levels
      WHERE chapter_id = 'ch1-mist-town'
        AND id ~ '^ch1-[0-9]{2}$'
        AND "order" BETWEEN 1 AND 12
      ORDER BY "order"
      `,
    )

    for (const stage of stages.rows) {
      const stageNo = stage.order
      const stageIdA = buildSpcg1StageId(stageNo, 'A')
      await upsertSpcg1Stage({
        client,
        stageId: stageIdA,
        stageNo,
        track: 'A',
        title: normalizeStageTitle(stage.title),
        description: `对应地图第${stageNo}关；主线题为 primary，同前缀变体题为 backup。`,
        lessonFocus: stage.knowledge_point,
      })

      const stageA = await client.query<{ title: string; description: string | null; lesson_focus: string | null }>(
        `
        SELECT title, description, lesson_focus
        FROM problem_sets
        WHERE id = $1
        `,
        [stageIdA],
      )

      await upsertSpcg1Stage({
        client,
        stageId: buildSpcg1StageId(stageNo, 'B'),
        stageNo,
        track: 'B',
        title: normalizeStageTitle(stageA.rows[0]?.title ?? stage.title),
        description:
          stageA.rows[0]?.description ??
          `对应地图第${stageNo}关；B线默认不放题，可从同关卡 A 线题目池导入。`,
        lessonFocus: stageA.rows[0]?.lesson_focus ?? stage.knowledge_point,
      })

      const existingAItems = await client.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM problem_set_items WHERE problem_set_id = $1',
        [stageIdA],
      )
      if (Number(existingAItems.rows[0]?.count ?? 0) > 0) continue

      const prefix = `ch1-${String(stageNo).padStart(2, '0')}`
      await client.query(
        `
        WITH stage_levels AS (
          SELECT
            id,
            knowledge_point,
            ROW_NUMBER() OVER (
              ORDER BY
                CASE WHEN id = $2 THEN 0 ELSE 1 END,
                "order" ASC,
                id ASC
            ) AS position,
            CASE WHEN id = $2 THEN 'primary' ELSE 'backup' END AS display_mode
          FROM levels
          WHERE chapter_id = 'ch1-mist-town'
            AND (
              id = $2
              OR id LIKE ($2 || '-%')
            )
        )
        INSERT INTO problem_set_items (problem_set_id, level_id, position, label, required, metadata)
        SELECT $1, id, position, knowledge_point, TRUE, jsonb_build_object('displayMode', display_mode)
        FROM stage_levels
        ORDER BY position
        ON CONFLICT (problem_set_id, level_id)
        DO UPDATE SET
          position = EXCLUDED.position,
          label = EXCLUDED.label,
          required = EXCLUDED.required,
          metadata = EXCLUDED.metadata
        `,
        [stageIdA, prefix],
      )
    }

    await client.query("DELETE FROM problem_set_items WHERE problem_set_id = 'ch1-mainline'")
    await client.query(
      `
      INSERT INTO problem_set_items (problem_set_id, level_id, position, label, required, metadata)
      SELECT 'ch1-mainline', id, "order", knowledge_point, TRUE, '{"displayMode":"primary"}'::jsonb
      FROM levels
      WHERE chapter_id = 'ch1-mist-town' AND "order" BETWEEN 1 AND 12
      ORDER BY "order"
      ON CONFLICT (problem_set_id, level_id)
      DO UPDATE SET
        position = EXCLUDED.position,
        label = EXCLUDED.label,
        required = EXCLUDED.required,
        metadata = EXCLUDED.metadata
      `,
    )

    await client.query('COMMIT')
    console.log(
      `Seeded default problem sets and ${stages.rows.length * SPCG1_STAGE_TRACKS.length} SPCG 1 curriculum stage slot(s).`,
    )
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

async function upsertSpcg1Stage(input: {
  client: PoolClient
  stageId: string
  stageNo: number
  track: (typeof SPCG1_STAGE_TRACKS)[number]
  title: string
  description: string
  lessonFocus: string
}) {
  await input.client.query(
    `
    INSERT INTO problem_sets
      (id, title, description, type, status, visibility, metadata, spcg_level, stage_no, track, lesson_focus)
    VALUES
      ($1, $2, $3, 'lesson', 'published', 'student', $4, 1, $5, $6, $7)
    ON CONFLICT (id)
    DO UPDATE SET
      type = EXCLUDED.type,
      status = EXCLUDED.status,
      visibility = EXCLUDED.visibility,
      metadata = problem_sets.metadata || EXCLUDED.metadata,
      spcg_level = EXCLUDED.spcg_level,
      stage_no = EXCLUDED.stage_no,
      track = EXCLUDED.track,
      lesson_focus = COALESCE(problem_sets.lesson_focus, EXCLUDED.lesson_focus),
      updated_at = NOW()
    `,
    [
      input.stageId,
      input.title,
      input.description,
      JSON.stringify({ source: 'db-seed', mapStage: input.stageNo, track: input.track }),
      input.stageNo,
      input.track,
      input.lessonFocus,
    ],
  )
}

function buildSpcg1StageId(stageNo: number, track: (typeof SPCG1_STAGE_TRACKS)[number]): string {
  return `spcg1-stage${String(stageNo).padStart(2, '0')}-${track.toLowerCase()}`
}

function normalizeStageTitle(title: string): string {
  return title.replace(/^SPCG\s*\d+级\s*第\d+关\s*([·:：-]\s*)?/, '').trim()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
