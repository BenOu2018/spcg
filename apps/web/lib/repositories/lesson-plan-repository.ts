import type { PoolClient } from 'pg'
import { query, withTransaction } from '@/lib/db'
import type { AdminAuditContext } from '@/lib/repositories/problem-set-repository'

export type LessonPlanSource = 'ai' | 'manual_edit'

export type LessonPlan = {
  id: string
  problemSetId: string
  version: number
  title: string
  markdown: string
  source: LessonPlanSource
  model: string | null
  promptSnapshot: string | null
  inputSnapshot: Record<string, unknown>
  createdBy: string | null
  createdAt: string
}

type LessonPlanRow = {
  id: string
  problem_set_id: string
  version: number
  title: string
  markdown: string
  source: LessonPlanSource
  model: string | null
  prompt_snapshot: string | null
  input_snapshot: Record<string, unknown> | null
  created_by: string | null
  created_at: string
} & Record<string, unknown>

export async function listLessonPlans(problemSetId: string): Promise<LessonPlan[]> {
  const rows = await query<LessonPlanRow>(
    `
    SELECT id, problem_set_id, version, title, markdown, source, model, prompt_snapshot,
           input_snapshot, created_by, created_at
    FROM lesson_plans
    WHERE problem_set_id = $1
    ORDER BY version DESC
    `,
    [problemSetId],
  )

  return rows.map(mapLessonPlanRow)
}

export async function createLessonPlanVersion(
  input: {
    problemSetId: string
    title: string
    markdown: string
    source: LessonPlanSource
    model: string | null
    promptSnapshot: string | null
    inputSnapshot: Record<string, unknown>
  },
  audit: AdminAuditContext,
): Promise<LessonPlan> {
  return withTransaction(async (client) => {
    const result = await client.query<LessonPlanRow>(
      `
      WITH next_version AS (
        SELECT COALESCE(MAX(version), 0) + 1 AS version
        FROM lesson_plans
        WHERE problem_set_id = $1
      )
      INSERT INTO lesson_plans
        (problem_set_id, version, title, markdown, source, model, prompt_snapshot, input_snapshot, created_by)
      SELECT $1, next_version.version, $2, $3, $4, $5, $6, $7, $8::uuid
      FROM next_version
      RETURNING id, problem_set_id, version, title, markdown, source, model, prompt_snapshot,
                input_snapshot, created_by, created_at
      `,
      [
        input.problemSetId,
        input.title,
        input.markdown,
        input.source,
        input.model,
        input.promptSnapshot,
        input.inputSnapshot,
        audit.userId,
      ],
    )

    const plan = result.rows[0]
    if (!plan) throw new Error('Lesson plan was not created')

    await insertAuditLog(
      client,
      audit,
      input.source === 'ai' ? 'lesson_plan.generate' : 'lesson_plan.manual_edit',
      'lesson_plan',
      plan.id,
      null,
      plan,
      { problemSetId: input.problemSetId, version: plan.version },
    )

    return mapLessonPlanRow(plan)
  })
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

function mapLessonPlanRow(row: LessonPlanRow): LessonPlan {
  return {
    id: row.id,
    problemSetId: row.problem_set_id,
    version: row.version,
    title: row.title,
    markdown: row.markdown,
    source: row.source,
    model: row.model,
    promptSnapshot: row.prompt_snapshot,
    inputSnapshot: row.input_snapshot ?? {},
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}
