import { queryOne, withTransaction } from '@/lib/db'

export type StudentCurrentLevel = {
  userId: string
  levelId: string
  assignedBy: string | null
  reason: string | null
  updatedAt: string
}

type StudentCurrentLevelRow = {
  user_id: string
  level_id: string
  assigned_by: string | null
  reason: string | null
  updated_at: Date | string
}

export async function getStudentCurrentLevel(userId: string): Promise<StudentCurrentLevel | null> {
  let row: StudentCurrentLevelRow | null
  try {
    row = await queryOne<StudentCurrentLevelRow>(
      `
      SELECT user_id, level_id, assigned_by, reason, updated_at
      FROM student_current_levels
      WHERE user_id = $1
      `,
      [userId],
    )
  } catch (error) {
    if (isUndefinedTable(error)) return null
    throw error
  }

  return row ? mapStudentCurrentLevel(row) : null
}

export async function upsertStudentCurrentLevel(input: {
  userId: string
  levelId: string
  assignedBy?: string | null
  reason?: string | null
}): Promise<StudentCurrentLevel> {
  let row: StudentCurrentLevelRow | undefined
  try {
    row = await withTransaction(async (client) => {
      const before = await client.query<{ level_id: string }>(
        'SELECT level_id FROM student_current_levels WHERE user_id = $1 FOR UPDATE',
        [input.userId],
      )
      const previousLevelId = before.rows[0]?.level_id ?? null
      const saved = await client.query<StudentCurrentLevelRow>(
        `
        INSERT INTO student_current_levels (user_id, level_id, assigned_by, reason)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id)
        DO UPDATE SET
          level_id = EXCLUDED.level_id,
          assigned_by = EXCLUDED.assigned_by,
          reason = EXCLUDED.reason
        RETURNING user_id, level_id, assigned_by, reason, updated_at
        `,
        [input.userId, input.levelId, input.assignedBy ?? null, input.reason ?? null],
      )

      await client.query(
        `
        INSERT INTO student_current_level_events
          (student_user_id, previous_level_id, new_level_id, actor_user_id, reason)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [input.userId, previousLevelId, input.levelId, input.assignedBy ?? null, input.reason ?? null],
      )

      return saved.rows[0]
    })
  } catch (error) {
    if (isUndefinedTable(error)) {
      throw new Error('student_current_levels table is missing. Run npm run db:migrate before setting student current levels.')
    }
    throw error
  }

  if (!row) throw new Error('Failed to save student current level')
  return mapStudentCurrentLevel(row)
}

function isUndefinedTable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '42P01'
  )
}

function mapStudentCurrentLevel(row: StudentCurrentLevelRow): StudentCurrentLevel {
  return {
    userId: row.user_id,
    levelId: row.level_id,
    assignedBy: row.assigned_by,
    reason: row.reason,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
  }
}
